import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockSelect, mockParseCertId } = vi.hoisted(() => {
  const mockParseCertId = vi.fn();

  // Build a flexible chain where every method returns the chain itself,
  // except `.all()` which is the terminal that returns the result.
  function createChain(allFn: () => any) {
    const chain: any = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    // Thenable: makes `await db.select(...)...` resolve to allFn's return
    chain.then = function (resolve: any, reject: any) {
      try {
        const val = allFn();
        return Promise.resolve(val).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    };
    return chain;
  }

  // Each call to db.select() creates a fresh chain with its own terminal mock.
  // We'll track call index and return different results per call.
  const selectResults: any[] = [];
  let selectCallIndex = 0;

  const mockSelect = vi.fn(() => {
    const idx = selectCallIndex++;
    const allFn = vi.fn<() => any>(() => selectResults[idx]);
    return createChain(allFn);
  });

  // Attach helpers for tests to set up results
  (mockSelect as any)._setResults = (results: any[]) => {
    selectResults.length = 0;
    selectResults.push(...results);
    selectCallIndex = 0;
  };

  return { mockSelect, mockParseCertId };
});

// Mock the db module
vi.mock('../db/index.js', () => ({
  db: { select: mockSelect },
  sqlite: {},
}));

// Mock certificationUtils
vi.mock('../db/certificationUtils.js', () => ({
  parseCertificationIdFromQuery: mockParseCertId,
}));

// Mock authenticate – always pass through
vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn(async (req: any) => {
    req.user = { id: '1' };
  }),
}));

// Stubs for services the progress module imports but this endpoint never calls
vi.mock('../services/streakService.js', () => ({ getStreak: vi.fn() }));
vi.mock('../services/xpService.js', () => ({ getXP: vi.fn() }));
vi.mock('../services/readinessProjection.js', () => ({ projectReadiness: vi.fn() }));
vi.mock('../services/readinessService.js', () => ({ calculateReadinessScore: vi.fn() }));

// ── Imports (after mocks) ──────────────────────────────────────────────────
import Fastify from 'fastify';
import { progressRoutes } from './progress.js';

// ── Helpers ────────────────────────────────────────────────────────────────
async function buildApp() {
  const app = Fastify();
  await app.register(progressRoutes, { prefix: '/progress' });
  await app.ready();
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('GET /progress/service-categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns categories with services for a valid certificationId', async () => {
    mockParseCertId.mockResolvedValue(1);

    // Call 0: categories query
    // Call 1: batch items query (all categories at once)
    (mockSelect as any)._setResults([
      [
        {
          id: 10,
          certificationId: 1,
          categoryId: 'compute',
          categoryName: 'Compute',
          displayOrder: 0,
        },
        {
          id: 20,
          certificationId: 1,
          categoryId: 'storage',
          categoryName: 'Storage',
          displayOrder: 1,
        },
      ],
      [
        { categoryId: 10, serviceName: 'EC2' },
        { categoryId: 10, serviceName: 'Lambda' },
        { categoryId: 20, serviceName: 'S3' },
      ],
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/progress/service-categories?certificationId=1',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      id: 10,
      certificationId: 1,
      categoryId: 'compute',
      categoryName: 'Compute',
      displayOrder: 0,
      services: ['EC2', 'Lambda'],
    });
    expect(body[1]).toMatchObject({
      id: 20,
      certificationId: 1,
      categoryId: 'storage',
      categoryName: 'Storage',
      displayOrder: 1,
      services: ['S3'],
    });

    await app.close();
  });

  it('returns empty array when no categories exist for certificationId', async () => {
    mockParseCertId.mockResolvedValue(999);

    (mockSelect as any)._setResults([[]]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/progress/service-categories?certificationId=999',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);

    await app.close();
  });

  it('returns 400 when certificationId is invalid', async () => {
    mockParseCertId.mockImplementation(async (_str: string, reply: any) => {
      reply.status(400).send({ error: 'certificationId must be a valid integer' });
      return null;
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/progress/service-categories?certificationId=abc',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'certificationId must be a valid integer' });

    await app.close();
  });

  it('falls back to default certification when certificationId is omitted', async () => {
    mockParseCertId.mockResolvedValue(1);

    (mockSelect as any)._setResults([
      [
        {
          id: 5,
          certificationId: 1,
          categoryId: 'networking',
          categoryName: 'Networking',
          displayOrder: 0,
        },
      ],
      [{ categoryId: 5, serviceName: 'VPC' }],
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/progress/service-categories',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].services).toEqual(['VPC']);

    expect(mockParseCertId).toHaveBeenCalledWith(undefined, expect.anything());

    await app.close();
  });
});
