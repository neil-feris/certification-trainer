import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { CertificateVerification } from '@ace-prep/shared';
import { certificateApi } from '../api/client';
import styles from './VerifyCertificatePage.module.css';

export function VerifyCertificatePage() {
  const { hash } = useParams<{ hash: string }>();
  const [verification, setVerification] = useState<CertificateVerification | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verifyCertificate() {
      if (!hash) {
        setError('No certificate hash provided');
        setIsLoading(false);
        return;
      }

      try {
        const result = await certificateApi.verify(hash);
        setVerification(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to verify certificate');
        setVerification({
          valid: false,
          certificationName: null,
          score: null,
          issuedAt: null,
        });
      } finally {
        setIsLoading(false);
      }
    }

    verifyCertificate();
  }, [hash]);

  const formatDate = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return 'Unknown';
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.backgroundPattern} />

      <div className={styles.card}>
        <div className={styles.logoSection}>
          <div className={styles.logoIcon}>
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="4" width="40" height="40" rx="8" fill="url(#logoGradient)" />
              <path
                d="M16 24L22 30L32 18"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="logoGradient" x1="4" y1="4" x2="44" y2="44">
                  <stop stopColor="#00d4aa" />
                  <stop offset="1" stopColor="#0099cc" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className={styles.title}>Certificate Verification</h1>
        </div>

        {isLoading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Verifying certificate...</span>
          </div>
        )}

        {!isLoading && verification?.valid && (
          <div className={styles.resultSection}>
            <div className={styles.validBadge}>
              <svg className={styles.validIcon} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.15" />
                <path
                  d="M8 12L11 15L16 9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Valid Certificate</span>
            </div>

            <div className={styles.certificateDetails}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Certification</span>
                <span className={styles.detailValue}>{verification.certificationName}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Score</span>
                <span className={styles.detailValue}>{verification.score}%</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Issued</span>
                <span className={styles.detailValue}>{formatDate(verification.issuedAt)}</span>
              </div>
            </div>

            <p className={styles.verifiedMessage}>
              This certificate has been verified as authentic and was issued by the Certification
              Trainer platform.
            </p>
          </div>
        )}

        {!isLoading && (!verification || !verification.valid) && (
          <div className={styles.resultSection}>
            <div className={styles.invalidBadge}>
              <svg className={styles.invalidIcon} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.15" />
                <path
                  d="M15 9L9 15M9 9L15 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Invalid Certificate</span>
            </div>

            <p className={styles.errorMessage}>
              {error ||
                'This certificate could not be verified. It may be invalid, expired, or the verification code was entered incorrectly.'}
            </p>
          </div>
        )}

        <div className={styles.ctaSection}>
          <p className={styles.ctaText}>Ready to earn your own certification?</p>
          <Link to="/login" className={styles.ctaButton}>
            Get Started with Certification Trainer
          </Link>
        </div>
      </div>

      <footer className={styles.footer}>
        <span>Certification Trainer &mdash; AI-powered exam preparation</span>
      </footer>
    </div>
  );
}
