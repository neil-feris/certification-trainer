import { describe, it, expect } from 'vitest';
import {
  tokenize,
  jaccardSimilarity,
  questionSimilarity,
  findDuplicate,
  deduplicateQuestions,
} from './similarity.js';

describe('tokenize', () => {
  it('should convert to lowercase', () => {
    const tokens = tokenize('Hello, World!');
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('world')).toBe(true);
    expect(tokens.has('Hello')).toBe(false);
  });

  it('should remove punctuation', () => {
    const tokens = tokenize('Hello, World! How are you?');
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('world')).toBe(true);
  });

  it('should remove stopwords', () => {
    const tokens = tokenize('The quick brown fox');
    expect(tokens.has('the')).toBe(false);
    expect(tokens.has('quick')).toBe(true);
    expect(tokens.has('brown')).toBe(true);
    expect(tokens.has('fox')).toBe(true);
  });

  it('should handle GCP terminology', () => {
    const tokens = tokenize('GCP Cloud Storage buckets configuration');
    expect(tokens.has('gcp')).toBe(true);
    expect(tokens.has('cloud')).toBe(true);
    expect(tokens.has('storage')).toBe(true);
    expect(tokens.has('buckets')).toBe(true);
    expect(tokens.has('configuration')).toBe(true);
  });

  it('should filter single character words', () => {
    const tokens = tokenize('a b c test');
    expect(tokens.has('a')).toBe(false);
    expect(tokens.has('b')).toBe(false);
    expect(tokens.has('c')).toBe(false);
    expect(tokens.has('test')).toBe(true);
  });

  it('should return unique tokens', () => {
    const tokens = tokenize('test test test different');
    expect(tokens.size).toBe(2);
    expect(tokens.has('test')).toBe(true);
    expect(tokens.has('different')).toBe(true);
  });
});

describe('jaccardSimilarity', () => {
  it('should return 1.0 for identical sets', () => {
    const setA = new Set(['a', 'b', 'c']);
    const setB = new Set(['a', 'b', 'c']);
    expect(jaccardSimilarity(setA, setB)).toBeCloseTo(1.0, 3);
  });

  it('should return 0.0 for disjoint sets', () => {
    const setA = new Set(['a', 'b', 'c']);
    const setB = new Set(['d', 'e', 'f']);
    expect(jaccardSimilarity(setA, setB)).toBeCloseTo(0.0, 3);
  });

  it('should calculate partial overlap correctly', () => {
    const setA = new Set(['a', 'b', 'c', 'd']);
    const setB = new Set(['c', 'd', 'e', 'f']);
    // intersection = {c, d} = 2
    // union = {a, b, c, d, e, f} = 6
    // J = 2/6 = 0.333
    expect(jaccardSimilarity(setA, setB)).toBeCloseTo(0.333, 2);
  });

  it('should return 1.0 for both empty sets', () => {
    const setA = new Set<string>();
    const setB = new Set<string>();
    expect(jaccardSimilarity(setA, setB)).toBeCloseTo(1.0, 3);
  });

  it('should return 0.0 when one set is empty', () => {
    const setA = new Set(['a', 'b']);
    const setB = new Set<string>();
    expect(jaccardSimilarity(setA, setB)).toBeCloseTo(0.0, 3);
  });
});

describe('questionSimilarity', () => {
  it('should return 1.0 for identical questions', () => {
    const q1 = 'You need to create a Cloud Storage bucket with versioning enabled.';
    const q2 = 'You need to create a Cloud Storage bucket with versioning enabled.';
    expect(questionSimilarity(q1, q2)).toBeCloseTo(1.0, 3);
  });

  it('should return low similarity for different questions', () => {
    const q1 = 'You need to create a Cloud Storage bucket with versioning enabled.';
    const q2 = 'Configure a Compute Engine VM with a startup script.';
    const similarity = questionSimilarity(q1, q2);
    expect(similarity).toBeLessThan(0.3);
  });

  it('should return high similarity for similar questions', () => {
    const q1 =
      'You need to create a Cloud Storage bucket with versioning enabled in the us-central1 region.';
    const q2 =
      'You need to create a Cloud Storage bucket with versioning enabled in the europe-west1 region.';
    const similarity = questionSimilarity(q1, q2);
    expect(similarity).toBeGreaterThan(0.6);
  });

  it('should be case-insensitive', () => {
    const q1 = 'Configure GCP CLOUD STORAGE';
    const q2 = 'configure gcp cloud storage';
    expect(questionSimilarity(q1, q2)).toBeCloseTo(1.0, 3);
  });
});

