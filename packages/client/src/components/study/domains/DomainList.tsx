import { useQuery } from '@tanstack/react-query';
import { studyApi } from '../../../api/client';
import { useCertificationStore } from '../../../stores/certificationStore';
import { DomainCard } from './DomainCard';
import styles from './Domains.module.css';

interface DomainListProps {
  onStartPractice: (topicId: number, domainId: number) => void;
  highlightDomainId?: number;
}

export function DomainList({ onStartPractice, highlightDomainId }: DomainListProps) {
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['studyDomains', selectedCertificationId],
    queryFn: () => studyApi.getDomains(selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

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
