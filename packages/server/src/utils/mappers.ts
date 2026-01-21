import type { CaseStudy } from '@ace-prep/shared';
import type { CaseStudyRecord } from '../db/schema.js';

/**
 * Safely parses a JSON string to an array, returning empty array on failure.
 * Prevents entire endpoint from crashing due to malformed JSON in database.
 */
export function safeParseJsonArray(value: string, fieldName?: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`Failed to parse JSON array${fieldName ? ` for ${fieldName}` : ''}:`, error);
    return [];
  }
}

/**
 * Maps a database case study record to the shared CaseStudy type.
 * Uses safe JSON parsing for array fields to prevent crashes on malformed data.
 *
 * @param record - The database record or null
 * @returns The mapped CaseStudy or undefined if record is null
 */
export function mapCaseStudyRecord(record: CaseStudyRecord | null): CaseStudy | undefined {
  if (!record) return undefined;

  return {
    id: record.id,
    certificationId: record.certificationId,
    code: record.code,
    name: record.name,
    companyOverview: record.companyOverview,
    solutionConcept: record.solutionConcept,
    existingTechnicalEnvironment: record.existingTechnicalEnvironment,
    businessRequirements: safeParseJsonArray(record.businessRequirements, 'businessRequirements'),
    technicalRequirements: safeParseJsonArray(
      record.technicalRequirements,
      'technicalRequirements'
    ),
    executiveStatement: record.executiveStatement,
    orderIndex: record.orderIndex,
    createdAt: record.createdAt,
  };
}
