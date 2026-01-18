import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { LearningPathSummary } from '@ace-prep/shared';

const LEARNING_PATH_SUMMARY_SYSTEM = `You are a Google Cloud Platform certification study guide author creating comprehensive learning summaries for certification candidates.

Your task is to create structured summaries that help students:
1. Understand the core concepts before diving into hands-on labs
2. Know what to focus on for the certification exam
3. Connect theory to practical applications
4. Avoid common misconceptions and exam traps

Output your response as valid JSON with this exact structure:
{
  "overview": "2-3 paragraph comprehensive overview of the topic",
  "keyTakeaways": ["5-7 key points students must remember"],
  "importantConcepts": ["4-6 technical concepts with brief explanations"],
  "examTips": ["3-5 specific tips for the certification exam"]
}`;

interface LearningPathItemData {
  title: string;
  description: string;
  topics: string[];
  whyItMatters: string;
  type: 'course' | 'skill_badge' | 'exam';
}

interface GeneratedSummary {
  overview: string;
  keyTakeaways: string[];
  importantConcepts: string[];
  examTips: string[];
}

async function getApiConfig() {
  const [provider] = await db.select().from(settings).where(eq(settings.key, 'llmProvider'));
  const [openaiKey] = await db.select().from(settings).where(eq(settings.key, 'openaiApiKey'));
  const [anthropicKey] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'anthropicApiKey'));

  return {
    provider: provider?.value || 'anthropic',
    openaiApiKey: openaiKey?.value,
    anthropicApiKey: anthropicKey?.value,
  };
}

function buildUserPrompt(item: LearningPathItemData): string {
  const typeLabel =
    item.type === 'course'
      ? 'Course'
      : item.type === 'skill_badge'
        ? 'Skill Badge / Hands-on Lab'
        : 'Practice Exam';

  return `Create a comprehensive study summary for this Google Cloud learning path item:

Type: ${typeLabel}
Title: ${item.title}
Description: ${item.description}

Topics Covered:
${item.topics.map((t) => `- ${t}`).join('\n')}

Why It Matters:
${item.whyItMatters}

Generate a detailed summary that:
1. Provides a thorough overview connecting all the topics
2. Lists the most critical takeaways for exam preparation
3. Explains the important technical concepts students need to understand
4. Includes specific exam tips based on how these topics are typically tested

Remember: Output ONLY valid JSON matching the required structure.`;
}

function parseJsonResponse(text: string): GeneratedSummary {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `No JSON found in LLM response. Raw text (first 500 chars): ${text.slice(0, 500)}...`
    );
  }

  let parsed: GeneratedSummary;
  try {
    parsed = JSON.parse(jsonMatch[0]) as GeneratedSummary;
  } catch (e) {
    const parseError = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Invalid JSON from LLM: ${parseError}. Extracted JSON (first 300 chars): ${jsonMatch[0].slice(0, 300)}...`
    );
  }

  // Validate required fields
  if (!parsed.overview || typeof parsed.overview !== 'string') {
    throw new Error('Invalid response structure: missing or invalid overview');
  }
  if (!Array.isArray(parsed.keyTakeaways)) {
    throw new Error('Invalid response structure: keyTakeaways must be an array');
  }
  if (!Array.isArray(parsed.importantConcepts)) {
    throw new Error('Invalid response structure: importantConcepts must be an array');
  }
  if (!Array.isArray(parsed.examTips)) {
    throw new Error('Invalid response structure: examTips must be an array');
  }

  return parsed;
}

export async function generateLearningPathSummary(
  item: LearningPathItemData,
  pathItemOrder: number,
  certificationId: number
): Promise<Omit<LearningPathSummary, 'id'>> {
  const config = await getApiConfig();
  const userPrompt = buildUserPrompt(item);

  let responseText: string;

  if (config.provider === 'anthropic') {
    if (!config.anthropicApiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: LEARNING_PATH_SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }
    responseText = content.text;
  } else {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2048,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: LEARNING_PATH_SUMMARY_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    });

    responseText = response.choices[0].message.content || '';
  }

  const parsed = parseJsonResponse(responseText);

  return {
    pathItemOrder,
    certificationId,
    overview: parsed.overview,
    keyTakeaways: parsed.keyTakeaways,
    importantConcepts: parsed.importantConcepts,
    examTips: parsed.examTips,
    relatedTopicIds: [], // Will be populated by the route based on topic matching
    generatedAt: new Date(),
    isEnhanced: true,
  };
}
