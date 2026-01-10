import { useState, useCallback } from 'react';
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

  // Parse URL params
  const difficultyParam = searchParams.get('difficulty');
  const params = {
    certificationId: searchParams.get('certificationId')
      ? Number(searchParams.get('certificationId'))
      : (selectedCertificationId ?? undefined),
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
