import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '../../api/client';
import { showToast } from './Toast';
import styles from './NotesPanel.module.css';

interface NotesPanelProps {
  questionId: number;
  className?: string;
  defaultExpanded?: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function NotesPanel({ questionId, className, defaultExpanded = false }: NotesPanelProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [initialized, setInitialized] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: noteData, isLoading } = useQuery({
    queryKey: ['note', questionId],
    queryFn: () => notesApi.get(questionId),
    staleTime: 30_000,
  });

  // Sync fetched note into local state on first load
  useEffect(() => {
    if (!initialized && !isLoading && noteData !== undefined) {
      const noteContent = noteData?.content ?? '';
      setContent(noteContent);
      if (noteContent) {
        setExpanded(true);
      }
      setInitialized(true);
    }
  }, [noteData, isLoading, initialized]);

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      if (text.trim() === '') {
        await notesApi.delete(questionId);
        return;
      }
      await notesApi.save(questionId, text);
    },
    onMutate: () => {
      setSaveStatus('saving');
    },
    onSuccess: () => {
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['note', questionId] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });

      // Clear "Saved" indicator after 2s
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    },
    onError: () => {
      setSaveStatus('error');
      showToast({
        message: 'Failed to save note. Try again.',
        type: 'error',
      });
    },
  });

  const debouncedSave = useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveMutation.mutate(text);
      }, 1000);
    },
    [saveMutation]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setContent(newContent);
      debouncedSave(newContent);
    },
    [debouncedSave]
  );

  const handleRetry = useCallback(() => {
    saveMutation.mutate(content);
  }, [saveMutation, content]);

  const handleExpand = useCallback(() => {
    setExpanded(true);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  if (isLoading && !initialized) {
    return (
      <div className={`${styles.notesPanel} ${className ?? ''}`}>
        <span className={styles.loading}>Loading notes...</span>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className={`${styles.notesPanel} ${className ?? ''}`}>
        <button className={styles.addNoteLink} onClick={handleExpand}>
          <svg
            className={styles.noteIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Add note
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.notesPanel} ${styles.expanded} ${className ?? ''}`}>
      <div className={styles.header}>
        <span className={styles.label}>
          <svg
            className={styles.noteIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Notes
        </span>
        {saveStatus !== 'idle' && (
          <span className={`${styles.status} ${styles[saveStatus]}`} aria-live="polite">
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'error' && (
              <>
                Error –{' '}
                <button className={styles.retryBtn} onClick={handleRetry}>
                  retry
                </button>
              </>
            )}
          </span>
        )}
      </div>
      <textarea
        className={styles.textarea}
        value={content}
        onChange={handleChange}
        placeholder="Add your notes..."
        maxLength={5000}
        rows={4}
      />
    </div>
  );
}