describe('findDuplicate', () => {
  it('should find similar question above threshold', () => {
    const existing = [
      { id: 1, questionText: 'You need to create a Cloud Storage bucket with versioning enabled.' },
      { id: 2, questionText: 'Configure a Compute Engine VM with a startup script.' },
    ];
    const newQ = 'You need to create a Cloud Storage bucket with object versioning enabled.';
    const result = findDuplicate(newQ, existing, 0.7);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(1);
    expect(result?.similarity).toBeGreaterThan(0.7);
  });

  it('should return null for unrelated question', () => {
    const existing = [
      { id: 1, questionText: 'You need to create a Cloud Storage bucket with versioning enabled.' },
    ];
    const newQ = 'Configure IAM roles for BigQuery dataset access.';
    const result = findDuplicate(newQ, existing, 0.7);
    expect(result).toBeNull();
  });

  it('should return null for empty existing questions', () => {
    const result = findDuplicate('Some question', [], 0.7);
    expect(result).toBeNull();
  });

  it('should use custom threshold', () => {
    const existing = [{ id: 1, questionText: 'Create Cloud Storage bucket' }];
    const newQ = 'Create Cloud Storage bucket with lifecycle';

    // High threshold might not match
    findDuplicate(newQ, existing, 0.95);

    // Lower threshold should match
    const lenientResult = findDuplicate(newQ, existing, 0.5);
    expect(lenientResult).not.toBeNull();
  });
});

describe('deduplicateQuestions', () => {
  it('should accept unique questions', () => {
    const existing = [
      { id: 1, questionText: 'You need to create a Cloud Storage bucket with versioning enabled.' },
    ];
    const newQuestions = [
      'Configure a Compute Engine VM instance with SSH access.',
      'Set up Cloud Pub/Sub topic for message streaming.',
    ];

    const results = deduplicateQuestions(newQuestions, existing, 0.7);

    expect(results[0].accepted).toBe(true);
    expect(results[1].accepted).toBe(true);
  });

  it('should reject duplicate of existing question', () => {
    const existing = [
      { id: 1, questionText: 'You need to create a Cloud Storage bucket with versioning enabled.' },
    ];
    const newQuestions = [
      'Configure a Compute Engine VM instance with SSH access.',
      'You need to create a Cloud Storage bucket with versioning enabled and lifecycle policies.',
      'Set up Cloud Pub/Sub topic for message streaming.',
    ];

    const results = deduplicateQuestions(newQuestions, existing, 0.6);

    expect(results[0].accepted).toBe(true);
    expect(results[1].accepted).toBe(false);
    expect(results[1].duplicate?.id).toBe(1);
    expect(results[2].accepted).toBe(true);
  });

  it('should detect cross-duplicates within new questions', () => {
    const existing: { id: number; questionText: string }[] = [];
    const newQuestions = [
      'Create a Cloud Storage bucket in the us-central1 region.',
      'Create a Cloud Storage bucket in the us-east1 region.',
      'Configure Cloud Functions with environment variables.',
    ];

    const results = deduplicateQuestions(newQuestions, existing, 0.7);

    expect(results[0].accepted).toBe(true);
    expect(results[1].accepted).toBe(false); // Similar to first
    expect(results[2].accepted).toBe(true);
  });

  it('should handle empty inputs', () => {
    const results = deduplicateQuestions([], [], 0.7);
    expect(results).toEqual([]);
  });

  it('should process all questions even if all are unique', () => {
    const newQuestions = [
      'Configure IAM roles for BigQuery dataset access control.',
      'Deploy a Kubernetes cluster on Google Kubernetes Engine.',
      'Set up Cloud Pub/Sub topic for message streaming architecture.',
    ];

    const results = deduplicateQuestions(newQuestions, [], 0.7);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.accepted)).toBe(true);
  });
});
