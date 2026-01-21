-- Migration: Add capabilities column to certifications table
-- This enables feature flags per certification (e.g., hasCaseStudies)

-- Step 1: Add capabilities column with default value
ALTER TABLE certifications ADD COLUMN capabilities TEXT NOT NULL DEFAULT '{"hasCaseStudies":false}';

-- Step 2: Update PCA certification to have hasCaseStudies: true
UPDATE certifications SET capabilities = '{"hasCaseStudies":true}' WHERE code = 'PCA';
