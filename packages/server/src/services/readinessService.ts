/**
 * Readiness Score Calculation Service
 *
 * Calculates exam readiness using weighted algorithm:
 * - Coverage (20%): proportion of domains with 10+ attempts
 * - Accuracy (50%): weighted average of domain accuracies (by domain.weight)
 * - Recency (20%): exponential decay e^(-days/30) on last attempt per domain
 * - Volume (10%): ratio of total attempts vs threshold (capped at 1.0)
 */

import { eq, and, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schemaTypes from '../db/schema.js';
import { domains, performanceStats } from '../db/schema.js';
import type {
  ReadinessScore,
  DomainReadiness,
  ReadinessRecommendation,
  ConfidenceLevel,
} from '@ace-prep/shared';

type DB = BetterSQLite3Database<typeof schemaTypes>;

// =============================================================================
// In-memory cache with TTL
// =============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

type ReadinessResult = { score: ReadinessScore; recommendations: ReadinessRecommendation[] };

const cache = new Map<string, CacheEntry<ReadinessResult>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000; // Prevent unbounded growth

function getCached(key: string): ReadinessResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Move to end for LRU behavior (Map maintains insertion order)
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function setCache(key: string, value: ReadinessResult): void {
  // Evict oldest entries if at capacity (LRU eviction)
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Invalidate cached readiness score for a user/certification.
 * Call this when exam results are submitted or stats change.
 *
 * TODO: Wire this up in exam completion flow and study session completion.
 */
export function invalidateReadinessCache(userId: number, certificationId: number): void {
  cache.delete(`readiness:${userId}:${certificationId}`);
}

/**
 * Invalidate all cached readiness scores for a user (all certifications).
 * Useful when bulk stats change.
 */
export function invalidateAllReadinessCacheForUser(userId: number): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`readiness:${userId}:`)) {
      cache.delete(key);
    }
  }
}

const COVERAGE_WEIGHT = 0.20;
const ACCURACY_WEIGHT = 0.50;
const RECENCY_WEIGHT = 0.20;
const VOLUME_WEIGHT = 0.10;

const COVERAGE_THRESHOLD = 10; // attempts per domain to count as "covered"
const VOLUME_THRESHOLD = 100; // total attempts for max volume score
const RECENCY_HALF_LIFE_DAYS = 30; // decay constant for recency

interface DomainStats {
  domainId: number;
  domainName: string;
  domainWeight: number;
  totalAttempts: number;
  correctAttempts: number;
  lastAttemptAt: Date | null;
}

/**
 * Calculate the readiness score for a user on a specific certification.
 * Results are cached for 5 minutes to reduce database load.
 */
