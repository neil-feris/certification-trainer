import { db } from '../db/index.js';
import { examShares, exams, certifications } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface ShareData {
  score: number;
  passed: boolean;
  certificationName: string;
  completedAt: string;
}

/**
 * Fetches share data for generating OG meta tags.
 * Returns null if share hash is invalid or not found.
 */
export async function getShareData(hash: string): Promise<ShareData | null> {
  if (!hash || hash.length !== 32) {
    return null;
  }

  const [shareRecord] = await db.select().from(examShares).where(eq(examShares.shareHash, hash));

  if (!shareRecord) {
    return null;
  }

  const [exam] = await db
    .select({
      exam: exams,
      certification: certifications,
    })
    .from(exams)
    .innerJoin(certifications, eq(exams.certificationId, certifications.id))
    .where(eq(exams.id, shareRecord.examId));

  if (!exam || exam.exam.status !== 'completed') {
    return null;
  }

  const passingScore = exam.certification.passingScorePercent ?? 70;
  const passed = (exam.exam.score ?? 0) >= passingScore;

  return {
    score: exam.exam.score ?? 0,
    passed,
    certificationName: exam.certification.name,
    completedAt: exam.exam.completedAt?.toISOString() ?? new Date().toISOString(),
  };
}

/**
 * Generates HTML with OG meta tags for a shared exam result.
 * Falls back to regular index.html if share not found.
 */
export function generateShareHtml(
  indexHtml: string,
  shareData: ShareData | null,
  baseUrl: string,
  sharePath: string
): string {
  if (!shareData) {
    // Return unmodified HTML for invalid shares - React app will show error state
    return indexHtml;
  }

  const { score, passed, certificationName } = shareData;
  const roundedScore = Math.round(score);
  const passedText = passed ? 'Passed' : 'Attempted';

  // Build meta tag content
  const title = `${passedText} ${certificationName} - ${roundedScore}%`;
  const description = `I scored ${roundedScore}% on my ${certificationName} practice exam! Prepare for Google Cloud certifications with ACE Prep.`;
  const shareUrl = `${baseUrl}${sharePath}`;

  // Inject OG meta tags into <head>
  // We'll add them right before the closing </head> tag
  const ogTags = `
    <!-- Open Graph / Social Share Meta Tags -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${shareUrl}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:site_name" content="ACE Prep" />

    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />

    <!-- Additional meta tags -->
    <meta name="description" content="${description}" />
  `;

  // Also update the <title> tag for the page
  let modifiedHtml = indexHtml.replace(/<title>.*?<\/title>/, `<title>${title} | ACE Prep</title>`);

  // Inject OG tags before </head>
  modifiedHtml = modifiedHtml.replace('</head>', `${ogTags}</head>`);

  return modifiedHtml;
}
