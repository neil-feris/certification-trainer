/**
 * ActivityHeatmap - Displays study activity by day of week and hour
 */

import { useMemo } from 'react';
import type { HeatmapDataPoint } from '@ace-prep/shared';
import styles from './StudyActivitySection.module.css';

interface ActivityHeatmapProps {
  data: HeatmapDataPoint[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_LABELS = [
  { hour: 6, label: '6am' },
  { hour: 12, label: '12pm' },
  { hour: 18, label: '6pm' },
  { hour: 22, label: '10pm' },
];

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  // Create a map for quick lookup
  const dataMap = useMemo(() => {
    const map = new Map<string, HeatmapDataPoint>();
    for (const point of data) {
      map.set(`${point.dayOfWeek}-${point.hour}`, point);
    }
    return map;
  }, [data]);

  // Calculate max value for color intensity
  const maxSeconds = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.max(...data.map((d) => d.totalSeconds));
  }, [data]);

  // Get intensity level (0-4) for color scaling
  const getIntensity = (seconds: number): number => {
    if (seconds === 0 || maxSeconds === 0) return 0;
    const ratio = seconds / maxSeconds;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  };

  return (
    <div className={styles.heatmapContainer}>
      <div className={styles.heatmapGrid}>
        {/* Hour labels row */}
        <div className={styles.heatmapRow}>
          <div className={styles.dayLabel}></div>
          {HOURS.map((hour) => {
            const labelEntry = HOUR_LABELS.find((l) => l.hour === hour);
            return (
              <div key={hour} className={styles.hourLabel}>
                {labelEntry?.label ?? ''}
              </div>
            );
          })}
        </div>

        {/* Data rows */}
        {DAYS.map((day, dayIndex) => (
          <div key={day} className={styles.heatmapRow}>
            <div className={styles.dayLabel}>{day}</div>
            {HOURS.map((hour) => {
              const point = dataMap.get(`${dayIndex}-${hour}`);
              const intensity = getIntensity(point?.totalSeconds ?? 0);
              return (
                <div
                  key={hour}
                  className={`${styles.heatmapCell} ${styles[`intensity${intensity}`]}`}
                  title={
                    point
                      ? `${day} ${hour}:00 - ${formatDuration(point.totalSeconds)} (${point.sessionCount} sessions)`
                      : `${day} ${hour}:00 - No activity`
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
