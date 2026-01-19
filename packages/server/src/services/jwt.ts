/**
 * JWT Utilities for Authentication
 *
 * Sign and verify access/refresh tokens using jsonwebtoken.
 * Uses config for secrets with dev fallbacks.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface JwtPayload {
  userId: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

/**
 * Sign an access token for the given user ID
 * @param userId - The user's database ID
 * @returns JWT access token with 1h expiry
 */
export function signAccessToken(userId: string): string {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    userId,
    type: 'access',
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessTokenExpiry,
  });
}

/**
 * Sign a refresh token for the given user ID
 * @param userId - The user's database ID
 * @returns JWT refresh token with 7d expiry
 */
export function signRefreshToken(userId: string): string {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    userId,
    type: 'refresh',
  };

  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTokenExpiry,
  });
}

/**
 * Verify an access token and return the decoded payload
 * @param token - JWT access token
 * @returns Decoded payload with userId
 * @throws JsonWebTokenError if invalid, TokenExpiredError if expired
 */
export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

  if (decoded.type !== 'access') {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }

  return decoded;
}

/**
 * Verify a refresh token and return the decoded payload
 * @param token - JWT refresh token
 * @returns Decoded payload with userId
 * @throws JsonWebTokenError if invalid, TokenExpiredError if expired
 */
export function verifyRefreshToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;

  if (decoded.type !== 'refresh') {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }

  return decoded;
}
