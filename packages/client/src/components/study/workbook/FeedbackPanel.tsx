import { useQuery } from '@tanstack/react-query';
import { workbookApi } from '../../../api/client';
import type { WorkbookResource } from '@ace-prep/shared';
import styles from './FeedbackPanel.module.css';

interface Props {
  isCorrect: boolean;
  correctAnswers: number[];
  explanation: string;
  selectedAnswers: number[];
  options: string[];
  masteryLevel: string;
  cloudServices: string[];
}

// External link icon
const ExternalLinkIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// Merge resources from multiple services
function mergeResources(resources: WorkbookResource[]): {
  courses: Array<{ name: string; module?: string }>;
  skillBadges: string[];
  documentationLinks: Array<{ title: string; url: string }>;
} {
  const coursesMap = new Map<string, { name: string; module?: string }>();
  const skillBadgesSet = new Set<string>();
  const docsMap = new Map<string, { title: string; url: string }>();

  for (const resource of resources) {
    // Merge courses (dedupe by name+module)
    for (const course of resource.courses) {
      const key = `${course.name}|${course.module ?? ''}`;
      if (!coursesMap.has(key)) {
        coursesMap.set(key, course);
      }
    }

    // Merge skill badges
    for (const badge of resource.skillBadges) {
      skillBadgesSet.add(badge);
    }

    // Merge documentation links (dedupe by URL)
    for (const link of resource.documentationLinks) {
      if (!docsMap.has(link.url)) {
        docsMap.set(link.url, link);
      }
    }
  }

  return {
    courses: Array.from(coursesMap.values()),
    skillBadges: Array.from(skillBadgesSet),
    documentationLinks: Array.from(docsMap.values()),
  };
}

export function FeedbackPanel({
  isCorrect,
  correctAnswers,
  explanation,
  selectedAnswers,
  options,
  masteryLevel,
  cloudServices,
}: Props) {
  // Fetch resources for the GCP services in this question
  const { data: resources, isLoading: resourcesLoading } = useQuery({
    queryKey: ['workbookResources', cloudServices],
    queryFn: () => workbookApi.getResources(cloudServices),
    enabled: cloudServices.length > 0,
    staleTime: 300000, // 5 min cache
  });

  const merged = resources ? mergeResources(resources) : null;

  const getMasteryLabel = () => {
    switch (masteryLevel) {
      case 'mastered':
        return 'Mastered (correct on first attempt)';
      case 'learned':
        return 'Learned (correct after retry)';
      case 'needs_work':
        return 'Needs work';
      default:
        return '';
    }
  };

  const hasResources =
    merged &&
    (merged.courses.length > 0 ||
      merged.skillBadges.length > 0 ||
      merged.documentationLinks.length > 0);

  return (
    <div className={`${styles.container} ${isCorrect ? styles.correct : styles.incorrect}`}>
      {/* Result Header */}
      <div className={styles.header}>
        <span className={styles.icon}>{isCorrect ? '\u2713' : '\u2717'}</span>
        <span className={styles.result}>{isCorrect ? 'Correct!' : 'Incorrect'}</span>
        <span className={styles.mastery}>{getMasteryLabel()}</span>
      </div>

      {/* Your Answer vs Correct Answer */}
      <div className={styles.answers}>
        <div className={styles.answerBlock}>
          <span className={styles.answerLabel}>Your answer:</span>
          <span>{selectedAnswers.map((i) => String.fromCharCode(65 + i)).join(', ')}</span>
        </div>
        {!isCorrect && (
          <div className={styles.answerBlock}>
            <span className={styles.answerLabel}>Correct answer:</span>
            <span className={styles.correctText}>
              {correctAnswers
                .map((i) => `${String.fromCharCode(65 + i)} - ${options[i]}`)
                .join('; ')}
            </span>
          </div>
        )}
      </div>

      {/* Explanation */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Explanation</h4>
        <p className={styles.explanation}>{explanation}</p>
      </div>

      {/* Cloud Services */}
      {cloudServices.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Cloud Services</h4>
          <div className={styles.tags}>
            {cloudServices.map((service) => (
              <span key={service} className={styles.tag}>
                {service}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Learn More Section */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Learn More</h4>

        {resourcesLoading && <p className={styles.placeholder}>Loading resources...</p>}

        {!resourcesLoading && !hasResources && cloudServices.length > 0 && (
          <p className={styles.placeholder}>No specific resources found for these services.</p>
        )}

        {!resourcesLoading && hasResources && merged && (
          <div className={styles.resourcesGrid}>
            {/* Documentation Links */}
            {merged.documentationLinks.length > 0 && (
              <div className={styles.resourceCategory}>
                <h5 className={styles.resourceCategoryTitle}>Documentation</h5>
                <ul className={styles.resourceList}>
                  {merged.documentationLinks.slice(0, 5).map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.resourceLink}
                      >
                        {link.title}
                        <ExternalLinkIcon />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Courses */}
            {merged.courses.length > 0 && (
              <div className={styles.resourceCategory}>
                <h5 className={styles.resourceCategoryTitle}>Recommended Courses</h5>
                <ul className={styles.resourceList}>
                  {merged.courses.slice(0, 4).map((course) => (
                    <li key={`${course.name}-${course.module ?? ''}`} className={styles.courseItem}>
                      <span className={styles.courseName}>{course.name}</span>
                      {course.module && (
                        <span className={styles.courseModule}>{course.module}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Skill Badges */}
            {merged.skillBadges.length > 0 && (
              <div className={styles.resourceCategory}>
                <h5 className={styles.resourceCategoryTitle}>Skill Badges</h5>
                <div className={styles.badgesList}>
                  {merged.skillBadges.slice(0, 3).map((badge) => (
                    <span key={badge} className={styles.badge}>
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
