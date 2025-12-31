import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { studyApi } from '../../../api/client';
import { useDrillStore } from '../../../stores/drillStore';
import type { DrillMode, DrillQuestionCount, DrillTimeLimit } from '@ace-prep/shared';
import { DRILL_QUESTION_COUNTS, DRILL_TIME_LIMITS } from '@ace-prep/shared';
import styles from './Drills.module.css';

interface TimedDrillSetupProps {
  onStart: () => void;
}

const TIME_LABELS: Record<number, string> = {
  60: '1 min',
  120: '2 min',
  300: '5 min',
  600: '10 min',
};

export function TimedDrillSetup({ onStart }: TimedDrillSetupProps) {
  const [mode, setMode] = useState<DrillMode>('domain');
  const [domainId, setDomainId] = useState<number | null>(null);
  const [questionCount, setQuestionCount] = useState<DrillQuestionCount>(10);
  const [timeLimit, setTimeLimit] = useState<DrillTimeLimit>(120);

  const { startDrill, isLoading } = useDrillStore();

  // Fetch domains
  const { data: domains = [] } = useQuery({
    queryKey: ['study-domains'],
    queryFn: studyApi.getDomains,
  });

  // Set first domain as default
  useEffect(() => {
    if (domains.length > 0 && !domainId && mode === 'domain') {
      setDomainId(domains[0].id);
    }
  }, [domains, domainId, mode]);

  const handleStart = async () => {
    try {
      await startDrill(mode, domainId, questionCount, timeLimit);
      onStart();
    } catch (error) {
      console.error('Failed to start drill:', error);
    }
  };

  const canStart = mode === 'weak_areas' || (mode === 'domain' && domainId !== null);

  return (
    <div className={styles.setupContainer}>
      <div className={styles.setupCard}>
        <h2 className={styles.setupTitle}>Timed Drill</h2>
        <p className={styles.setupSubtitle}>
          Quick-fire practice with immediate feedback. Test yourself under pressure.
        </p>

        {/* Mode Selection */}
        <div className={styles.setupSection}>
          <div className={styles.sectionLabel}>Drill Type</div>
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${mode === 'domain' ? styles.active : ''}`}
              onClick={() => setMode('domain')}
            >
              <span className={styles.modeIcon}>@</span>
              <span className={styles.modeLabel}>By Domain</span>
              <span className={styles.modeDesc}>Focus on specific area</span>
            </button>
            <button
              className={`${styles.modeBtn} ${mode === 'weak_areas' ? styles.active : ''}`}
              onClick={() => setMode('weak_areas')}
            >
              <span className={styles.modeIcon}>!</span>
              <span className={styles.modeLabel}>Weak Areas</span>
              <span className={styles.modeDesc}>Topics needing work</span>
            </button>
          </div>
        </div>

        {/* Domain Selection (only for domain mode) */}
        {mode === 'domain' && (
          <div className={styles.setupSection}>
            <div className={styles.sectionLabel}>Select Domain</div>
            <select
              className={styles.domainSelect}
              value={domainId ?? ''}
              onChange={(e) => setDomainId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Choose a domain...</option>
              {domains.map((domain: any) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Question Count */}
        <div className={styles.setupSection}>
          <div className={styles.sectionLabel}>Questions</div>
          <div className={styles.optionGrid}>
            {DRILL_QUESTION_COUNTS.map((count) => (
              <button
                key={count}
                className={`${styles.optionBtn} ${questionCount === count ? styles.active : ''}`}
                onClick={() => setQuestionCount(count)}
              >
                <span className={styles.optionValue}>{count}</span>
                <span className={styles.optionLabel}>questions</span>
              </button>
            ))}
          </div>
        </div>

        {/* Time Limit */}
        <div className={styles.setupSection}>
          <div className={styles.sectionLabel}>Time Limit</div>
          <div className={styles.optionGrid}>
            {DRILL_TIME_LIMITS.map((limit) => (
              <button
                key={limit}
                className={`${styles.optionBtn} ${timeLimit === limit ? styles.active : ''}`}
                onClick={() => setTimeLimit(limit)}
              >
                <span className={styles.optionValue}>{TIME_LABELS[limit]}</span>
                <span className={styles.optionLabel}>total</span>
              </button>
            ))}
          </div>
        </div>

        {/* Start Button */}
        <button className={styles.startBtn} onClick={handleStart} disabled={!canStart || isLoading}>
          {isLoading ? 'Starting...' : 'Start Drill'}
        </button>
      </div>
    </div>
  );
}
