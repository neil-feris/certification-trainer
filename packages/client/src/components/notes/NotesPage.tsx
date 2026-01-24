import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '../../api/client';
import { NotesPanel } from '../common/NotesPanel';
import { showToast } from '../common/Toast';
import styles from './NotesPage.module.css';

import type { NoteWithQuestion } from '@ace-prep/shared';

type SortOption = 'updated' | 'created';

export function NotesPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [filterDomain, setFilterDomain] = useState<string>('');
  const [filterTopic, setFilterTopic] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes', 'list'],
    queryFn: notesApi.list,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (questionId: number) => notesApi.delete(questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      showToast({ message: 'Note deleted', type: 'success' });
      setConfirmDeleteId(null);
    },
    onError: () => {
      showToast({ message: 'Failed to delete note', type: 'error' });
    },
  });

  // Extract unique domains and topics for filters
  const domains = useMemo(() => {
    const seen = new Map<string, string>();
    (notes as NoteWithQuestion[]).forEach((n) => {
      if (n.domain?.name && !seen.has(n.domain.name)) {
        seen.set(n.domain.name, n.domain.name);
      }
    });
    return Array.from(seen.values()).sort();
  }, [notes]);

  const topics = useMemo(() => {
    const seen = new Map<string, string>();
    (notes as NoteWithQuestion[]).forEach((n) => {
      if (n.topic?.name && !seen.has(n.topic.name)) {
        seen.set(n.topic.name, n.topic.name);
      }
    });
    return Array.from(seen.values()).sort();
  }, [notes]);

  // Filter and sort
  const filteredNotes = useMemo(() => {
    let result = notes as NoteWithQuestion[];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (n) =>
          n.content.toLowerCase().includes(q) ||
          n.question.text.toLowerCase().includes(q) ||
          n.domain?.name?.toLowerCase().includes(q) ||
          n.topic?.name?.toLowerCase().includes(q)
      );
    }

    if (filterDomain) {
      result = result.filter((n) => n.domain?.name === filterDomain);
    }

    if (filterTopic) {
      result = result.filter((n) => n.topic?.name === filterTopic);
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === 'updated') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [notes, search, filterDomain, filterTopic, sortBy]);

  const handleCardClick = useCallback((noteId: number) => {
    setExpandedId((prev) => (prev === noteId ? null : noteId));
  }, []);

  const handleDelete = useCallback(
    (e: React.MouseEvent, questionId: number) => {
      e.stopPropagation();
      if (confirmDeleteId === questionId) {
        deleteMutation.mutate(questionId);
      } else {
        setConfirmDeleteId(questionId);
        // Auto-dismiss confirmation after 3s
        setTimeout(() => setConfirmDeleteId(null), 3000);
      }
    },
    [confirmDeleteId, deleteMutation]
  );

  const truncateContent = (content: string, maxLen = 100) => {
    if (content.length <= maxLen) return content;
    return content.slice(0, maxLen).trimEnd() + '...';
  };

  const renderNoteCard = (item: NoteWithQuestion) => {
    const isExpanded = expandedId === item.id;
    const isConfirming = confirmDeleteId === item.questionId;

    return (
      <div
        key={item.id}
        className={`${styles.card} ${isExpanded ? styles.cardExpanded : ''}`}
        onClick={() => handleCardClick(item.id)}
      >
        <div className={styles.cardHeader}>
          <div className={styles.cardContent}>
            <div className={styles.notePreview}>
              {isExpanded ? '' : truncateContent(item.content)}
            </div>
            <div className={styles.questionPreview}>
              {item.question.text.length > 80
                ? item.question.text.slice(0, 80) + '...'
                : item.question.text}
            </div>
            <div className={styles.cardMeta}>
              {item.domain && (
                <span className={`${styles.badge} ${styles.domainBadge}`}>{item.domain.name}</span>
              )}
              {item.topic && <span className={styles.badge}>{item.topic.name}</span>}
              <span className={styles.timestamp}>
                {new Date(item.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className={styles.cardActions}>
            <button
              className={`${styles.deleteBtn} ${isConfirming ? styles.deleteBtnConfirm : ''}`}
              onClick={(e) => handleDelete(e, item.questionId)}
              title={isConfirming ? 'Click again to confirm' : 'Delete note'}
              aria-label={isConfirming ? 'Confirm delete' : 'Delete note'}
            >
              {isConfirming ? (
                <span className={styles.confirmText}>Delete?</span>
              ) : (
                <svg
                  className={styles.deleteBtnIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className={styles.expandedContent}>
            <div className={styles.questionSection}>
              <div className={styles.sectionLabel}>Question</div>
              <div className={styles.questionFull}>{item.question.text}</div>
              <ul className={styles.optionsList}>
                {item.question.options.map((opt: string, idx: number) => (
                  <li
                    key={idx}
                    className={`${styles.option} ${item.question.correctAnswers.includes(idx) ? styles.optionCorrect : ''}`}
                  >
                    {opt}
                  </li>
                ))}
              </ul>
              {item.question.explanation && (
                <div className={styles.explanation}>
                  <div className={styles.explanationLabel}>Explanation</div>
                  {item.question.explanation}
                </div>
              )}
            </div>
            <div className={styles.noteSection}>
              <div className={styles.sectionLabel}>Your Note</div>
              <NotesPanel questionId={item.questionId} defaultExpanded={true} />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderEmptyState = () => (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </div>
      <div className={styles.emptyTitle}>No notes yet</div>
      <div className={styles.emptyText}>
        Add notes to questions during study or exam review to build your personal knowledge base.
      </div>
    </div>
  );

  const renderLoadingSkeleton = () => (
    <div className={styles.skeleton}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.skeletonCard} />
      ))}
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>My Notes</h1>
        {!isLoading && notes.length > 0 && (
          <span className={styles.noteCount}>
            {notes.length} note{notes.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!isLoading && notes.length > 0 && (
        <div className={styles.toolbar}>
          <div className={styles.searchWrapper}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className={styles.filters}>
            <select
              className={styles.filterSelect}
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
              aria-label="Filter by domain"
            >
              <option value="">All domains</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              className={styles.filterSelect}
              value={filterTopic}
              onChange={(e) => setFilterTopic(e.target.value)}
              aria-label="Filter by topic"
            >
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              className={styles.filterSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Sort by"
            >
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
            </select>
          </div>
        </div>
      )}

      {isLoading ? (
        renderLoadingSkeleton()
      ) : filteredNotes.length > 0 ? (
        <div className={styles.cardList}>{filteredNotes.map(renderNoteCard)}</div>
      ) : notes.length > 0 && (search || filterDomain || filterTopic) ? (
        <div className={styles.noResults}>
          <div className={styles.noResultsText}>No notes match your filters</div>
          <button
            className={styles.clearFiltersBtn}
            onClick={() => {
              setSearch('');
              setFilterDomain('');
              setFilterTopic('');
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        renderEmptyState()
      )}
    </div>
  );
}
