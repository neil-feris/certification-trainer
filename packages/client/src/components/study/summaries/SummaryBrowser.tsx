import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studyApi } from '../../../api/client';
import { useCertificationStore } from '../../../stores/certificationStore';
import styles from './Summaries.module.css';

export function SummaryBrowser() {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState<number | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<number | null>(null);
  const [viewingSummary, setViewingSummary] = useState<any | null>(null);
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);

  const { data: domains = [] } = useQuery({
    queryKey: ['studyDomains', selectedCertificationId],
    queryFn: () => studyApi.getDomains(selectedCertificationId ?? undefined),
    enabled: selectedCertificationId !== null,
  });

  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ['studySummaries'],
    queryFn: studyApi.getSummaries,
  });

  const generateMutation = useMutation({
    mutationFn: ({ domainId, topicId }: { domainId: number; topicId?: number }) =>
      studyApi.generateSummary(domainId, topicId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['studySummaries'] });
      setViewingSummary(data.summary);
    },
  });

  const handleGenerate = () => {
    if (!selectedDomain) return;
    generateMutation.mutate({
      domainId: selectedDomain,
      topicId: selectedTopic || undefined,
    });
  };

  const selectedDomainData = domains.find((d: any) => d.id === selectedDomain);

  if (viewingSummary) {
    return (
      <div className={styles.container}>
        <button
          className={`btn btn-ghost ${styles.backBtn}`}
          onClick={() => setViewingSummary(null)}
        >
          ← Back to Summaries
        </button>

        <div className={styles.summaryView}>
          <div className={styles.summaryHeader}>
            <h2>{viewingSummary.domain?.name || 'Study Summary'}</h2>
            {viewingSummary.topic && (
              <span className={styles.topicTag}>{viewingSummary.topic.name}</span>
            )}
          </div>
          <div className={styles.summaryContent}>{viewingSummary.content}</div>
          <div className={styles.summaryMeta}>
            Generated: {new Date(viewingSummary.generatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>AI Study Summaries</h2>
        <p className={styles.subtitle}>
          Generate personalized study summaries based on your weak areas. The AI will analyze your
          exam performance and create focused review material.
        </p>
      </div>

      <div className={styles.generator}>
        <h3 className={styles.generatorTitle}>Generate New Summary</h3>
        <div className={styles.selectors}>
          <select
            className={styles.select}
            value={selectedDomain || ''}
            onChange={(e) => {
              setSelectedDomain(e.target.value ? Number(e.target.value) : null);
              setSelectedTopic(null);
            }}
          >
            <option value="">Select a domain...</option>
            {domains.map((domain: any) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>

          {selectedDomainData && (
            <select
              className={styles.select}
              value={selectedTopic || ''}
              onChange={(e) => setSelectedTopic(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All topics in domain</option>
              {selectedDomainData.topics.map((topic: any) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          )}

          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={!selectedDomain || generateMutation.isPending}
          >
            {generateMutation.isPending ? 'Generating...' : 'Generate Summary'}
          </button>
        </div>
        {generateMutation.isError && (
          <p className={styles.error}>
            Failed to generate summary. Make sure you have an API key configured in Settings.
          </p>
        )}
      </div>

      <div className={styles.existingSummaries}>
        <h3 className={styles.sectionTitle}>Previous Summaries</h3>
        {isLoading ? (
          <p className={styles.loading}>Loading summaries...</p>
        ) : summaries.length === 0 ? (
          <p className={styles.empty}>No summaries yet. Generate your first one above!</p>
        ) : (
          <div className={styles.summaryList}>
            {summaries.map((summary: any) => (
              <button
                key={summary.id}
                className={styles.summaryCard}
                onClick={() => setViewingSummary(summary)}
              >
                <div className={styles.summaryCardHeader}>
                  <span className={styles.summaryDomain}>{summary.domain?.name || 'Unknown'}</span>
                  {summary.topic && (
                    <span className={styles.summaryTopic}>{summary.topic.name}</span>
                  )}
                </div>
                <div className={styles.summaryPreview}>{summary.content.slice(0, 150)}...</div>
                <div className={styles.summaryDate}>
                  {new Date(summary.generatedAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
