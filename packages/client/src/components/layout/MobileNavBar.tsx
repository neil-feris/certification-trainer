import { NavLink } from 'react-router-dom';
import styles from './MobileNavBar.module.css';

interface MobileNavBarProps {
  reviewDueCount?: number;
  onMoreClick?: () => void;
}

export function MobileNavBar({ reviewDueCount = 0, onMoreClick }: MobileNavBarProps) {
  return (
    <nav className={styles.navbar}>
      <NavLink
        to="/dashboard"
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.icon}>◉</span>
        <span className={styles.label}>Home</span>
      </NavLink>

      <NavLink
        to="/study"
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.icon}>◎</span>
        <span className={styles.label}>Study</span>
      </NavLink>

      <NavLink
        to="/review"
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.icon}>↻</span>
        <span className={styles.label}>Review</span>
        {reviewDueCount > 0 && (
          <span className={styles.badge}>{reviewDueCount > 99 ? '99+' : reviewDueCount}</span>
        )}
      </NavLink>

      <button type="button" className={styles.tab} onClick={onMoreClick}>
        <span className={styles.icon}>☰</span>
        <span className={styles.label}>More</span>
      </button>
    </nav>
  );
}
