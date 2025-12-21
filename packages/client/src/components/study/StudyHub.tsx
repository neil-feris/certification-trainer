import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { studyApi } from '../../api/client';
import styles from './StudyHub.module.css';

export function StudyHub() {
  const [activeTab, setActiveTab] = useState<'path' | 'domains'>('path');

  const { data: learningPath } = useQuery({
    queryKey: ['learningPath'],
    queryFn: studyApi.getLearningPath,
  });

  const { data: domains } = useQuery({
    queryKey: ['studyDomains'],
    queryFn: studyApi.getDomains,
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Study Hub</h1>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'path' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('path')}
          >
            Learning Path
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'domains' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('domains')}
          >
            Exam Domains
          </button>
        </div>
      </header>

      {activeTab === 'path' && (
        <div className={styles.pathList}>
          {learningPath?.map((item: any, index: number) => (
            <div key={index} className={styles.pathItem}>
              <div className={styles.pathNumber}>{item.order}</div>
              <div className={styles.pathContent}>
                <div className={styles.pathHeader}>
                  <h3 className={styles.pathTitle}>{item.title}</h3>
                  <span className={`badge ${item.type === 'skill_badge' ? 'badge-accent' : item.type === 'exam' ? 'badge-success' : ''}`}>
                    {item.type === 'skill_badge' ? 'Skill Badge' : item.type === 'exam' ? 'Certification' : 'Course'}
                  </span>
                </div>
                <p className={styles.pathDescription}>{item.description}</p>

                <div className={styles.pathTopics}>
                  <strong>Topics:</strong> {item.topics.join(' • ')}
                </div>

                <div className={styles.pathWhy}>
                  <strong>Why it matters:</strong> {item.whyItMatters}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'domains' && (
        <div className={styles.domainList}>
          {domains?.map((domain: any) => (
            <div key={domain.id} className={styles.domainCard}>
              <div className={styles.domainHeader}>
                <h3>{domain.name}</h3>
                <span className="badge badge-accent">{(domain.weight * 100).toFixed(0)}%</span>
              </div>
              <p className={styles.domainDescription}>{domain.description}</p>

              <div className={styles.topicList}>
                {domain.topics.map((topic: any) => (
                  <div key={topic.id} className={styles.topicItem}>
                    <span className={styles.topicBullet}>▸</span>
                    <div>
                      <div className={styles.topicName}>{topic.name}</div>
                      {topic.description && (
                        <div className={styles.topicDescription}>{topic.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
