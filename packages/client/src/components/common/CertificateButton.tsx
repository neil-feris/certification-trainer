import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { certificateApi } from '../../api/client';
import { showToast } from './Toast';
import styles from './CertificateButton.module.css';

interface CertificateButtonProps {
  examId: number;
  score: number;
  className?: string;
}

const PASSING_SCORE = 70;

export function CertificateButton({ examId, score, className }: CertificateButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const generateMutation = useMutation({
    mutationFn: () => certificateApi.generate(examId),
    onSuccess: async (data) => {
      // Start PDF download
      setIsDownloading(true);
      try {
        const downloadUrl = certificateApi.getDownloadUrl(data.certificateHash);
        const response = await fetch(downloadUrl, { credentials: 'include' });

        if (!response.ok) {
          throw new Error('Failed to download certificate');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `certificate-${data.certificateHash}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showToast({
          message: 'Certificate download started!',
          type: 'success',
          duration: 3000,
        });
      } catch {
        showToast({
          message: 'Failed to download certificate. Please try again.',
          type: 'error',
          duration: 5000,
        });
      } finally {
        setIsDownloading(false);
      }
    },
    onError: (error: Error) => {
      showToast({
        message: error.message || 'Failed to generate certificate.',
        type: 'error',
        duration: 5000,
      });
    },
  });

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!generateMutation.isPending && !isDownloading) {
        generateMutation.mutate();
      }
    },
    [generateMutation, isDownloading]
  );

  // Only show button if score meets passing threshold
  if (score < PASSING_SCORE) {
    return null;
  }

  const isLoading = generateMutation.isPending || isDownloading;

  return (
    <button
      className={`${styles.certificateBtn} ${isLoading ? styles.loading : ''} ${className ?? ''}`}
      onClick={handleClick}
      disabled={isLoading}
      aria-label="Download Certificate"
      title="Download Certificate"
    >
      {isLoading ? (
        <svg
          className={styles.spinner}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <path d="M12 18v-6" />
          <path d="M9 15l3 3 3-3" />
        </svg>
      )}
      <span className={styles.label}>{isLoading ? 'Generating...' : 'Download Certificate'}</span>
    </button>
  );
}
