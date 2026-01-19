import { ReactNode, useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CertificationSelector } from '../common/CertificationSelector';
import { useCertificationStore } from '../../stores/certificationStore';
import { questionApi } from '../../api/client';
import { UserProfile } from './UserProfile';
import { MobileNavBar } from './MobileNavBar';
import { BottomSheet } from './BottomSheet';
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
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);

  const isExamActive =
    location.pathname.startsWith('/exam/') && !location.pathname.includes('/review');

  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );

  // Fetch review queue for due count
  const { data: reviewQueue = [] } = useQuery({
    queryKey: ['reviewQueue'],
    queryFn: questionApi.getReviewQueue,
    staleTime: 60000, // Consider fresh for 1 minute
  });

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

      <main
        className={`${styles.main} ${isExamActive ? styles.mainFullWidth : styles.mainWithMobileNav}`}
      >
        {children}
      </main>

      {!isExamActive && (
        <>
          <MobileNavBar
            reviewDueCount={reviewQueue.length}
            onMoreClick={() => setIsMoreSheetOpen(true)}
          />
          <BottomSheet
            isOpen={isMoreSheetOpen}
            onClose={() => setIsMoreSheetOpen(false)}
            title="More"
          >
            <nav className={styles.moreNav}>
              <Link
                to="/settings"
                className={styles.moreNavLink}
                onClick={() => setIsMoreSheetOpen(false)}
              >
                <span className={styles.moreNavIcon}>⚙</span>
                <span>Settings</span>
              </Link>
              <Link
                to="/progress"
                className={styles.moreNavLink}
                onClick={() => setIsMoreSheetOpen(false)}
              >
                <span className={styles.moreNavIcon}>◔</span>
                <span>Progress</span>
              </Link>
              <Link
                to="/questions"
                className={styles.moreNavLink}
                onClick={() => setIsMoreSheetOpen(false)}
              >
                <span className={styles.moreNavIcon}>☰</span>
                <span>Question Bank</span>
              </Link>
              <Link
                to="/exam"
                className={styles.moreNavLink}
                onClick={() => setIsMoreSheetOpen(false)}
              >
                <span className={styles.moreNavIcon}>◈</span>
                <span>Practice Exam</span>
              </Link>
            </nav>
          </BottomSheet>
        </>
      )}
    </div>
  );
}