export async function calculateReadinessScore(
  userId: number,
  certificationId: number,
  db: DB
): Promise<ReadinessResult> {
  const cacheKey = `readiness:${userId}:${certificationId}`;

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  // Get all domains for this certification
  const certDomains = await db
    .select({
      id: domains.id,
      name: domains.name,
      weight: domains.weight,
    })
    .from(domains)
    .where(eq(domains.certificationId, certificationId))
    .all();

  if (certDomains.length === 0) {
    return {
      score: {
        overall: 0,
        confidence: 'low',
        domains: [],
        calculatedAt: new Date().toISOString(),
      },
      recommendations: [],
    };
  }

  // Get performance stats per domain for this user
  const stats = await db
    .select({
      domainId: performanceStats.domainId,
      totalAttempts: performanceStats.totalAttempts,
      correctAttempts: performanceStats.correctAttempts,
      lastAttemptedAt: performanceStats.lastAttemptedAt,
    })
    .from(performanceStats)
    .where(
      and(
        eq(performanceStats.userId, userId),
        inArray(performanceStats.domainId, certDomains.map(d => d.id))
      )
    )
    .all();

  // Build domain stats map
  const statsMap = new Map<number, { totalAttempts: number; correctAttempts: number; lastAttemptedAt: Date | null }>();
  for (const stat of stats) {
    const existing = statsMap.get(stat.domainId);
    if (existing) {
      existing.totalAttempts += stat.totalAttempts;
      existing.correctAttempts += stat.correctAttempts;
      if (stat.lastAttemptedAt && (!existing.lastAttemptedAt || stat.lastAttemptedAt > existing.lastAttemptedAt)) {
        existing.lastAttemptedAt = stat.lastAttemptedAt;
      }
    } else {
      statsMap.set(stat.domainId, {
        totalAttempts: stat.totalAttempts,
        correctAttempts: stat.correctAttempts,
        lastAttemptedAt: stat.lastAttemptedAt,
      });
    }
  }

  // Calculate per-domain readiness
  const now = new Date();
  const domainReadiness: DomainReadiness[] = certDomains.map((domain) => {
    const domainStats = statsMap.get(domain.id);
    const totalAttempts = domainStats?.totalAttempts ?? 0;
    const correctAttempts = domainStats?.correctAttempts ?? 0;
    const lastAttemptAt = domainStats?.lastAttemptedAt ?? null;

    // Coverage: 1.0 if 10+ attempts, proportional otherwise
    const coverage = Math.min(totalAttempts / COVERAGE_THRESHOLD, 1.0);

    // Accuracy: correct/total (0 if no attempts)
    const accuracy = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

    // Recency: exponential decay e^(-days/30)
    let recency = 0;
    if (lastAttemptAt) {
      const daysSince = (now.getTime() - lastAttemptAt.getTime()) / (1000 * 60 * 60 * 24);
      recency = Math.exp(-daysSince / RECENCY_HALF_LIFE_DAYS);
    }

    // Volume: ratio of attempts vs threshold (capped at 1.0)
    const volume = Math.min(totalAttempts / VOLUME_THRESHOLD, 1.0);

    // Composite domain score (0-100)
    const score = (
      coverage * COVERAGE_WEIGHT +
      accuracy * ACCURACY_WEIGHT +
      recency * RECENCY_WEIGHT +
      volume * VOLUME_WEIGHT
    ) * 100;

    return {
      domainId: domain.id,
      domainName: domain.name,
      domainWeight: domain.weight,
      score: Math.round(score * 100) / 100,
      coverage: Math.round(coverage * 100) / 100,
      accuracy: Math.round(accuracy * 100) / 100,
      recency: Math.round(recency * 100) / 100,
      volume: Math.round(volume * 100) / 100,
      totalAttempts,
      lastAttemptAt: lastAttemptAt?.toISOString() ?? null,
    };
  });

  // Overall score: weighted average by domain weight
  const totalWeight = domainReadiness.reduce((sum, d) => sum + d.domainWeight, 0);
  const overall = totalWeight > 0
    ? domainReadiness.reduce((sum, d) => sum + d.score * d.domainWeight, 0) / totalWeight
    : 0;

  // Confidence level
  const domainsAttempted = domainReadiness.filter(d => d.totalAttempts > 0).length;
  const domainsWithSufficientData = domainReadiness.filter(d => d.totalAttempts >= COVERAGE_THRESHOLD).length;

  let confidence: ConfidenceLevel;
  if (domainsAttempted < 5) {
    confidence = 'low';
  } else if (domainsWithSufficientData < domainReadiness.length) {
    confidence = 'medium';
  } else {
    confidence = 'high';
  }

  const score: ReadinessScore = {
    overall: Math.round(overall * 100) / 100,
    confidence,
    domains: domainReadiness,
    calculatedAt: now.toISOString(),
  };

  // Generate recommendations sorted by lowest domain score
  const recommendations = generateRecommendations(domainReadiness);

  const result: ReadinessResult = { score, recommendations };

  // Cache result before returning
  setCache(cacheKey, result);

  return result;
}

/**
 * Generate actionable recommendations based on domain readiness.
 * Sorted by priority (lowest score first).
 */
function generateRecommendations(domains: DomainReadiness[]): ReadinessRecommendation[] {
  return domains
    .filter(d => d.score < 70) // Only recommend domains below passing threshold
    .sort((a, b) => a.score - b.score)
    .map((domain, index) => {
      let action: string;
      if (domain.totalAttempts === 0) {
        action = `Start practicing ${domain.domainName} - no attempts yet`;
      } else if (domain.accuracy < 0.5) {
        action = `Focus on improving accuracy in ${domain.domainName} (currently ${Math.round(domain.accuracy * 100)}%)`;
      } else if (domain.coverage < 0.5) {
        action = `Increase practice volume for ${domain.domainName} (${domain.totalAttempts}/${COVERAGE_THRESHOLD} attempts)`;
      } else if (domain.recency < 0.3) {
        action = `Review ${domain.domainName} - it's been a while since your last practice`;
      } else {
        action = `Continue practicing ${domain.domainName} to strengthen your understanding`;
      }

      return {
        domainId: domain.domainId,
        domainName: domain.domainName,
        action,
        priority: index + 1,
        currentScore: domain.score,
      };
    });
}
