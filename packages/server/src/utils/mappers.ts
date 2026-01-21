import type { CaseStudy } from '@ace-prep/shared';
import type { CaseStudyRecord } from '../db/schema.js';

/**
 * Maps a database case study record to the shared CaseStudy type.
 * Parses JSON fields (businessRequirements, technicalRequirements).
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
    businessRequirements: JSON.parse(record.businessRequirements),
    technicalRequirements: JSON.parse(record.technicalRequirements),
    executiveStatement: record.executiveStatement,
    orderIndex: record.orderIndex,
    createdAt: record.createdAt,
  };
}
