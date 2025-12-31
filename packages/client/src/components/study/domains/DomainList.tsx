import { useQuery } from '@tanstack/react-query';
import { studyApi } from '../../../api/client';
import { DomainCard } from './DomainCard';
import styles from './Domains.module.css';

interface DomainListProps {
  onStartPractice: (topicId: number, domainId: number) => void;
}

export function DomainList({ onStartPractice }: DomainListProps) {
  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['studyDomains'],
    queryFn: studyApi.getDomains,
  });

  if (isLoading) {
    return <div className={styles.loading}>Loading domains...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>ACE Exam Domains</h2>
        <p className={styles.subtitle}>
          Click on a topic to start a practice session. Questions you get wrong will be added to
          your review queue.
        </p>
      </div>

      <div className={styles.domainList}>
        {domains.map((domain: any) => (
          <DomainCard key={domain.id} domain={domain} onStartPractice={onStartPractice} />
        ))}
      </div>
    </div>
  );
}
