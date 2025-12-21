import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { examRoutes } from './routes/exams.js';
import { questionRoutes } from './routes/questions.js';
import { progressRoutes } from './routes/progress.js';
import { studyRoutes } from './routes/study.js';
import { settingsRoutes } from './routes/settings.js';

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

// API routes
fastify.register(examRoutes, { prefix: '/api/exams' });
fastify.register(questionRoutes, { prefix: '/api/questions' });
fastify.register(progressRoutes, { prefix: '/api/progress' });
fastify.register(studyRoutes, { prefix: '/api/study' });
fastify.register(settingsRoutes, { prefix: '/api/settings' });

// Health check
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('\n🚀 ACE Prep API running at http://localhost:3001');
    console.log('📚 API endpoints:');
    console.log('   GET  /api/health');
    console.log('   GET  /api/exams');
    console.log('   POST /api/exams');
    console.log('   GET  /api/questions');
    console.log('   POST /api/questions/generate');
    console.log('   GET  /api/progress/dashboard');
    console.log('   GET  /api/study/domains');
    console.log('   GET  /api/settings\n');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
