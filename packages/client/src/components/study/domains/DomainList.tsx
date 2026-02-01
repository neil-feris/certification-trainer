import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { studyApi, workbookApi } from '../../../api/client';
import { useCertificationStore } from '../../../stores/certificationStore';
import { DomainCard } from './DomainCard';
import { OfficialQuestionsCard } from './OfficialQuestionsCard';
import styles from './Domains.module.css';

interface DomainListProps {
  onStartPractice: (topicId: number, domainId: number) => void;
  highlightDomainId?: number;
}

export function DomainList({ onStartPractice, highlightDomainId }: DomainListProps) {
  const navigate = useNavigate();
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['studyDomains', selectedCertificationId],
    queryFn: () => studyApi.getDomains(selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

  const { data: workbookProgress } = useQuery({
    queryKey: ['workbookProgress'],
    queryFn: () => workbookApi.getProgress(),
    staleTime: 60000,
  });

  const handleGoToWorkbook = () => {
    navigate('/study', { state: { tab: 'workbook' } });
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading domains...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{selectedCert?.shortName || 'Exam'} Domains</h2>
        <p className={styles.subtitle}>
          Click on a topic to start a practice session. Questions you get wrong will be added to
          your review queue.
        </p>
      </div>

      {/* Official Questions Card */}
      <OfficialQuestionsCard
        summary={workbookProgress?.summary}
        onGoToWorkbook={handleGoToWorkbook}
      />

      <div className={styles.domainList}>
        {domains.map((domain: any) => (
          <DomainCard
            key={domain.id}
            domain={domain}
            onStartPractice={onStartPractice}
            initialExpanded={highlightDomainId ? domain.id === highlightDomainId : true}
          />
        ))}
      </div>
    </div>
  );
}
