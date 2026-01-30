/**
 * StudyProgressChart - Dual-axis line chart showing study time and questions answered
 */

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { DailyStudyDataPoint } from '@ace-prep/shared';
import styles from './StudyActivitySection.module.css';

interface StudyProgressChartProps {
  data: DailyStudyDataPoint[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  return hours.toFixed(1);
}

interface ChartDataPoint {
  date: string;
  displayDate: string;
  hours: number;
  questions: number;
}

export function StudyProgressChart({ data }: StudyProgressChartProps) {
  // Transform data for the chart
  const chartData: ChartDataPoint[] = data.map((point) => ({
    date: point.date,
    displayDate: formatDate(point.date),
    hours: parseFloat(formatHours(point.totalSeconds)),
    questions: point.questionsAnswered,
  }));

  if (chartData.length === 0) {
    return (
      <div className={styles.chartEmpty}>
        <p>No study activity in the last 30 days</p>
      </div>
    );
  }

  return (
    <div className={styles.chartContainer}>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            tickLine={{ stroke: 'var(--border)' }}
            axisLine={{ stroke: 'var(--border)' }}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            tickLine={{ stroke: 'var(--border)' }}
            axisLine={{ stroke: 'var(--border)' }}
            label={{
              value: 'Hours',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 11, fill: 'var(--text-secondary)' },
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            tickLine={{ stroke: 'var(--border)' }}
            axisLine={{ stroke: 'var(--border)' }}
            label={{
              value: 'Questions',
              angle: 90,
              position: 'insideRight',
              style: { fontSize: 11, fill: 'var(--text-secondary)' },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
            labelStyle={{ color: 'var(--text-primary)' }}
            formatter={(value, name) => {
              if (name === 'hours') return [`${value}h`, 'Study Time'];
              return [value, 'Questions'];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
            formatter={(value) => (value === 'hours' ? 'Study Time' : 'Questions')}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="hours"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--accent)' }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="questions"
            stroke="var(--success)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--success)' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
