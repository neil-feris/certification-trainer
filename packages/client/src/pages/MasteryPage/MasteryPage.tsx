import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { progressApi } from '../../api/client';
import { useCertificationStore } from '../../stores/certificationStore';
import type { ServiceMastery, MasteryCategory } from '@ace-prep/shared';
import styles from './MasteryPage.module.css';

function ServiceCard({
  service,
  isExpanded,
  onToggle,
}: {
  service: ServiceMastery;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const masteryColors: Record<string, string> = {
    none: 'var(--bg-tertiary)',
    low: 'var(--error)',
    medium: 'var(--warning)',
    high: 'var(--success)',
  };

  return (
    <div className={styles.cardWrapper}>
      <button
        className={`${styles.card} ${styles[`mastery-${service.masteryLevel}`]}`}
        onClick={onToggle}
        style={
          {
            '--mastery-color': masteryColors[service.masteryLevel],
          } as React.CSSProperties
        }
      >
        <span className={styles.serviceName}>{service.name}</span>
        {service.accuracy !== null ? (
          <span className={styles.accuracy}>{Math.round(service.accuracy)}%</span>
        ) : (
          <span className={styles.notStarted}>Not started</span>
        )}
        {service.masteryLevel === 'high' && <span className={styles.checkmark}>✓</span>}
      </button>

      {isExpanded && (
        <div className={styles.detail}>
          <div className={styles.detailStats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Accuracy</span>
              <span className={styles.statValue}>
                {service.correctCount} / {service.questionsAttempted} correct
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Coverage</span>
              <span className={styles.statValue}>
                {service.questionsAttempted} / {service.totalQuestions} questions
              </span>
            </div>
            {service.lastAttemptAt && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Last practiced</span>
                <span className={styles.statValue}>
                  {new Date(service.lastAttemptAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CategorySection({ category }: { category: MasteryCategory }) {
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const attemptedCount = category.services.filter((s) => s.questionsAttempted > 0).length;

  return (
    <section className={styles.category}>
      <h2 className={styles.categoryHeader}>
        {category.name}
        <span className={styles.categoryBadge}>
          {attemptedCount}/{category.services.length}
        </span>
      </h2>
      <div className={styles.grid}>
        {category.services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            isExpanded={expandedService === service.id}
            onToggle={() => setExpandedService(expandedService === service.id ? null : service.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function MasteryPage() {
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);

  const { data, isLoading, error } = useQuery({
    queryKey: ['mastery-map', selectedCertificationId],
    queryFn: () => progressApi.getMasteryMap(selectedCertificationId ?? undefined),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading mastery data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>Failed to load mastery data</div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>GCP Service Mastery</h1>
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{data.totals.servicesAttempted}</span>
            <span className={styles.summaryLabel}>/ {data.totals.servicesTotal} services</span>
          </div>
          {data.totals.overallAccuracy !== null && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>
                {Math.round(data.totals.overallAccuracy)}%
              </span>
              <span className={styles.summaryLabel}>overall accuracy</span>
            </div>
          )}
        </div>
      </header>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['mastery-none']}`} />
          <span>Not started</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['mastery-low']}`} />
          <span>&lt;50%</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['mastery-medium']}`} />
          <span>50-80%</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles['mastery-high']}`} />
          <span>&gt;80%</span>
        </div>
      </div>

      <main className={styles.content}>
        {data.categories.map((category) => (
          <CategorySection key={category.id} category={category} />
        ))}
      </main>
    </div>
  );
}
