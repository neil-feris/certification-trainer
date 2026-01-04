import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { certificationApi } from '../../api/client';
import { useCertificationStore } from '../../stores/certificationStore';
import styles from './CertificationSelector.module.css';

const PROVIDER_ICONS: Record<string, string> = {
  gcp: '☁',
  aws: '◈',
  azure: '◆',
};

const PROVIDER_COLORS: Record<string, string> = {
  gcp: '#4285f4',
  aws: '#ff9900',
  azure: '#0078d4',
};

export function CertificationSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { selectedCertificationId, setSelectedCertification, setCertifications, certifications } =
    useCertificationStore();

  const { data: fetchedCerts, isLoading } = useQuery({
    queryKey: ['certifications'],
    queryFn: certificationApi.list,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Sync fetched certifications to store
  useEffect(() => {
    if (fetchedCerts && fetchedCerts.length > 0) {
      setCertifications(fetchedCerts);
    }
  }, [fetchedCerts, setCertifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCert = certifications.find((c) => c.id === selectedCertificationId);

  if (isLoading || certifications.length === 0) {
    return (
      <div className={styles.selector}>
        <div className={styles.skeleton} />
      </div>
    );
  }

  // If only one certification, show it without dropdown
  if (certifications.length === 1) {
    return (
      <div className={styles.singleCert}>
        <span
          className={styles.providerIcon}
          style={{ color: PROVIDER_COLORS[selectedCert?.provider || 'gcp'] }}
        >
          {PROVIDER_ICONS[selectedCert?.provider || 'gcp']}
        </span>
        <span className={styles.certName}>{selectedCert?.shortName}</span>
      </div>
    );
  }

  return (
    <div className={styles.selector} ref={dropdownRef}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span
          className={styles.providerIcon}
          style={{ color: PROVIDER_COLORS[selectedCert?.provider || 'gcp'] }}
        >
          {PROVIDER_ICONS[selectedCert?.provider || 'gcp']}
        </span>
        <span className={styles.certCode}>{selectedCert?.shortName}</span>
        <span className={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className={styles.dropdown} role="listbox">
          {certifications.map((cert) => (
            <button
              key={cert.id}
              className={`${styles.option} ${cert.id === selectedCertificationId ? styles.optionActive : ''}`}
              onClick={() => {
                setSelectedCertification(cert.id);
                setIsOpen(false);
              }}
              role="option"
              aria-selected={cert.id === selectedCertificationId}
            >
              <div className={styles.optionMain}>
                <span
                  className={styles.optionIcon}
                  style={{ color: PROVIDER_COLORS[cert.provider] }}
                >
                  {PROVIDER_ICONS[cert.provider]}
                </span>
                <div className={styles.optionText}>
                  <span className={styles.optionCode}>{cert.shortName}</span>
                  <span className={styles.optionName}>{cert.name}</span>
                </div>
              </div>
              <div className={styles.optionMeta}>
                <span className={styles.questionCount}>{cert.questionCount} Q</span>
                {cert.id === selectedCertificationId && <span className={styles.checkmark}>✓</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
