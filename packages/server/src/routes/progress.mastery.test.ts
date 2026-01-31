import { describe, it, expect } from 'vitest';
import { GCP_SERVICE_CATEGORIES, toServiceId, getMasteryLevel } from '@ace-prep/shared';

describe('GCP Mastery Map', () => {
  describe('GCP_SERVICE_CATEGORIES', () => {
    it('has 7 categories', () => {
      expect(GCP_SERVICE_CATEGORIES.length).toBe(7);
    });

    it('has more than 30 total services', () => {
      const totalServices = GCP_SERVICE_CATEGORIES.reduce(
        (sum, cat) => sum + cat.services.length,
        0
      );
      expect(totalServices).toBeGreaterThan(30);
    });

    it('contains expected categories', () => {
      const categoryIds = GCP_SERVICE_CATEGORIES.map((c) => c.id);
      expect(categoryIds).toContain('compute');
      expect(categoryIds).toContain('storage');
      expect(categoryIds).toContain('networking');
      expect(categoryIds).toContain('analytics');
      expect(categoryIds).toContain('ai-ml');
      expect(categoryIds).toContain('security');
      expect(categoryIds).toContain('operations');
    });

    it('categorizes services correctly', () => {
      const computeCategory = GCP_SERVICE_CATEGORIES.find((c) => c.id === 'compute');
      expect(computeCategory?.services).toContain('Cloud Run');
      expect(computeCategory?.services).toContain('GKE');
      expect(computeCategory?.services).toContain('Compute Engine');

      const storageCategory = GCP_SERVICE_CATEGORIES.find((c) => c.id === 'storage');
      expect(storageCategory?.services).toContain('Cloud SQL');
      expect(storageCategory?.services).toContain('Firestore');

      const analyticsCategory = GCP_SERVICE_CATEGORIES.find((c) => c.id === 'analytics');
      expect(analyticsCategory?.services).toContain('BigQuery');
      expect(analyticsCategory?.services).toContain('Pub/Sub');
    });
  });

  describe('toServiceId', () => {
    it('converts service names to kebab-case IDs', () => {
      expect(toServiceId('Cloud Run')).toBe('cloud-run');
      expect(toServiceId('BigQuery')).toBe('bigquery');
      expect(toServiceId('Cloud Load Balancing')).toBe('cloud-load-balancing');
      expect(toServiceId('Compute Engine')).toBe('compute-engine');
    });

    it('removes special characters', () => {
      expect(toServiceId('AI/ML Platform')).toBe('aiml-platform');
      expect(toServiceId('Cloud (Beta)')).toBe('cloud-beta');
    });

    it('handles multiple spaces', () => {
      expect(toServiceId('Cloud   Storage')).toBe('cloud-storage');
    });
  });

  describe('getMasteryLevel', () => {
    it('returns none for null accuracy', () => {
      expect(getMasteryLevel(null)).toBe('none');
    });

    it('returns low for accuracy below 50%', () => {
      expect(getMasteryLevel(0)).toBe('low');
      expect(getMasteryLevel(25)).toBe('low');
      expect(getMasteryLevel(49)).toBe('low');
      expect(getMasteryLevel(49.9)).toBe('low');
    });

    it('returns medium for accuracy 50-79%', () => {
      expect(getMasteryLevel(50)).toBe('medium');
      expect(getMasteryLevel(65)).toBe('medium');
      expect(getMasteryLevel(79)).toBe('medium');
      expect(getMasteryLevel(79.9)).toBe('medium');
    });

    it('returns high for accuracy 80% and above', () => {
      expect(getMasteryLevel(80)).toBe('high');
      expect(getMasteryLevel(90)).toBe('high');
      expect(getMasteryLevel(100)).toBe('high');
    });
  });
});
