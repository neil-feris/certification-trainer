import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { Sentry } from '../instrument.js';
import { db } from '../db/index.js';
import { userSettings, caseStudies } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import type {
  GeneratedQuestion,
  Difficulty,
  DifficultyOption,
  LLMModel,
  AnthropicModel,
  OpenAIModel,
  CaseStudy,
} from '@ace-prep/shared';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  OPENAI_MODELS,
  usesMaxCompletionTokens,
} from '@ace-prep/shared';
import { mapCaseStudyRecord } from '../utils/mappers.js';

// Helper to fetch case study by ID and convert to shared type
export async function fetchCaseStudyById(caseStudyId: number): Promise<CaseStudy | null> {
  const [result] = await db.select().from(caseStudies).where(eq(caseStudies.id, caseStudyId));
  return mapCaseStudyRecord(result ?? null) ?? null;
}

// Helper to check if a model is an OpenAI model
function isOpenAIModel(model: string): model is OpenAIModel {
  return (OPENAI_MODELS as readonly string[]).includes(model);
}

const SYSTEM_PROMPT_ACE = `You are an expert Google Cloud Platform instructor creating practice questions for the Associate Cloud Engineer (ACE) certification exam.

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

const SYSTEM_PROMPT_PCA = `You are an expert Google Cloud Platform instructor creating practice questions for the Professional Cloud Architect (PCA) certification exam.

Your questions must:
1. Match the difficulty and style of real PCA exam questions
2. Test architectural decision-making and design patterns
3. Reference specific case study details when a case study is provided
4. Include realistic GCP service configurations and enterprise use cases
5. Have plausible distractors that test understanding of architectural trade-offs

Question format requirements:
- Single-select: One correct answer among 4 options
- Multi-select: 2-3 correct answers among 4-5 options (state how many to select)
- Options should be similar in length and structure
- Avoid "all of the above" or "none of the above"
- Avoid negative phrasing ("Which is NOT...")

Each question must include:
1. A realistic scenario or context (referencing case study if provided)
2. Clear options labeled A, B, C, D (and E if multi-select)
3. The correct answer(s)
4. A detailed explanation of why the answer is correct
5. Why each incorrect option is wrong
6. Related GCP services being tested`;

interface GenerateParams {
  domain: string;
  topic: string;
  difficulty: DifficultyOption;
  count: number;
  avoidConcepts?: string[];
  model?: LLMModel;
  userId: number;
  caseStudy?: CaseStudy;
  certificationCode?: string;
}

async function getApiConfig(userId: number) {
  // Helper to get a user setting by key
  const getUserSetting = async (key: string) => {
    const [setting] = await db
      .select()
      .from(userSettings)
      .where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)));
    return setting?.value;
  };

  const [provider, openaiKey, anthropicKey, anthropicModel, openaiModel] = await Promise.all([
    getUserSetting('llmProvider'),
    getUserSetting('openaiApiKey'),
    getUserSetting('anthropicApiKey'),
    getUserSetting('anthropicModel'),
    getUserSetting('openaiModel'),
  ]);

  return {
    provider: provider || 'anthropic',
    openaiApiKey: openaiKey,
    anthropicApiKey: anthropicKey,
    anthropicModel: (anthropicModel || DEFAULT_ANTHROPIC_MODEL) as AnthropicModel,
    openaiModel: (openaiModel || DEFAULT_OPENAI_MODEL) as OpenAIModel,
  };
}

function createUserPrompt(
  params: GenerateParams & { resolvedDifficulties?: Difficulty[] }
): string {
  const certName = params.certificationCode === 'PCA' ? 'PCA' : 'ACE';
  const difficultyInstruction =
    params.difficulty === 'mixed'
      ? `Generate ${params.count} ${certName} certification practice questions with a balanced mix of easy, medium, and hard difficulty levels.`
      : `Generate ${params.count} ${params.difficulty} difficulty ${certName} certification practice question(s).`;

  // Build case study context if provided
  let caseStudyContext = '';
  if (params.caseStudy) {
    const cs = params.caseStudy;
    caseStudyContext = `
CASE STUDY CONTEXT: ${cs.name}
You MUST base your questions on the following case study. Questions should reference specific details from this company's scenario.

Company Overview:
${cs.companyOverview}

Solution Concept:
${cs.solutionConcept}

Existing Technical Environment:
${cs.existingTechnicalEnvironment}

Business Requirements:
${cs.businessRequirements.map((req, i) => `${i + 1}. ${req}`).join('\n')}

Technical Requirements:
${cs.technicalRequirements.map((req, i) => `${i + 1}. ${req}`).join('\n')}

Executive Statement:
"${cs.executiveStatement}"

IMPORTANT: Each question should directly relate to this case study's specific business needs, technical constraints, or requirements. Reference the company name (${cs.name}) and specific details from the scenario.
`;
  }

  return `${difficultyInstruction}

