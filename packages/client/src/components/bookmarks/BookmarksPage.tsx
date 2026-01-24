import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { bookmarksApi } from '../../api/client';
import { NotesPanel } from '../common/NotesPanel';
import { showToast } from '../common/Toast';
import styles from './BookmarksPage.module.css';

import type { Bookmark, BookmarkTargetType, Domain, Topic, Question, Note } from '@ace-prep/shared';

type Tab = 'all' | 'question' | 'topic' | 'domain';

interface BookmarkedQuestionItem extends Question {
  isBookmarked: boolean;
  note?: Note | null;
  domain?: Domain;
  topic?: Topic;
  bookmarkedAt?: string;
}

const TAB_CONFIG: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'question', label: 'Questions' },
  { key: 'topic', label: 'Topics' },
  { key: 'domain', label: 'Domains' },
];

const EMPTY_MESSAGES: Record<Tab, { icon: string; title: string; text: string }> = {
  all: {
    icon: '📌',
    title: 'No bookmarks yet',
    text: 'Bookmark questions, topics, or domains during study to save them here.',
  },
  question: {
    icon: '❓',
    title: 'No bookmarked questions',
    text: 'Bookmark questions during exams or study sessions to review them later.',
  },
  topic: {
    icon: '📂',
    title: 'No bookmarked topics',
    text: 'Bookmark topics you want to focus on for quick access.',
  },
  domain: {
    icon: '🏷',
    title: 'No bookmarked domains',
    text: 'Bookmark domains to track areas of focus.',
  },
};

