import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { updateSettingsSchema, testApiSchema, formatZodError } from '../validation/schemas.js';

const DEFAULT_SETTINGS: Record<string, string | number> = {
  llmProvider: 'anthropic',
  openaiApiKey: '',
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-4-20250514',
  openaiModel: 'gpt-4o',
  examDurationMinutes: 120,
  questionsPerExam: 50,
};

export async function settingsRoutes(fastify: FastifyInstance) {
  // Get current settings
  fastify.get('/', async () => {
    const allSettings = await db.select().from(settings);

    const dbValues: Record<string, string> = {};
    for (const s of allSettings) {
      dbValues[s.key] = s.value;
    }

    // Return boolean flags for API keys instead of exposing any key data
    return {
      llmProvider: dbValues.llmProvider || DEFAULT_SETTINGS.llmProvider,
      hasOpenaiKey: Boolean(dbValues.openaiApiKey && dbValues.openaiApiKey.length > 0),
      hasAnthropicKey: Boolean(dbValues.anthropicApiKey && dbValues.anthropicApiKey.length > 0),
      anthropicModel: dbValues.anthropicModel || DEFAULT_SETTINGS.anthropicModel,
      openaiModel: dbValues.openaiModel || DEFAULT_SETTINGS.openaiModel,
      examDurationMinutes:
        Number(dbValues.examDurationMinutes) || DEFAULT_SETTINGS.examDurationMinutes,
      questionsPerExam: Number(dbValues.questionsPerExam) || DEFAULT_SETTINGS.questionsPerExam,
    };
  });

  // Update settings
  fastify.patch<{
    Body: Partial<{
      llmProvider: 'openai' | 'anthropic';
      openaiApiKey: string;
      anthropicApiKey: string;
      anthropicModel: string;
      openaiModel: string;
      examDurationMinutes: number;
      questionsPerExam: number;
    }>;
  }>('/', async (request, reply) => {
    const parseResult = updateSettingsSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const updates = parseResult.data;
    const now = new Date();

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null) {
        // Upsert setting
        const [existing] = await db.select().from(settings).where(eq(settings.key, key));

        if (existing) {
          await db
            .update(settings)
            .set({ value: String(value), updatedAt: now })
            .where(eq(settings.key, key));
        } else {
          await db.insert(settings).values({
            key,
            value: String(value),
            updatedAt: now,
          });
        }
      }
    }

    return { success: true };
  });

  // Test API connection
  fastify.post<{
    Body: { provider: 'openai' | 'anthropic'; apiKey: string };
  }>('/test-api', async (request, reply) => {
    const parseResult = testApiSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(formatZodError(parseResult.error));
    }
    const { provider, apiKey } = parseResult.data;

    try {
      if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey });
        await client.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "connected"' }],
        });
        return { success: true, message: 'Anthropic API connected successfully' };
      } else {
        const client = new OpenAI({ apiKey });
        await client.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "connected"' }],
        });
        return { success: true, message: 'OpenAI API connected successfully' };
      }
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: 'API connection failed',
        message: error.message,
      });
    }
  });

  // SECURITY: API key retrieval endpoint REMOVED
  // API keys should NEVER be exposed via HTTP endpoints.
  // Use getApiKey() helper from db/index.js for internal server-side use only.
}
