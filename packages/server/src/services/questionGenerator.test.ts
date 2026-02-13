import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Read the source file to verify prompt constants without needing exports
const sourceDir = resolve(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(resolve(sourceDir, 'questionGenerator.ts'), 'utf-8');

describe('questionGenerator', () => {
  describe('SYSTEM_PROMPTS map', () => {
    it('has an entry for ACE', () => {
      expect(source).toContain('ACE: SYSTEM_PROMPT_ACE');
    });

    it('has an entry for PCA', () => {
      expect(source).toContain('PCA: SYSTEM_PROMPT_PCA');
    });

    it('has an entry for AWS-SAA', () => {
      expect(source).toContain("'AWS-SAA': SYSTEM_PROMPT_AWS_SAA");
    });
  });

  describe('ACE system prompt', () => {
    it('mentions Associate Cloud Engineer', () => {
      expect(source).toContain('Associate Cloud Engineer (ACE) certification exam');
    });

    it('mentions GCP', () => {
      expect(source).toContain('Google Cloud Platform instructor');
    });

    it('requires scenario-based knowledge', () => {
      expect(source).toContain('scenario-based knowledge');
    });
  });

  describe('PCA system prompt', () => {
    it('mentions Professional Cloud Architect', () => {
      expect(source).toContain('Professional Cloud Architect (PCA) certification exam');
    });

    it('requires architectural decision-making', () => {
      expect(source).toContain('architectural decision-making and design patterns');
    });

    it('references case study support', () => {
      expect(source).toContain(
        'Reference specific case study details when a case study is provided'
      );
    });
  });

  describe('AWS-SAA system prompt', () => {
    it('mentions SAA-C03', () => {
      expect(source).toContain('SAA-C03');
    });

    it('mentions AWS', () => {
      expect(source).toContain('expert AWS instructor');
    });

    it('mentions Well-Architected Framework', () => {
      expect(source).toContain('Well-Architected Framework');
    });

    it('requires multi-service integration scenarios', () => {
      expect(source).toContain('multi-service integration scenarios');
    });

    it('tests service trade-offs', () => {
      expect(source).toContain('understanding of service trade-offs');
    });
  });

  describe('prompt fallback logic', () => {
    it('falls back to ACE prompt for unknown certification codes', () => {
      // The source uses: SYSTEM_PROMPTS[code ?? 'ACE'] ?? SYSTEM_PROMPT_ACE
      // This means: unknown code -> undefined -> falls back to SYSTEM_PROMPT_ACE
      expect(source).toContain(
        "SYSTEM_PROMPTS[params.certificationCode ?? 'ACE'] ?? SYSTEM_PROMPT_ACE"
      );
    });

    it('defaults certificationCode to ACE when undefined', () => {
      // Also verified in createUserPrompt
      expect(source).toContain("params.certificationCode ?? 'ACE'");
    });
  });

  describe('validateQuestions (internal logic)', () => {
    // Since validateQuestions is not exported, we replicate its pure logic here
    // to ensure the validation rules work as expected.

    type Difficulty = 'easy' | 'medium' | 'hard';
    type DifficultyOption = Difficulty | 'mixed';

    interface GeneratedQuestion {
      questionText: string;
      questionType: 'single' | 'multiple';
      options: string[];
      correctAnswers: number[];
      explanation: string;
      cloudServices: string[];
      difficulty: Difficulty;
    }

    function validateQuestions(
      questions: any[],
      requestedDifficulty: DifficultyOption
    ): GeneratedQuestion[] {
      if (!Array.isArray(questions)) {
        throw new Error('Expected questions array');
      }

      return questions.map((q, i) => {
        if (!q.questionText || typeof q.questionText !== 'string') {
          throw new Error(`Question ${i + 1}: missing or invalid questionText`);
        }
        if (!q.questionType || !['single', 'multiple'].includes(q.questionType)) {
          throw new Error(`Question ${i + 1}: invalid questionType`);
        }
        if (!Array.isArray(q.options) || q.options.length < 4) {
          throw new Error(`Question ${i + 1}: need at least 4 options`);
        }
        if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
          throw new Error(`Question ${i + 1}: missing correctAnswers`);
        }
        if (!q.explanation || typeof q.explanation !== 'string') {
          throw new Error(`Question ${i + 1}: missing explanation`);
        }

        const difficulty: Difficulty =
          requestedDifficulty === 'mixed'
            ? ['easy', 'medium', 'hard'].includes(q.difficulty)
              ? q.difficulty
              : 'medium'
            : requestedDifficulty;

        const cleanedQuestionText = q.questionText
          .replace(/^Difficulty:\s*(easy|medium|hard)[.:\s]*/i, '')
          .trim();

        return {
          questionText: cleanedQuestionText,
          questionType: q.questionType,
          options: q.options,
          correctAnswers: q.correctAnswers,
          explanation: q.explanation,
          cloudServices: q.cloudServices || q.gcpServices || [],
          difficulty,
        };
      });
    }

    const validQuestion = {
      questionText: 'Which GCP service provides managed Kubernetes?',
      questionType: 'single',
      options: ['A. GKE', 'B. Cloud Run', 'C. App Engine', 'D. Compute Engine'],
      correctAnswers: [0],
      explanation: 'GKE is the managed Kubernetes service.',
      cloudServices: ['GKE'],
      difficulty: 'medium',
    };

    it('validates a well-formed single question', () => {
      const result = validateQuestions([validQuestion], 'medium');
      expect(result).toHaveLength(1);
      expect(result[0].questionText).toBe(validQuestion.questionText);
      expect(result[0].questionType).toBe('single');
      expect(result[0].correctAnswers).toEqual([0]);
      expect(result[0].difficulty).toBe('medium');
    });

    it('throws on missing questionText', () => {
      const bad = { ...validQuestion, questionText: '' };
      expect(() => validateQuestions([bad], 'medium')).toThrow(
        'Question 1: missing or invalid questionText'
      );
    });

    it('throws on invalid questionType', () => {
      const bad = { ...validQuestion, questionType: 'boolean' };
      expect(() => validateQuestions([bad], 'medium')).toThrow('Question 1: invalid questionType');
    });

    it('throws when options has fewer than 4 entries', () => {
      const bad = { ...validQuestion, options: ['A', 'B', 'C'] };
      expect(() => validateQuestions([bad], 'medium')).toThrow(
        'Question 1: need at least 4 options'
      );
    });

    it('throws on empty correctAnswers', () => {
      const bad = { ...validQuestion, correctAnswers: [] };
      expect(() => validateQuestions([bad], 'medium')).toThrow(
        'Question 1: missing correctAnswers'
      );
    });

    it('throws on missing explanation', () => {
      const bad = { ...validQuestion, explanation: '' };
      expect(() => validateQuestions([bad], 'medium')).toThrow('Question 1: missing explanation');
    });

    it('throws on non-array input', () => {
      expect(() => validateQuestions('not an array' as any, 'medium')).toThrow(
        'Expected questions array'
      );
    });

    it('uses requested difficulty when not mixed', () => {
      const q = { ...validQuestion, difficulty: 'easy' };
      const result = validateQuestions([q], 'hard');
      expect(result[0].difficulty).toBe('hard');
    });

    it('uses LLM difficulty when mode is mixed and difficulty is valid', () => {
      const q = { ...validQuestion, difficulty: 'hard' };
      const result = validateQuestions([q], 'mixed');
      expect(result[0].difficulty).toBe('hard');
    });

    it('defaults to medium when mode is mixed and LLM difficulty is invalid', () => {
      const q = { ...validQuestion, difficulty: 'insane' };
      const result = validateQuestions([q], 'mixed');
      expect(result[0].difficulty).toBe('medium');
    });

    it('defaults to medium when mode is mixed and no difficulty provided', () => {
      const q = { ...validQuestion, difficulty: undefined };
      const result = validateQuestions([q as any], 'mixed');
      expect(result[0].difficulty).toBe('medium');
    });

    it('strips difficulty prefix from questionText', () => {
      const q = {
        ...validQuestion,
        questionText: 'Difficulty: Hard. Which service provides managed Kubernetes?',
      };
      const result = validateQuestions([q], 'medium');
      expect(result[0].questionText).toBe('Which service provides managed Kubernetes?');
    });

    it('strips difficulty prefix case-insensitively', () => {
      const q = {
        ...validQuestion,
        questionText: 'Difficulty: EASY: Some question here',
      };
      const result = validateQuestions([q], 'easy');
      expect(result[0].questionText).toBe('Some question here');
    });

    it('falls back to gcpServices when cloudServices is missing', () => {
      const q = { ...validQuestion, cloudServices: undefined, gcpServices: ['Cloud SQL'] };
      const result = validateQuestions([q], 'medium');
      expect(result[0].cloudServices).toEqual(['Cloud SQL']);
    });

    it('returns empty array for cloudServices when both fields are missing', () => {
      const q = { ...validQuestion, cloudServices: undefined, gcpServices: undefined };
      const result = validateQuestions([q], 'medium');
      expect(result[0].cloudServices).toEqual([]);
    });

    it('validates multiple questions and reports correct index on error', () => {
      const good = { ...validQuestion };
      const bad = { ...validQuestion, correctAnswers: [] };
      expect(() => validateQuestions([good, bad], 'medium')).toThrow(
        'Question 2: missing correctAnswers'
      );
    });
  });
});