export function BookmarksPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Fetch bookmarked questions (with full joined data)
  const { data: bookmarkedQuestions = [], isLoading: questionsLoading } = useQuery({
    queryKey: ['bookmarks', 'questions'],
    queryFn: bookmarksApi.listQuestions,
    staleTime: 30_000,
  });

  // Fetch all bookmarks (for topics/domains)
  const { data: allBookmarks = [], isLoading: bookmarksLoading } = useQuery({
    queryKey: ['bookmarks', 'all'],
    queryFn: () => bookmarksApi.list(),
    staleTime: 30_000,
  });

  const isLoading = questionsLoading || bookmarksLoading;

  // Remove bookmark mutation
  const removeMutation = useMutation({
    mutationFn: ({ targetType, targetId }: { targetType: BookmarkTargetType; targetId: number }) =>
      bookmarksApi.toggle(targetType, targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarkCheck'] });
      showToast({ message: 'Bookmark removed', type: 'success' });
    },
    onError: () => {
      showToast({ message: 'Failed to remove bookmark', type: 'error' });
    },
  });

  // Filter bookmarks by type
  const topicBookmarks = useMemo(
    () => allBookmarks.filter((b: Bookmark) => b.targetType === 'topic'),
    [allBookmarks]
  );

  const domainBookmarks = useMemo(
    () => allBookmarks.filter((b: Bookmark) => b.targetType === 'domain'),
    [allBookmarks]
  );

  // Search filter
  const filteredQuestions = useMemo(() => {
    if (!search.trim()) return bookmarkedQuestions;
    const q = search.toLowerCase();
    return bookmarkedQuestions.filter(
      (item: BookmarkedQuestionItem) =>
        item.questionText.toLowerCase().includes(q) ||
        item.domain?.name?.toLowerCase().includes(q) ||
        item.topic?.name?.toLowerCase().includes(q)
    );
  }, [bookmarkedQuestions, search]);

  const filteredTopics = useMemo(() => {
    if (!search.trim()) return topicBookmarks;
    const q = search.toLowerCase();
    return topicBookmarks.filter((b: Bookmark) => String(b.targetId).includes(q));
  }, [topicBookmarks, search]);

  const filteredDomains = useMemo(() => {
    if (!search.trim()) return domainBookmarks;
    const q = search.toLowerCase();
    return domainBookmarks.filter((b: Bookmark) => String(b.targetId).includes(q));
  }, [domainBookmarks, search]);

  // Count per tab
  const counts: Record<Tab, number> = {
    all: bookmarkedQuestions.length + topicBookmarks.length + domainBookmarks.length,
    question: bookmarkedQuestions.length,
    topic: topicBookmarks.length,
    domain: domainBookmarks.length,
  };

  const handleRemove = useCallback(
    (e: React.MouseEvent, targetType: BookmarkTargetType, targetId: number) => {
      e.stopPropagation();
      removeMutation.mutate({ targetType, targetId });
    },
    [removeMutation]
  );

  const handleCardClick = useCallback((questionId: number) => {
    setExpandedId((prev) => (prev === questionId ? null : questionId));
  }, []);

  // Render functions
  const renderQuestionCard = (item: BookmarkedQuestionItem) => {
    const isExpanded = expandedId === item.id;

    return (
      <div
        key={item.id}
        className={`${styles.card} ${isExpanded ? styles.cardExpanded : ''}`}
        onClick={() => handleCardClick(item.id)}
      >
        <div className={styles.cardHeader}>
          <div className={styles.cardContent}>
            <div className={`${styles.questionText} ${isExpanded ? styles.questionTextFull : ''}`}>
              {item.questionText}
            </div>
            <div className={styles.cardMeta}>
              {item.domain && (
                <span className={`${styles.badge} ${styles.domainBadge}`}>{item.domain.name}</span>
              )}
              {item.topic && <span className={styles.badge}>{item.topic.name}</span>}
              {item.note && (
                <span className={styles.noteIndicator}>
                  <svg
                    className={styles.noteIndicatorIcon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Note
                </span>
              )}
            </div>
          </div>
          <div className={styles.cardActions}>
            <button
              className={styles.removeBtn}
              onClick={(e) => handleRemove(e, 'question', item.id)}
              title="Remove bookmark"
              aria-label="Remove bookmark"
            >
              <svg
                className={styles.removeBtnIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className={styles.expandedContent}>
            <ul className={styles.optionsList}>
              {item.options.map((opt: string, idx: number) => (
                <li
                  key={idx}
                  className={`${styles.option} ${item.correctAnswers.includes(idx) ? styles.optionCorrect : ''}`}
                >
                  {opt}
                </li>
              ))}
            </ul>
            {item.explanation && (
              <div className={styles.explanation}>
                <div className={styles.explanationLabel}>Explanation</div>
                {item.explanation}
              </div>
            )}
            <NotesPanel questionId={item.id} defaultExpanded={!!item.note} />
          </div>
        )}
      </div>
    );
  };

  const renderBookmarkCard = (bookmark: Bookmark, type: 'topic' | 'domain') => {
    const studyPath = type === 'topic' ? `/study` : `/study`;
    return (
      <div key={bookmark.id} className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardContent}>
            <div className={styles.itemName}>
              {type === 'topic' ? 'Topic' : 'Domain'} #{bookmark.targetId}
            </div>
            <Link to={studyPath} className={styles.itemLink} onClick={(e) => e.stopPropagation()}>
              Study this {type} →
            </Link>
          </div>
          <div className={styles.cardActions}>
            <button
              className={styles.removeBtn}
              onClick={(e) => handleRemove(e, type, bookmark.targetId)}
              title="Remove bookmark"
              aria-label="Remove bookmark"
            >
              <svg
                className={styles.removeBtnIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderEmptyState = (tab: Tab) => {
    const msg = EMPTY_MESSAGES[tab];
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>{msg.icon}</div>
        <div className={styles.emptyTitle}>{msg.title}</div>
        <div className={styles.emptyText}>{msg.text}</div>
      </div>
    );
  };

  const renderLoadingSkeleton = () => (
    <div className={styles.skeleton}>
      {[1, 2, 3].map((i) => (
        <div key={i} className={styles.skeletonCard} />
      ))}
    </div>
  );

  const renderContent = () => {
    if (isLoading) return renderLoadingSkeleton();

    switch (activeTab) {
      case 'question':
        return filteredQuestions.length > 0 ? (
          <div className={styles.cardList}>{filteredQuestions.map(renderQuestionCard)}</div>
        ) : (
          renderEmptyState('question')
        );
      case 'topic':
        return filteredTopics.length > 0 ? (
          <div className={styles.cardList}>
            {filteredTopics.map((b: Bookmark) => renderBookmarkCard(b, 'topic'))}
          </div>
        ) : (
          renderEmptyState('topic')
        );
      case 'domain':
        return filteredDomains.length > 0 ? (
          <div className={styles.cardList}>
            {filteredDomains.map((b: Bookmark) => renderBookmarkCard(b, 'domain'))}
          </div>
        ) : (
          renderEmptyState('domain')
        );
      case 'all':
      default: {
        const hasAny =
          filteredQuestions.length > 0 || filteredTopics.length > 0 || filteredDomains.length > 0;
        if (!hasAny) return renderEmptyState('all');
        return (
          <div className={styles.cardList}>
            {filteredQuestions.map(renderQuestionCard)}
            {filteredTopics.map((b: Bookmark) => renderBookmarkCard(b, 'topic'))}
            {filteredDomains.map((b: Bookmark) => renderBookmarkCard(b, 'domain'))}
          </div>
        );
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <h1>Bookmarks</h1>
          <Link to="/notes" className={styles.notesLink}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            My Notes
          </Link>
        </div>
        <div className={styles.tabs}>
          {TAB_CONFIG.map(({ key, label }) => (
            <button
              key={key}
              className={`${styles.tab} ${activeTab === key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
              {counts[key] > 0 && <span className={styles.tabCount}>{counts[key]}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.searchBar}>
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
            placeholder="Search bookmarks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {renderContent()}
    </div>
  );
}
