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

// IMPORTANT: Sentry must be imported first for proper auto-instrumentation
import { Sentry } from './instrument.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';

import { runStartupMigrations } from './db/startupMigrations.js';
import { certificationRoutes } from './routes/certifications.js';
import { caseStudyRoutes } from './routes/caseStudies.js';
import { examRoutes } from './routes/exams.js';
import { questionRoutes } from './routes/questions.js';
import { progressRoutes } from './routes/progress.js';
import { studyRoutes } from './routes/study.js';
import { settingsRoutes } from './routes/settings.js';
import { drillRoutes } from './routes/drills.js';
import { achievementRoutes } from './routes/achievements.js';
import { bookmarkRoutes } from './routes/bookmarks.js';
import { noteRoutes } from './routes/notes.js';
import { authRoutes } from './routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';

const fastify = Fastify({
  logger: isProduction
    ? true // JSON logging in production
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      },
});

// Setup Sentry error handler for Fastify
// This captures all unhandled errors and sends them to Sentry
Sentry.setupFastifyErrorHandler(fastify);

// Register CORS
const allowedOrigins = isProduction
  ? [process.env.CORS_ORIGIN || 'https://certification-trainer.neilferis.com']
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

await fastify.register(cors, {
  origin: allowedOrigins,
  credentials: true,
});

// Register cookie plugin for auth
await fastify.register(cookie);

// Register global rate limiting (200 requests per minute)
// Increased from 100 to accommodate SPA navigation patterns
await fastify.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute',
  errorResponseBuilder: (request, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. You can make ${context.max} requests per ${context.after}. Try again later.`,
    retryAfter: context.after,
  }),
});

// API routes
fastify.register(authRoutes, { prefix: '/api/auth' });
fastify.register(certificationRoutes, { prefix: '/api/certifications' });
fastify.register(caseStudyRoutes, { prefix: '/api/case-studies' });
fastify.register(examRoutes, { prefix: '/api/exams' });
fastify.register(questionRoutes, { prefix: '/api/questions' });
fastify.register(progressRoutes, { prefix: '/api/progress' });
fastify.register(studyRoutes, { prefix: '/api/study' });
fastify.register(settingsRoutes, { prefix: '/api/settings' });
fastify.register(drillRoutes, { prefix: '/api/drills' });
fastify.register(achievementRoutes, { prefix: '/api/achievements' });
fastify.register(bookmarkRoutes, { prefix: '/api/bookmarks' });
fastify.register(noteRoutes, { prefix: '/api/notes' });

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Serve static files in production
if (isProduction) {
  const clientDistPath = join(__dirname, '../../client/dist');

  await fastify.register(fastifyStatic, {
    root: clientDistPath,
    prefix: '/',
  });

  // SPA fallback - serve index.html for client-side routes
  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not Found' });
    }
    return reply.sendFile('index.html');
  });
}

// Start server
const start = async () => {
  try {
    // Run database migrations before starting
    runStartupMigrations();

    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '127.0.0.1';
    await fastify.listen({ port, host });
    console.log(`\n ACE Prep API running at http://${host}:${port}`);
    console.log(' API endpoints:');
    console.log('   GET  /api/health');
    console.log('   GET  /api/auth/google-url');
    console.log('   POST /api/auth/google-callback');
    console.log('   POST /api/auth/refresh');
    console.log('   POST /api/auth/logout');
    console.log('   GET  /api/auth/me (protected)');
    console.log('   GET  /api/case-studies');
    console.log('   GET  /api/case-studies/:id');
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
