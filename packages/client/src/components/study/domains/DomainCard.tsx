import { useState } from 'react';
import { TopicRow } from './TopicRow';
import styles from './Domains.module.css';

interface DomainCardProps {
  domain: {
    id: number;
    name: string;
    code: string;
    weight: number;
    description: string;
    topics: Array<{
      id: number;
      name: string;
      description: string;
    }>;
  };
  onStartPractice: (topicId: number, domainId: number) => void;
}

export function DomainCard({ domain, onStartPractice }: DomainCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className={styles.domainCard}>
      <button className={styles.domainHeader} onClick={() => setIsExpanded(!isExpanded)}>
        <div className={styles.domainInfo}>
          <h3 className={styles.domainName}>{domain.name}</h3>
          <span className={styles.domainWeight}>{Math.round(domain.weight * 100)}% of exam</span>
        </div>
        <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>▼</span>
      </button>

      {domain.description && <p className={styles.domainDescription}>{domain.description}</p>}

      {isExpanded && (
        <div className={styles.topicList}>
          {domain.topics.map((topic) => (
            <TopicRow
              key={topic.id}
              topic={topic}
              domainId={domain.id}
              onStartPractice={onStartPractice}
            />
          ))}
        </div>
      )}
    </div>
  );
}
