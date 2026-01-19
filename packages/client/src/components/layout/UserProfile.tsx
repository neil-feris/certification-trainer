import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import styles from './UserProfile.module.css';

export function UserProfile() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on escape key
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

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      // Call logout endpoint to clear httpOnly cookie
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      // Continue with local logout even if API call fails
      console.error('Logout API error:', error);
    }

    // Clear local state
    logout();

    // Redirect to login
    navigate('/login');
  };

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        className={styles.profileButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className={styles.avatar}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={styles.avatarFallback}>{initials}</div>
        )}
        <span className={styles.userName}>{user.name}</span>
        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>▾</span>
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.userInfo}>
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className={styles.dropdownAvatar}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={styles.dropdownAvatarFallback}>{initials}</div>
            )}
            <div className={styles.userDetails}>
              <div className={styles.dropdownName}>{user.name}</div>
              <div className={styles.dropdownEmail}>{user.email}</div>
            </div>
          </div>

          <div className={styles.divider} />

          <button className={styles.signOutButton} onClick={handleSignOut}>
            <span className={styles.signOutIcon}>⎋</span>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
