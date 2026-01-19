/**
 * Server Configuration
 *
 * Loads environment variables with sensible defaults for development.
 * In production, all required variables must be set.
 */

const isProduction = process.env.NODE_ENV === 'production';

// Validate required env vars in production
function requireEnv(name: string): string {
  const value = process.env[name];
  if (isProduction && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || '';
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '127.0.0.1',
  isProduction,
  corsOrigin: process.env.CORS_ORIGIN || 'https://certification-trainer.neilferis.com',

  // Google OAuth
  google: {
    clientId: requireEnv('GOOGLE_CLIENT_ID'),
    clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/auth/callback',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret-not-for-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret-not-for-production',
    accessTokenExpiry: '1h',
    refreshTokenExpiry: '7d',
  },
} as const;

// Warn about insecure defaults in development
if (!isProduction) {
  if (!process.env.JWT_SECRET) {
    console.warn('Warning: Using default JWT_SECRET - not secure for production');
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    console.warn('Warning: Using default JWT_REFRESH_SECRET - not secure for production');
  }
}

export type Config = typeof config;
