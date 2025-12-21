import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { GeneratedQuestion, Difficulty } from '@ace-prep/shared';

const SYSTEM_PROMPT = `You are an expert Google Cloud Platform instructor creating practice questions for the Associate Cloud Engineer (ACE) certification exam.

Your questions must:
1. Match the difficulty and style of real ACE exam questions
2. Test practical, scenario-based knowledge (not just memorization)
3. Include realistic GCP service configurations and use cases
4. Have plausible distractors that test understanding of common misconceptions

Question format requirements:
- Single-select: One correct answer among 4 options
- Multi-select: 2-3 correct answers among 4-5 options (state how many to select)
- Options should be similar in length and structure
- Avoid "all of the above" or "none of the above"
- Avoid negative phrasing ("Which is NOT...")

Each question must include:
1. A realistic scenario or context
2. Clear options labeled A, B, C, D (and E if multi-select)
3. The correct answer(s)
4. A detailed explanation of why the answer is correct
5. Why each incorrect option is wrong
6. Related GCP services being tested`;

interface GenerateParams {
  domain: string;
  topic: string;
  difficulty: Difficulty;
  count: number;
  avoidConcepts?: string[];
}

async function getApiConfig() {
  const [provider] = await db.select().from(settings).where(eq(settings.key, 'llmProvider'));
  const [openaiKey] = await db.select().from(settings).where(eq(settings.key, 'openaiApiKey'));
  const [anthropicKey] = await db.select().from(settings).where(eq(settings.key, 'anthropicApiKey'));

  return {
    provider: provider?.value || 'anthropic',
    openaiApiKey: openaiKey?.value,
    anthropicApiKey: anthropicKey?.value,
  };
}

function createUserPrompt(params: GenerateParams): string {
  return `Generate ${params.count} ${params.difficulty} difficulty ACE certification practice question(s).

Domain: ${params.domain}
Topic: ${params.topic}
${params.avoidConcepts?.length ? `Avoid these recently tested concepts: ${params.avoidConcepts.join(', ')}` : ''}

Respond with valid JSON matching this exact schema:
{
  "questions": [
    {
      "questionText": "string - the scenario and question",
      "questionType": "single" or "multiple",
      "options": ["A. option text", "B. option text", "C. option text", "D. option text"],
      "correctAnswers": [0],
      "explanation": "string - detailed explanation",
      "gcpServices": ["Service1", "Service2"],
      "difficulty": "${params.difficulty}"
    }
  ]
}

IMPORTANT:
- correctAnswers is an array of 0-based indices
- For single-select, correctAnswers should have exactly 1 element
- For multiple-select, correctAnswers should have 2-3 elements
- Return ONLY valid JSON, no markdown code blocks`;
}

export async function generateQuestions(params: GenerateParams): Promise<GeneratedQuestion[]> {
  const config = await getApiConfig();

  if (config.provider === 'anthropic') {
    if (!config.anthropicApiKey) {
      throw new Error('Anthropic API key not configured. Please set it in Settings.');
    }

    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: createUserPrompt(params),
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }

    try {
      const parsed = JSON.parse(content.text);
      return validateQuestions(parsed.questions);
    } catch (e) {
      console.error('Failed to parse Anthropic response:', content.text);
      throw new Error('Failed to parse generated questions');
    }
  } else {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured. Please set it in Settings.');
    }

    const client = new OpenAI({ apiKey: config.openaiApiKey });

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: createUserPrompt(params) },
      ],
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    try {
      const parsed = JSON.parse(content);
      return validateQuestions(parsed.questions);
    } catch (e) {
      console.error('Failed to parse OpenAI response:', content);
      throw new Error('Failed to parse generated questions');
    }
  }
}

function validateQuestions(questions: any[]): GeneratedQuestion[] {
  if (!Array.isArray(questions)) {
    throw new Error('Expected questions array');
  }

  return questions.map((q, i) => {
    if (!q.questionText || typeof q.questionText !== 'string') {
      throw new Error(`Question ${i + 1}: missing or invalid questionText`);
    }
    if (!q.questionType || !['single', 'multiple'].includes(q.questionType)) {
      throw new Error(`Question ${i + 1}: invalid questionType`);
    }
    if (!Array.isArray(q.options) || q.options.length < 4) {
      throw new Error(`Question ${i + 1}: need at least 4 options`);
    }
    if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
      throw new Error(`Question ${i + 1}: missing correctAnswers`);
    }
    if (!q.explanation || typeof q.explanation !== 'string') {
      throw new Error(`Question ${i + 1}: missing explanation`);
    }

    return {
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options,
      correctAnswers: q.correctAnswers,
      explanation: q.explanation,
      gcpServices: q.gcpServices || [],
      difficulty: q.difficulty || 'medium',
    };
  });
}
