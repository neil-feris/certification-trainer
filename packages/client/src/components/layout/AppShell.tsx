import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '◉' },
  { path: '/exam', label: 'Practice Exam', icon: '◈' },
  { path: '/study', label: 'Study', icon: '◎' },
  { path: '/review', label: 'Review', icon: '↻' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const isExamActive =
    location.pathname.startsWith('/exam/') && !location.pathname.includes('/review');

  return (
    <div className={styles.shell}>
      {!isExamActive && (
        <aside className={styles.sidebar}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>☁</span>
            <span className={styles.logoText}>ACE Prep</span>
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
            <div className={styles.footerText}>
              <span className="mono">GCP</span> Associate Cloud Engineer
            </div>
          </div>
        </aside>
      )}

      <main className={`${styles.main} ${isExamActive ? styles.mainFullWidth : ''}`}>
        {children}
      </main>
    </div>
  );
}
