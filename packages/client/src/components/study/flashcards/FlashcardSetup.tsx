import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { studyApi } from '../../../api/client';
import { useFlashcardStore } from '../../../stores/flashcardStore';
import { useCertificationStore } from '../../../stores/certificationStore';
import { FLASHCARD_COUNT_OPTIONS } from '@ace-prep/shared';
import type { FlashcardCount } from '@ace-prep/shared';
import styles from './FlashcardSetup.module.css';

export function FlashcardSetup() {
  const navigate = useNavigate();
  const [domainId, setDomainId] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [count, setCount] = useState<FlashcardCount>(20);
  const [error, setError] = useState<string | null>(null);

  const { startSession, isLoading } = useFlashcardStore();
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);

  // Fetch domains for the selected certification
  const { data: domains = [] } = useQuery({
    queryKey: ['study-domains', selectedCertificationId],
    queryFn: () => studyApi.getDomains(selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

  // Get topics for selected domain
  const selectedDomain = domains.find((d: any) => d.id === domainId);
  const topics = selectedDomain?.topics ?? [];

  // Reset topic when domain changes
  useEffect(() => {
    setTopicId(null);
  }, [domainId]);

  const handleStart = async () => {
    setError(null);
    try {
      const sessionId = await startSession({
        certificationId: selectedCertificationId ?? undefined,
        domainId: domainId ?? undefined,
        topicId: topicId ?? undefined,
        bookmarkedOnly: bookmarkedOnly || undefined,
        count,
      });
      navigate(`/study/flashcards/${sessionId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to start flashcard session');
    }
  };

  return (
    <div className={styles.setupContainer}>
      <div className={styles.setupCard}>
        <h2 className={styles.setupTitle}>Flashcard Study</h2>
        <p className={styles.setupSubtitle}>
          Review concepts with spaced repetition. Flip cards, rate your recall, and build long-term
          memory.
        </p>

        {/* Domain Filter */}
        <div className={styles.setupSection}>
          <div className={styles.sectionLabel}>Domain</div>
          <select
            className={styles.filterSelect}
            value={domainId ?? ''}
            onChange={(e) => setDomainId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">All domains</option>
            {domains.map((domain: any) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
        </div>

        {/* Topic Filter (only when domain selected) */}
        {domainId && topics.length > 0 && (
          <div className={styles.setupSection}>
            <div className={styles.sectionLabel}>Topic</div>
            <select
              className={styles.filterSelect}
              value={topicId ?? ''}
              onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All topics in domain</option>
              {topics.map((topic: any) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Card Count */}
        <div className={styles.setupSection}>
          <div className={styles.sectionLabel}>Cards</div>
          <div className={styles.optionGrid}>
            {FLASHCARD_COUNT_OPTIONS.map((opt) => (
              <button
                key={opt}
                className={`${styles.optionBtn} ${count === opt ? styles.active : ''}`}
                onClick={() => setCount(opt)}
              >
                <span className={styles.optionValue}>{opt}</span>
                <span className={styles.optionLabel}>cards</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bookmarked Only */}
        <div className={styles.setupSection}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={bookmarkedOnly}
              onChange={(e) => setBookmarkedOnly(e.target.checked)}
            />
            <span className={styles.checkboxText}>Bookmarked questions only</span>
          </label>
        </div>

        {/* Error */}
        {error && <div className={styles.error}>{error}</div>}

        {/* Start Button */}
        <button className={styles.startBtn} onClick={handleStart} disabled={isLoading}>
          {isLoading ? 'Starting...' : 'Start Flashcards'}
        </button>
      </div>
    </div>
  );
}
