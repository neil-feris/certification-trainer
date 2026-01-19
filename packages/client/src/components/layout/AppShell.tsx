import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CertificationSelector } from '../common/CertificationSelector';
import { useCertificationStore } from '../../stores/certificationStore';
import { UserProfile } from './UserProfile';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '◉' },
  { path: '/exam', label: 'Practice Exam', icon: '◈' },
  { path: '/study', label: 'Study', icon: '◎' },
  { path: '/questions', label: 'Question Bank', icon: '☰' },
  { path: '/progress', label: 'Progress', icon: '◔' },
  { path: '/review', label: 'Review', icon: '↻' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const isExamActive =
    location.pathname.startsWith('/exam/') && !location.pathname.includes('/review');

  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );

  return (
    <div className={styles.shell}>
      {!isExamActive && (
        <aside className={styles.sidebar}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>☁</span>
            <span className={styles.logoText}>Cert Trainer</span>
          </div>

          <div className={styles.certSelector}>
            <CertificationSelector />
          </div>

          <nav className={styles.nav}>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className={styles.footer}>
            <UserProfile />
            {selectedCert && (
              <div className={styles.footerText}>
                <span className="mono">{selectedCert.provider.toUpperCase()}</span>{' '}
                {selectedCert.name}
              </div>
            )}
          </div>
        </aside>
      )}

      <main className={`${styles.main} ${isExamActive ? styles.mainFullWidth : ''}`}>
        {children}
      </main>
    </div>
  );
}
