import { FastifyInstance } from 'fastify';

/**
 * Zod Validation Enforcement Plugin
 *
 * Logs warnings at startup for POST/PUT/PATCH routes that lack schema validation.
 * This is a development aid — it does not block requests, only logs warnings
 * so developers know which routes need validation added.
 */
export async function zodValidationPlugin(fastify: FastifyInstance): Promise<void> {
  const methodsRequiringValidation = new Set(['POST', 'PUT', 'PATCH']);

  fastify.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    const needsValidation = methods.some((m) => methodsRequiringValidation.has(m));

    if (!needsValidation) return;

    // Skip auth routes — they use OAuth flows with their own validation
    if (routeOptions.url.startsWith('/api/auth')) return;

    // Check if route has Fastify-level schema validation (body schema)
    const hasSchema = routeOptions.schema?.body !== undefined;

    if (!hasSchema) {
      fastify.log.warn(
        `[zod-validation] ${methods.join('/')} ${routeOptions.url} — no body schema defined. ` +
          `Ensure Zod validation is applied in the handler.`
      );
    }
  });
}
