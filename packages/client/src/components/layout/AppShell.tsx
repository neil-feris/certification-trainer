import { ReactNode, useState, useEffect } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CertificationSelector } from '../common/CertificationSelector';
import { OfflineBanner } from '../common/OfflineBanner';
import { StreakDisplay } from '../common/StreakDisplay';
import { XPDisplay } from '../common/XPDisplay';
import { useCertificationStore } from '../../stores/certificationStore';
import { useStudyStore } from '../../stores/studyStore';
import { questionApi, progressApi } from '../../api/client';
import { getCachedQuestionCount } from '../../services/offlineStorage';
import { useSyncQueue } from '../../hooks/useSyncQueue';
import { UserProfile } from './UserProfile';
import { MobileNavBar } from './MobileNavBar';
import { MobileHeader } from './MobileHeader';
import { BottomSheet } from './BottomSheet';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: string;
  requiresCaseStudies?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: '◉' },
  { path: '/exam', label: 'Practice Exam', icon: '◈' },
  { path: '/study', label: 'Study', icon: '◎' },
  { path: '/case-studies', label: 'Case Studies', icon: '📋', requiresCaseStudies: true },
  { path: '/questions', label: 'Question Bank', icon: '☰' },
  { path: '/progress', label: 'Progress', icon: '◔' },
  { path: '/achievements', label: 'Achievements', icon: '🏆' },
  { path: '/review', label: 'Review', icon: '↻' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);
  const [cachedQuestionCount, setCachedQuestionCount] = useState(0);

  // Sync queue management
  const { pendingCount: pendingSyncCount } = useSyncQueue();

  // Load cached question count on mount and periodically refresh
  useEffect(() => {
    const loadCount = async () => {
      const count = await getCachedQuestionCount();
      setCachedQuestionCount(count);
    };

    loadCount();

    // Refresh count every 30 seconds (in case caching happens in background)
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, []);

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

  // Fetch streak data for navigation display
  const { data: streakData } = useQuery({
    queryKey: ['streak'],
    queryFn: progressApi.getStreak,
    staleTime: 60000, // Consider fresh for 1 minute
  });

  // Fetch XP data for level display
  const { data: xpData } = useQuery({
    queryKey: ['xp'],
    queryFn: progressApi.getXp,
    staleTime: 60000, // Consider fresh for 1 minute
  });

  // Hide nav during active review session (when on /review page with questions)
  const isReviewActive = location.pathname === '/review' && reviewQueue.length > 0;

  // Hide nav during exam, active practice session, or active review session
  const hideNavigation = isExamActive || isPracticeActive || isReviewActive;

  const selectedCert = useCertificationStore((s) =>
    s.certifications.find((c) => c.id === s.selectedCertificationId)
  );

  // Check certification capabilities for feature flags
  const hasCaseStudies = selectedCert?.capabilities?.hasCaseStudies ?? false;

  // Filter nav items based on certification capabilities
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.requiresCaseStudies || hasCaseStudies);

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
            {visibleNavItems.map((item) => (
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
            <div className={styles.footerStats}>
              {streakData && <StreakDisplay streak={streakData} variant="compact" />}
              {xpData && <XPDisplay xp={xpData} variant="compact" />}
            </div>
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

      <OfflineBanner
        cachedQuestionCount={cachedQuestionCount}
        pendingSyncCount={pendingSyncCount}
      />

      {!hideNavigation && <MobileHeader streakData={streakData} xpData={xpData} />}

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
              {hasCaseStudies && (
                <Link
                  to="/case-studies"
                  className={styles.moreNavLink}
                  onClick={() => setIsMoreSheetOpen(false)}
                >
                  <span className={styles.moreNavIcon}>📋</span>
                  <span>Case Studies</span>
                </Link>
              )}
              <Link
                to="/exam"
                className={styles.moreNavLink}
                onClick={() => setIsMoreSheetOpen(false)}
              >
                <span className={styles.moreNavIcon}>◈</span>
                <span>Practice Exam</span>
              </Link>
              {cachedQuestionCount > 0 && (
                <div className={styles.moreNavInfo}>
                  <span className={styles.moreNavIcon}>📥</span>
                  <span>{cachedQuestionCount} questions cached for offline</span>
                </div>
              )}
            </nav>
          </BottomSheet>
        </>
      )}
    </div>
  );
}
