import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTimerOptions {
  initialSeconds: number;
  onComplete?: () => void;
  onWarning?: (secondsRemaining: number) => void;
  warningThresholds?: number[]; // e.g., [300, 60] for 5min and 1min warnings
  autoStart?: boolean;
}

interface UseTimerReturn {
  timeRemaining: number;
  formattedTime: string;
  isRunning: boolean;
  isExpired: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: (newSeconds?: number) => void;
  percentRemaining: number;
}

export function useTimer({
  initialSeconds,
  onComplete,
  onWarning,
  warningThresholds = [300, 60], // Default: 5min and 1min warnings
  autoStart = false,
}: UseTimerOptions): UseTimerReturn {
  const [timeRemaining, setTimeRemaining] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const firedWarningsRef = useRef<Set<number>>(new Set());

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const start = useCallback(() => {
    if (!isExpired && timeRemaining > 0) {
      setIsRunning(true);
    }
  }, [isExpired, timeRemaining]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const resume = useCallback(() => {
    if (!isExpired && timeRemaining > 0) {
      setIsRunning(true);
    }
  }, [isExpired, timeRemaining]);

  const reset = useCallback(
    (newSeconds?: number) => {
      clearTimer();
      setTimeRemaining(newSeconds ?? initialSeconds);
      setIsRunning(false);
      setIsExpired(false);
      firedWarningsRef.current.clear();
    },
    [clearTimer, initialSeconds]
  );

  // Timer tick effect
  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      intervalRef.current = window.setInterval(() => {
        setTimeRemaining((prev) => {
          const newTime = prev - 1;

          // Check warning thresholds
          if (onWarning) {
            for (const threshold of warningThresholds) {
              if (newTime === threshold && !firedWarningsRef.current.has(threshold)) {
                firedWarningsRef.current.add(threshold);
                onWarning(threshold);
              }
            }
          }

          // Check expiration
          if (newTime <= 0) {
            setIsRunning(false);
            setIsExpired(true);
            onComplete?.();
            return 0;
          }

          return newTime;
        });
      }, 1000);
    }

    return clearTimer;
  }, [isRunning, timeRemaining, onComplete, onWarning, warningThresholds, clearTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  return {
    timeRemaining,
    formattedTime: formatTime(timeRemaining),
    isRunning,
    isExpired,
    start,
    pause,
    resume,
    reset,
    percentRemaining: Math.round((timeRemaining / initialSeconds) * 100),
  };
}