Domain: ${params.domain}
Topic: ${params.topic}
${params.avoidConcepts?.length ? `Avoid these recently tested concepts: ${params.avoidConcepts.join(', ')}` : ''}
${params.difficulty === 'mixed' ? `\nFor mixed difficulty: Generate approximately equal numbers of easy, medium, and hard questions. Mark each question with its actual difficulty in the response.` : ''}
${caseStudyContext}
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
- Return ONLY valid JSON, no markdown code blocks
- CRITICAL: Do NOT include difficulty level in the questionText field (e.g., do NOT start with "Difficulty: Hard"). The difficulty should ONLY appear in the "difficulty" JSON field.`;
}

export async function generateQuestions(params: GenerateParams): Promise<GeneratedQuestion[]> {
  const config = await getApiConfig(params.userId);

  // Select system prompt based on certification
  const systemPrompt = params.certificationCode === 'PCA' ? SYSTEM_PROMPT_PCA : SYSTEM_PROMPT_ACE;

  // Determine which provider to use: explicit param > settings > default
  // OpenAI models: gpt-*, o3, o4-mini; Anthropic models: claude-*
  const useOpenAIProvider = params.model
    ? isOpenAIModel(params.model)
    : config.provider === 'openai';

  const provider = useOpenAIProvider ? 'openai' : 'anthropic';
  const model = useOpenAIProvider
    ? params.model && isOpenAIModel(params.model)
      ? params.model
      : config.openaiModel
    : params.model && !isOpenAIModel(params.model)
      ? (params.model as AnthropicModel)
      : config.anthropicModel;

  return Sentry.startSpan(
    {
      op: 'ai.generate',
      name: 'Generate Questions',
    },
    async (span) => {
      // Add generation context attributes
      span.setAttribute('ai.provider', provider);
      span.setAttribute('ai.model', model);
      span.setAttribute('generation.domain', params.domain);
      span.setAttribute('generation.topic', params.topic);
      span.setAttribute('generation.difficulty', params.difficulty);
      span.setAttribute('generation.count', params.count);
      span.setAttribute('generation.certification', params.certificationCode || 'ACE');
      if (params.caseStudy) {
        span.setAttribute('generation.case_study', params.caseStudy.name);
      }

      try {
        if (!useOpenAIProvider) {
          // Anthropic
          if (!config.anthropicApiKey) {
            throw new Error('Anthropic API key not configured. Please set it in Settings.');
          }

          const client = new Anthropic({ apiKey: config.anthropicApiKey });

          const response = await client.messages.create({
            model,
            max_tokens: 4096,
            system: systemPrompt,
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
            const questions = validateQuestions(parsed.questions, params.difficulty);
            span.setAttribute('generation.questions_generated', questions.length);
            return questions;
          } catch (parseError) {
            console.error('Failed to parse Anthropic response:', content.text);
            Sentry.captureException(parseError, {
              extra: {
                provider: 'anthropic',
                model,
                domain: params.domain,
                topic: params.topic,
                responseText: content.text.substring(0, 1000),
              },
            });
            throw new Error('Failed to parse generated questions');
          }
        } else {
          // OpenAI
          if (!config.openaiApiKey) {
            throw new Error('OpenAI API key not configured. Please set it in Settings.');
          }

          const client = new OpenAI({ apiKey: config.openaiApiKey });

          const response = await client.chat.completions.create({
            model,
            ...(usesMaxCompletionTokens(model as OpenAIModel)
              ? { max_completion_tokens: 4096 }
              : { max_tokens: 4096 }),
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: createUserPrompt(params) },
            ],
          });

          const content = response.choices[0].message.content;
          if (!content) {
            throw new Error('Empty response from OpenAI');
          }

          try {
            const parsed = JSON.parse(content);
            const questions = validateQuestions(parsed.questions, params.difficulty);
            span.setAttribute('generation.questions_generated', questions.length);
            return questions;
          } catch (parseError) {
            console.error('Failed to parse OpenAI response:', content);
            Sentry.captureException(parseError, {
              extra: {
                provider: 'openai',
                model,
                domain: params.domain,
                topic: params.topic,
                responseText: content.substring(0, 1000),
              },
            });
            throw new Error('Failed to parse generated questions');
          }
        }
      } catch (error) {
        // Capture the error with full context
        Sentry.captureException(error, {
          extra: {
            provider,
            model,
            domain: params.domain,
            topic: params.topic,
            difficulty: params.difficulty,
            count: params.count,
            certification: params.certificationCode || 'ACE',
            caseStudy: params.caseStudy?.name,
          },
        });
        throw error;
      }
    }
  );
}

function validateQuestions(
  questions: any[],
  requestedDifficulty: DifficultyOption
): GeneratedQuestion[] {
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

    // For non-mixed difficulty, use the requested difficulty
    // For mixed, trust the LLM's assigned difficulty or default to medium
    const difficulty: Difficulty =
      requestedDifficulty === 'mixed'
        ? ['easy', 'medium', 'hard'].includes(q.difficulty)
          ? q.difficulty
          : 'medium'
        : requestedDifficulty;

    // Strip difficulty prefix if LLM included it in questionText (e.g., "Difficulty: Easy ...")
    const cleanedQuestionText = q.questionText
      .replace(/^Difficulty:\s*(easy|medium|hard)[.:\s]*/i, '')
      .trim();

    return {
      questionText: cleanedQuestionText,
      questionType: q.questionType,
      options: q.options,
      correctAnswers: q.correctAnswers,
      explanation: q.explanation,
      gcpServices: q.gcpServices || [],
      difficulty,
    };
  });
}
