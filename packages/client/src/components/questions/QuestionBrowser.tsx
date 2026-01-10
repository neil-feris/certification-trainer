import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { QuestionWithDomain, Difficulty } from '@ace-prep/shared';
import { useCertificationStore } from '../../stores/certificationStore';
import { questionApi } from '../../api/client';
import { QuestionFilters } from './QuestionFilters';
import { QuestionList } from './QuestionList';
import { QuestionDetailModal } from './QuestionDetailModal';
import { Pagination } from '../common/Pagination';
import styles from './QuestionBrowser.module.css';

export function QuestionBrowser() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionWithDomain | null>(null);

  // Sync store certification to URL on mount if URL doesn't have one (URL is source of truth)
  useEffect(() => {
    if (!searchParams.get('certificationId') && selectedCertificationId) {
      setSearchParams(
        (prev) => {
          const newParams = new URLSearchParams(prev);
          newParams.set('certificationId', String(selectedCertificationId));
          return newParams;
        },
        { replace: true }
      );
    }
    // Only run on mount - URL is source of truth after initial sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parse URL params - URL is sole source of truth for all filters
  const difficultyParam = searchParams.get('difficulty');
  const certIdParam = searchParams.get('certificationId');
  const params = {
    certificationId: certIdParam ? Number(certIdParam) : undefined,
    domainId: searchParams.get('domainId') ? Number(searchParams.get('domainId')) : undefined,
    topicId: searchParams.get('topicId') ? Number(searchParams.get('topicId')) : undefined,
    difficulty: (difficultyParam === 'easy' ||
    difficultyParam === 'medium' ||
    difficultyParam === 'hard'
      ? difficultyParam
      : undefined) as Difficulty | undefined,
    search: searchParams.get('search') || undefined,
    sortBy: (searchParams.get('sortBy') as 'createdAt' | 'difficulty' | 'domain') || 'createdAt',
    sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    limit: 20,
    offset: Number(searchParams.get('offset')) || 0,
  };

  // Fetch questions
  const { data, isLoading, error } = useQuery({
    queryKey: ['questions', 'browse', params],
    queryFn: () => questionApi.list(params),
    placeholderData: keepPreviousData,
  });

  // Fetch filter options
  const { data: filterOptions } = useQuery({
    queryKey: ['questions', 'filters', params.certificationId],
    queryFn: () => questionApi.getFilterOptions(params.certificationId),
    staleTime: 5 * 60_000,
  });

  const updateFilter = useCallback(
    (key: string, value: string | undefined) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        if (value) newParams.set(key, value);
        else newParams.delete(key);
        if (key !== 'offset') newParams.set('offset', '0'); // Reset pagination
        return newParams;
      });
    },
    [setSearchParams]
  );

  // Batch update multiple filters at once (avoids race condition with sequential calls)
  const updateFilters = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        Object.entries(updates).forEach(([key, value]) => {
          if (value) newParams.set(key, value);
          else newParams.delete(key);
        });
        newParams.set('offset', '0'); // Reset pagination on filter change
        return newParams;
      });
    },
    [setSearchParams]
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Question Bank</h1>
        <span className={styles.count}>{data?.total ?? 0} questions</span>
      </header>

      <QuestionFilters
        params={params}
        filterOptions={filterOptions}
        onFilterChange={updateFilter}
        onFiltersChange={updateFilters}
      />

      <QuestionList
        questions={data?.items ?? []}
        isLoading={isLoading}
        error={error}
        onQuestionClick={setSelectedQuestion}
      />

      {data && data.total > params.limit && (
        <Pagination
          total={data.total}
          limit={params.limit}
          offset={params.offset}
          onPageChange={(offset) => updateFilter('offset', String(offset))}
        />
      )}

      {selectedQuestion && (
        <QuestionDetailModal
          question={selectedQuestion}
          onClose={() => setSelectedQuestion(null)}
        />
      )}
    </div>
  );
}
