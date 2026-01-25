import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { shareApi } from '../../api/client';
import { showToast } from '../common/Toast';
import styles from './ShareButton.module.css';

interface ShareButtonProps {
  examId: number;
  score: number;
  certificationName: string;
  className?: string;
}

type ShareTarget = 'twitter' | 'linkedin' | 'copy';

/**
 * ShareButton component with dropdown menu for sharing exam results.
 * Supports Twitter/X, LinkedIn, and copy to clipboard.
 */
export function ShareButton({ examId, score, certificationName, className }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const createShareLinkMutation = useMutation({
    mutationFn: () => shareApi.createShareLink(examId),
    onSuccess: (data) => {
      setShareUrl(data.shareUrl);
    },
    onError: () => {
      showToast({
        message: 'Failed to create share link. Please try again.',
        type: 'error',
      });
    },
  });

  const handleToggleDropdown = useCallback(() => {
    if (!isOpen && !shareUrl && !createShareLinkMutation.isPending) {
      // Pre-fetch share link when opening dropdown
      createShareLinkMutation.mutate();
    }
    setIsOpen(!isOpen);
  }, [isOpen, shareUrl, createShareLinkMutation]);

  const getShareText = () => {
    const scoreText = Math.round(score);
    return `I scored ${scoreText}% on my ${certificationName} practice exam! Preparing with ACE Prep.`;
  };

  const handleShare = useCallback(
    async (target: ShareTarget) => {
      // Ensure we have a share URL
      if (!shareUrl && !createShareLinkMutation.isPending) {
        try {
          const result = await createShareLinkMutation.mutateAsync();
          setShareUrl(result.shareUrl);
          performShare(target, result.shareUrl);
        } catch {
          // Error already handled by mutation onError
        }
        return;
      }

      if (shareUrl) {
        performShare(target, shareUrl);
      }
    },
    [shareUrl, createShareLinkMutation]
  );

  const performShare = (target: ShareTarget, url: string) => {
    const text = getShareText();

    switch (target) {
      case 'twitter': {
        const twitterUrl = new URL('https://twitter.com/intent/tweet');
        twitterUrl.searchParams.set('text', text);
        twitterUrl.searchParams.set('url', url);
        window.open(twitterUrl.toString(), '_blank', 'width=550,height=420,noopener,noreferrer');
        setIsOpen(false);
        break;
      }
      case 'linkedin': {
        const linkedinUrl = new URL('https://www.linkedin.com/sharing/share-offsite/');
        linkedinUrl.searchParams.set('url', url);
        window.open(linkedinUrl.toString(), '_blank', 'width=550,height=520,noopener,noreferrer');
        setIsOpen(false);
        break;
      }
      case 'copy': {
        navigator.clipboard
          .writeText(url)
          .then(() => {
            showToast({
              message: 'Link copied to clipboard!',
              type: 'success',
            });
            setIsOpen(false);
          })
          .catch(() => {
            showToast({
              message: 'Failed to copy link. Please try again.',
              type: 'error',
            });
          });
        break;
      }
    }
  };

  const isLoading = createShareLinkMutation.isPending;

  return (
    <div className={`${styles.container} ${className ?? ''}`}>
      <button
        ref={buttonRef}
        className={`${styles.shareBtn} ${isLoading ? styles.loading : ''}`}
        onClick={handleToggleDropdown}
        aria-haspopup="true"
        aria-expanded={isOpen}
        disabled={isLoading}
      >
        {isLoading ? (
          <span className={styles.spinner} />
        ) : (
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        )}
        <span>Share</span>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div ref={dropdownRef} className={styles.dropdown} role="menu">
          <button
            className={styles.dropdownItem}
            onClick={() => handleShare('twitter')}
            role="menuitem"
            disabled={isLoading}
          >
            <svg className={styles.socialIcon} viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span>Share on X</span>
          </button>

          <button
            className={styles.dropdownItem}
            onClick={() => handleShare('linkedin')}
            role="menuitem"
            disabled={isLoading}
          >
            <svg className={styles.socialIcon} viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
            </svg>
            <span>Share on LinkedIn</span>
          </button>

          <div className={styles.divider} />

          <button
            className={styles.dropdownItem}
            onClick={() => handleShare('copy')}
            role="menuitem"
            disabled={isLoading}
          >
            <svg
              className={styles.socialIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>Copy Link</span>
          </button>
        </div>
      )}
    </div>
  );
}
