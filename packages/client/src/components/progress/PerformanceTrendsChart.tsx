import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { progressApi, certificationApi, TrendDataPoint, Granularity } from '../../api/client';
import styles from './PerformanceTrendsChart.module.css';

interface PerformanceTrendsChartProps {
  initialCertificationId?: number | null;
  initialGranularity?: Granularity;
  passingScore?: number;
}

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'attempt', label: 'Each Attempt' },
  { value: 'day', label: 'By Day' },
  { value: 'week', label: 'By Week' },
];

// Color palette for different certifications
const COLORS = [
  'var(--accent-primary)',
  'var(--success)',
  'var(--warning)',
  'var(--info)',
  '#e91e63',
  '#9c27b0',
];

function formatDate(dateStr: string, granularity: Granularity): string {
  if (granularity === 'attempt') {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  if (granularity === 'week') {
    // Format: 2025-W01 -> W01
    return dateStr.split('-').slice(1).join('-');
  }
  // day: 2025-01-14 -> Jan 14
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PerformanceTrendsChart({
  initialCertificationId = null,
  initialGranularity = 'attempt',
  passingScore = 70,
}: PerformanceTrendsChartProps) {
  const navigate = useNavigate();
  const [granularity, setGranularity] = useState<Granularity>(initialGranularity);
  const [selectedCertificationId, setSelectedCertificationId] = useState<number | null>(
    initialCertificationId ?? null
  );
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Fetch available certifications for filter dropdown
  const { data: availableCerts } = useQuery({
    queryKey: ['certifications'],
    queryFn: certificationApi.list,
    staleTime: 5 * 60 * 1000,
  });

  // Get display label for currently selected certification
  const selectedCertLabel =
    selectedCertificationId === null
      ? 'All Certifications'
      : (availableCerts?.find((c) => c.id === selectedCertificationId)?.shortName ?? 'Loading...');

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['trends', selectedCertificationId, granularity],
    queryFn: () => progressApi.getTrends(selectedCertificationId ?? undefined, granularity),
  });

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className="animate-pulse">Loading trends...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>Failed to load trends data</p>
      </div>
    );
  }

  // Handle empty states based on total exam count
  const totalExamCount = data?.totalExamCount ?? 0;
  const trendData = data?.data ?? [];

  if (!isLoading && !error && totalExamCount === 0) {
    // No completed exams at all
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📊</div>
        <h3 className={styles.emptyTitle}>No Exam Data Yet</h3>
        <p className={styles.emptyMessage}>
          Complete your first practice exam to start tracking your progress over time.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/exam')}>
          Start Practice Exam
        </button>
      </div>
    );
  }

  if (!isLoading && !error && totalExamCount === 1) {
    // Only 1 completed exam - need at least 2 for trends
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📈</div>
        <h3 className={styles.emptyTitle}>One More Exam Needed</h3>
        <p className={styles.emptyMessage}>
          Complete one more practice exam to see your performance trends over time.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/exam')}>
          Take Another Exam
        </button>
      </div>
    );
  }

  if (trendData.length === 0) {
    return null;
  }

  // Group by certification for multi-line chart
  const certifications = [...new Set(trendData.map((d) => d.certificationCode))];
  const isSingleCert = certifications.length === 1;

  // Transform data for recharts: one point per date with certification scores
  const chartData = transformDataForChart(trendData, certifications, granularity);

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        {/* Certification Filter Dropdown */}
        <div className={styles.filterDropdown} ref={filterRef}>
          <button
            type="button"
            className={styles.filterTrigger}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            aria-expanded={isFilterOpen}
            aria-haspopup="listbox"
          >
            <span className={styles.filterLabel}>{selectedCertLabel}</span>
            <span className={styles.filterChevron}>{isFilterOpen ? '▲' : '▼'}</span>
          </button>
          {isFilterOpen && (
            <div className={styles.filterMenu} role="listbox">
              <button
                type="button"
                className={`${styles.filterOption} ${selectedCertificationId === null ? styles.filterOptionActive : ''}`}
                onClick={() => {
                  setSelectedCertificationId(null);
                  setIsFilterOpen(false);
                }}
                role="option"
                aria-selected={selectedCertificationId === null}
              >
                All Certifications
                {selectedCertificationId === null && <span className={styles.checkmark}>✓</span>}
              </button>
              {availableCerts?.map((cert) => (
                <button
                  key={cert.id}
                  type="button"
                  className={`${styles.filterOption} ${selectedCertificationId === cert.id ? styles.filterOptionActive : ''}`}
                  onClick={() => {
                    setSelectedCertificationId(cert.id);
                    setIsFilterOpen(false);
                  }}
                  role="option"
                  aria-selected={selectedCertificationId === cert.id}
                >
                  {cert.shortName}
                  {selectedCertificationId === cert.id && (
                    <span className={styles.checkmark}>✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Granularity Toggle */}
        <div className={styles.granularityToggle} role="group" aria-label="Granularity">
          {GRANULARITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.toggleButton} ${granularity === option.value ? styles.toggleButtonActive : ''}`}
              onClick={() => setGranularity(option.value)}
              aria-pressed={granularity === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
              tickLine={{ stroke: 'var(--border-color)' }}
              axisLine={{ stroke: 'var(--border-color)' }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
              tickLine={{ stroke: 'var(--border-color)' }}
              axisLine={{ stroke: 'var(--border-color)' }}
              tickFormatter={(val) => `${val}%`}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius)',
                color: 'var(--text-primary)',
              }}
              formatter={(value: number) => [`${value}%`, 'Score']}
            />
            <ReferenceLine
              y={passingScore}
              stroke="var(--success)"
              strokeDasharray="5 5"
              label={{
                value: `${passingScore}% Passing`,
                position: 'insideTopRight',
                fill: 'var(--success)',
                fontSize: 11,
              }}
            />
            {isSingleCert ? (
              <Line
                type="monotone"
                dataKey={certifications[0]}
                stroke={COLORS[0]}
                strokeWidth={2}
                dot={{ fill: COLORS[0], strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
                connectNulls
              />
            ) : (
              certifications.map((cert, index) => (
                <Line
                  key={cert}
                  type="monotone"
                  dataKey={cert}
                  name={cert}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={{ fill: COLORS[index % COLORS.length], strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  connectNulls
                />
              ))
            )}
            {!isSingleCert && (
              <Legend
                wrapperStyle={{ paddingTop: 16 }}
                formatter={(value) => <span style={{ color: 'var(--text-primary)' }}>{value}</span>}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function transformDataForChart(
  data: TrendDataPoint[],
  certifications: string[],
  granularity: Granularity
): Record<string, string | number | null>[] {
  // Group points by date
  const dateMap = new Map<string, Record<string, number>>();

  for (const point of data) {
    const formattedDate = formatDate(point.date, granularity);
    if (!dateMap.has(formattedDate)) {
      dateMap.set(formattedDate, {});
    }
    dateMap.get(formattedDate)![point.certificationCode] = point.score;
  }

  // Convert to array with all certifications
  return Array.from(dateMap.entries()).map(([date, scores]) => {
    const row: Record<string, string | number | null> = { date };
    for (const cert of certifications) {
      row[cert] = scores[cert] ?? null;
    }
    return row;
  });
}
