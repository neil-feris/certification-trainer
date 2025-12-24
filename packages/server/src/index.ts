/**
 * ACE Exam Prep API Server
 *
 * SECURITY WARNING: This server is designed for SINGLE-USER LOCAL use only.
 *
 * There is NO authentication or authorization implemented on any endpoint.
 * All data is accessible to anyone with network access to this server.
 *
 * DO NOT deploy to production or multi-user environments without:
 * 1. Implementing user authentication (JWT, OAuth, session cookies)
 * 2. Adding user ownership to all data tables
 * 3. Implementing authorization checks on all endpoints
 * 4. Adding user-based rate limiting
 * 5. Securing API key storage with proper encryption
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { examRoutes } from './routes/exams.js';
import { questionRoutes } from './routes/questions.js';
import { progressRoutes } from './routes/progress.js';
import { studyRoutes } from './routes/study.js';
import { settingsRoutes } from './routes/settings.js';
import { drillRoutes } from './routes/drills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register CORS
await fastify.register(cors, {
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
});

// Register global rate limiting (100 requests per minute)
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: (request, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. You can make ${context.max} requests per ${context.after}. Try again later.`,
    retryAfter: context.after,
  }),
});

// API routes
fastify.register(examRoutes, { prefix: '/api/exams' });
fastify.register(questionRoutes, { prefix: '/api/questions' });
fastify.register(progressRoutes, { prefix: '/api/progress' });
fastify.register(studyRoutes, { prefix: '/api/study' });
fastify.register(settingsRoutes, { prefix: '/api/settings' });
fastify.register(drillRoutes, { prefix: '/api/drills' });

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('\n ACE Prep API running at http://localhost:3001');
    console.log(' API endpoints:');
    console.log('   GET  /api/health');
    console.log('   GET  /api/exams');
    console.log('   POST /api/exams');
    console.log('   GET  /api/questions');
    console.log('   POST /api/questions/generate (rate limit: 5/min)');
    console.log('   POST /api/study/summary (rate limit: 10/min)');
    console.log('   POST /api/study/explain (rate limit: 20/min)');
    console.log('   GET  /api/progress/dashboard');
    console.log('   GET  /api/study/domains');
    console.log('   POST /api/drills');
    console.log('   GET  /api/settings\n');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
