import { useQuery } from '@tanstack/react-query';
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
import { progressApi, TrendDataPoint, Granularity } from '../../api/client';
import styles from './PerformanceTrendsChart.module.css';

interface PerformanceTrendsChartProps {
  certificationId?: number;
  granularity?: Granularity;
  passingScore?: number;
}

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
  certificationId,
  granularity = 'attempt',
  passingScore = 70,
}: PerformanceTrendsChartProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['trends', certificationId, granularity],
    queryFn: () => progressApi.getTrends(certificationId, granularity),
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

  if (!data || data.length === 0) {
    return null; // Parent handles empty state
  }

  // Group by certification for multi-line chart
  const certifications = [...new Set(data.map((d) => d.certificationCode))];
  const isSingleCert = certifications.length === 1;

  // Transform data for recharts: one point per date with certification scores
  const chartData = transformDataForChart(data, certifications, granularity);

  return (
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
