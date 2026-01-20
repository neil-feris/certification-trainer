import { Link } from 'react-router-dom';
import type { CaseStudyWithCertification } from '@ace-prep/shared';
import styles from './CaseStudyCard.module.css';

interface CaseStudyCardProps {
  caseStudy: CaseStudyWithCertification;
}

export function CaseStudyCard({ caseStudy }: CaseStudyCardProps) {
  // Extract key themes from business requirements (first 2-3 items)
  const keyThemes = caseStudy.businessRequirements.slice(0, 3);

  // Extract company industry from overview (first sentence)
  const industryHint = caseStudy.companyOverview.split('.')[0];

  return (
    <Link to={`/case-studies/${caseStudy.id}`} className={styles.card}>
      <div className={styles.header}>
        <span className={styles.code}>{caseStudy.code}</span>
        <span className={styles.certBadge}>{caseStudy.certification.code}</span>
      </div>

      <h3 className={styles.name}>{caseStudy.name}</h3>

      <p className={styles.industry}>{industryHint}</p>

      <div className={styles.themes}>
        {keyThemes.map((theme, idx) => (
          <span key={idx} className={styles.theme}>
            {theme.length > 60 ? theme.slice(0, 60) + '...' : theme}
          </span>
        ))}
      </div>

      <div className={styles.footer}>
        <span className={styles.viewDetails}>View Case Study</span>
        <span className={styles.arrow}>→</span>
      </div>
    </Link>
  );
}
