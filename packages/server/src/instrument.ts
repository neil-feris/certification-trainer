/**
 * Sentry Instrumentation for ACE Prep Server
 *
 * IMPORTANT: This file must be imported before any other modules
 * to ensure proper auto-instrumentation of all dependencies.
 */

import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://7e9268ecf4371353a1325efcc214dc4e@o4510750025056256.ingest.de.sentry.io/4510750425153616',

  // Enable tracing for performance monitoring
  tracesSampleRate: 1.0,

  // Enable structured logging
  enableLogs: true,

  // Include Fastify integration for automatic request tracing
  integrations: [Sentry.fastifyIntegration()],

  // Send default PII for better error context (user IP, etc.)
  sendDefaultPii: true,
});

export { Sentry };
