import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const STUDY_SUMMARY_SYSTEM = `You are a Google Cloud Platform study guide author creating targeted review material for ACE certification candidates.

Create study summaries that:
1. Focus on practical exam-relevant knowledge
2. Include key commands, configurations, and best practices
3. Highlight common exam traps and misconceptions
4. Use tables and bullet points for quick reference
5. Include memory aids and mnemonics where helpful
6. Are formatted in clean Markdown`;

const EXPLANATION_SYSTEM = `You are a patient Google Cloud Platform tutor helping a student understand why they got an ACE certification question wrong.

Your explanations should:
1. Acknowledge the student's answer and why it might seem reasonable
2. Clearly explain why the correct answer is right
3. Highlight the key GCP concepts being tested
4. Provide a memorable way to remember the correct approach
5. Reference relevant GCP documentation concepts (not URLs)
6. Keep explanations concise but thorough (200-400 words)`;

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

interface StudySummaryParams {
  domain: string;
  topic?: string;
  weakPoints: string[];
}

export async function generateStudySummary(params: StudySummaryParams): Promise<string> {
  const config = await getApiConfig();

  const userPrompt = `Create a focused study summary for a student preparing for the ACE certification.

Domain: ${params.domain}
${params.topic ? `Topic: ${params.topic}` : ''}

Areas of weakness based on recent performance:
${params.weakPoints.length > 0 ? params.weakPoints.map((p) => `- ${p}`).join('\n') : '- General review needed'}

Generate a 500-800 word study guide in Markdown format that:
1. Covers the key concepts for this ${params.topic ? 'topic' : 'domain'}
2. Addresses the weak points identified above
3. Includes practical examples and gcloud commands
4. Highlights exam tips and common mistakes`;

  if (config.provider === 'anthropic') {
    if (!config.anthropicApiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: STUDY_SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    return content.text;
  } else {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: STUDY_SUMMARY_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    });

    return response.choices[0].message.content || '';
  }
}

interface ExplanationParams {
  question: string;
  options: string[];
  userAnswers: number[];
  correctAnswers: number[];
  domain: string;
  topic: string;
}

export async function generateExplanation(params: ExplanationParams): Promise<string> {
  const config = await getApiConfig();

  const userPrompt = `The student answered this question incorrectly:

Domain: ${params.domain}
Topic: ${params.topic}

Question: ${params.question}

Options:
${params.options.join('\n')}

Student selected: ${params.userAnswers.map((i) => params.options[i]).join(', ')}
Correct answer(s): ${params.correctAnswers.map((i) => params.options[i]).join(', ')}

Provide a helpful, encouraging explanation that helps them understand and remember the correct concept. Focus on:
1. Why their answer was incorrect
2. Why the correct answer is right
3. A way to remember this for the exam`;

  if (config.provider === 'anthropic') {
    if (!config.anthropicApiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: EXPLANATION_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    return content.text;
  } else {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: EXPLANATION_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    });

    return response.choices[0].message.content || '';
  }
}
