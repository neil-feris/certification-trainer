import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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

    const result: Record<string, string | number> = { ...DEFAULT_SETTINGS };
    for (const s of allSettings) {
      result[s.key] = s.value;
    }

    // Mask API keys for security
    if (result.openaiApiKey && typeof result.openaiApiKey === 'string') {
      result.openaiApiKey = result.openaiApiKey.slice(0, 10) + '...' + result.openaiApiKey.slice(-4);
    }
    if (result.anthropicApiKey && typeof result.anthropicApiKey === 'string') {
      result.anthropicApiKey = result.anthropicApiKey.slice(0, 10) + '...' + result.anthropicApiKey.slice(-4);
    }

    return result;
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
  }>('/', async (request) => {
    const updates = request.body;
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
    const { provider, apiKey } = request.body;

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

  // Get raw API key (for internal use only, not exposed to frontend)
  fastify.get('/api-key/:provider', async (request: any, reply) => {
    const { provider } = request.params;
    const key = provider === 'openai' ? 'openaiApiKey' : 'anthropicApiKey';

    const [setting] = await db.select().from(settings).where(eq(settings.key, key));

    if (!setting || !setting.value) {
      return reply.status(404).send({ error: 'API key not configured' });
    }

    return { apiKey: setting.value };
  });
}
