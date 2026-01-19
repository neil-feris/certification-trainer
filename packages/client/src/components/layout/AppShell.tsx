import { ReactNode, useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CertificationSelector } from '../common/CertificationSelector';
import { useCertificationStore } from '../../stores/certificationStore';
import { useStudyStore } from '../../stores/studyStore';
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

  // Check for active practice session (hide nav during practice)
  const studySessionId = useStudyStore((s) => s.sessionId);
  const isPracticeActive = studySessionId !== null && location.pathname === '/study';

  const isExamActive =
    location.pathname.startsWith('/exam/') && !location.pathname.includes('/review');

  // Fetch review queue for due count (also used to detect active review session)
  const { data: reviewQueue = [] } = useQuery({
    queryKey: ['reviewQueue'],
    queryFn: questionApi.getReviewQueue,
    staleTime: 60000, // Consider fresh for 1 minute
  });

  // Hide nav during active review session (when on /review page with questions)
  const isReviewActive = location.pathname === '/review' && reviewQueue.length > 0;

  // Hide nav during exam, active practice session, or active review session
  const hideNavigation = isExamActive || isPracticeActive || isReviewActive;

  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );

  return (
    <div className={styles.shell}>
      {!hideNavigation && (
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
        className={`${styles.main} ${hideNavigation ? styles.mainFullWidth : styles.mainWithMobileNav}`}
      >
        {children}
      </main>

      {!hideNavigation && (
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
