import { useState, useEffect } from 'react';
import type { QuestionFilterOptions } from '@ace-prep/shared';
import styles from './QuestionBrowser.module.css';

interface QuestionFiltersProps {
  params: {
    certificationId?: number;
    domainId?: number;
    topicId?: number;
    caseStudyId?: number;
    difficulty?: string;
    bookmarked?: boolean;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  };
  filterOptions?: QuestionFilterOptions;
  onFilterChange: (key: string, value: string | undefined) => void;
  onFiltersChange: (updates: Record<string, string | undefined>) => void;
}

export function QuestionFilters({
  params,
  filterOptions,
  onFilterChange,
  onFiltersChange,
}: QuestionFiltersProps) {
  const [searchInput, setSearchInput] = useState(params.search || '');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      onFilterChange('search', searchInput || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, onFilterChange]);

  // Sync searchInput when params.search changes externally
  useEffect(() => {
    setSearchInput(params.search || '');
  }, [params.search]);

  // Filter domains by selected certification
  const filteredDomains =
    filterOptions?.domains.filter(
      (d) => !params.certificationId || d.certificationId === params.certificationId
    ) ?? [];

  // Filter topics by selected domain
  const filteredTopics =
    filterOptions?.topics.filter((t) => !params.domainId || t.domainId === params.domainId) ?? [];

  // Filter case studies by selected certification
  const filteredCaseStudies =
    filterOptions?.caseStudies?.filter(
      (cs) => !params.certificationId || cs.certificationId === params.certificationId
    ) ?? [];

  // Only show case study filter when certification has case studies
  const showCaseStudyFilter = filteredCaseStudies.length > 0;

  return (
    <div className={styles.filters}>
      <input
        type="search"
        placeholder="Search questions..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className={styles.searchInput}
      />

      <select
        value={params.certificationId || ''}
        onChange={(e) => {
          onFiltersChange({
            certificationId: e.target.value || undefined,
            domainId: undefined,
            topicId: undefined,
            caseStudyId: undefined,
          });
        }}
      >
        <option value="">All Certifications</option>
        {filterOptions?.certifications.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code}
          </option>
        ))}
      </select>

      <select
        value={params.domainId || ''}
        onChange={(e) => {
          onFiltersChange({
            domainId: e.target.value || undefined,
            topicId: undefined,
          });
        }}
      >
        <option value="">All Domains</option>
        {filteredDomains.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      <select
        value={params.topicId || ''}
        onChange={(e) => onFilterChange('topicId', e.target.value || undefined)}
      >
        <option value="">All Topics</option>
        {filteredTopics.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <select
        value={params.difficulty || ''}
        onChange={(e) => onFilterChange('difficulty', e.target.value || undefined)}
      >
        <option value="">All Difficulties</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>

      <button
        className={`${styles.bookmarkedToggle} ${params.bookmarked ? styles.active : ''}`}
        onClick={() => onFilterChange('bookmarked', params.bookmarked ? undefined : 'true')}
        title={params.bookmarked ? 'Show all questions' : 'Show bookmarked only'}
      >
        <svg
          viewBox="0 0 24 24"
          fill={params.bookmarked ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        Bookmarked
      </button>

      {showCaseStudyFilter && (
        <select
          value={params.caseStudyId !== undefined ? String(params.caseStudyId) : ''}
          onChange={(e) => onFilterChange('caseStudyId', e.target.value || undefined)}
        >
          <option value="">All Questions</option>
          <option value="0">No Case Study</option>
          {filteredCaseStudies.map((cs) => (
            <option key={cs.id} value={cs.id}>
              {cs.name}
            </option>
          ))}
        </select>
      )}

      <select
        value={`${params.sortBy || 'createdAt'}-${params.sortOrder || 'desc'}`}
        onChange={(e) => {
          const [sortBy, sortOrder] = e.target.value.split('-');
          onFiltersChange({ sortBy, sortOrder });
        }}
      >
        <option value="createdAt-desc">Newest First</option>
        <option value="createdAt-asc">Oldest First</option>
        <option value="difficulty-asc">Difficulty (Easy to Hard)</option>
        <option value="difficulty-desc">Difficulty (Hard to Easy)</option>
        <option value="domain-asc">Domain (A to Z)</option>
      </select>
    </div>
  );
}
