import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { progressApi, certificationApi } from '../../api/client';
import { useCertificationStore } from '../../stores/certificationStore';
import type { DomainReadiness } from '@ace-prep/shared';
import styles from './ReadinessPage.module.css';

function getScoreColor(score: number): string {
  if (score >= 70) return 'var(--success)';
  if (score >= 50) return 'var(--warning)';
  return 'var(--error)';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ReadinessPage() {
  const navigate = useNavigate();
  const selectedCertificationId = useCertificationStore((s) => s.selectedCertificationId);
  const [certId, setCertId] = useState<number | null>(selectedCertificationId);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync with store when it changes
  useEffect(() => {
    if (selectedCertificationId !== null && certId === null) {
      setCertId(selectedCertificationId);
    }
  }, [selectedCertificationId, certId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: certifications } = useQuery({
    queryKey: ['certifications'],
    queryFn: certificationApi.list,
    staleTime: 5 * 60 * 1000,
  });

  const { data: readiness, isLoading } = useQuery({
    queryKey: ['readiness', certId],
    queryFn: () => progressApi.getReadiness(certId!, { include: ['recommendations', 'history'] }),
    enabled: certId !== null,
    staleTime: 300000,
  });

  const { data: history } = useQuery({
    queryKey: ['readinessHistory', certId],
    queryFn: () => progressApi.getReadinessHistory(certId!, 30),
    enabled: certId !== null,
    staleTime: 300000,
  });

  const selectedCertName = certifications?.find((c) => c.id === certId)?.shortName ?? 'Select';

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className="animate-pulse">Loading readiness data...</div>
        </div>
      </div>
    );
  }

  if (!readiness || !certId) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Exam Readiness</h1>
            <p className={styles.subtitle}>Your predicted exam pass likelihood</p>
          </div>
        </div>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <span className={styles.emptyText}>No readiness data available</span>
          <span className={styles.emptyHint}>Complete some exams or study sessions to generate your readiness score</span>
        </div>
      </div>
    );
  }

  const { score, recommendations = [] } = readiness;
  const overall = Math.round(score.overall);
  const color = getScoreColor(overall);
  const circumference = 2 * Math.PI * 56;
  const strokeDashoffset = circumference - (overall / 100) * circumference;

  // Sort domains by weight desc for table
  const sortedDomains = [...score.domains].sort((a, b) => b.domainWeight - a.domainWeight);

  // Transform history for chart (oldest first)
  const historyData = history ?? readiness.history ?? [];
  const chartData = historyData
    .slice()
    .sort((a, b) => new Date(a.calculatedAt).getTime() - new Date(b.calculatedAt).getTime())
    .map((snap) => ({
      date: formatDate(snap.calculatedAt),
      score: Math.round(snap.overallScore),
    }));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Exam Readiness</h1>
          <p className={styles.subtitle}>Predicted pass likelihood with weighted domain analysis</p>
        </div>
        <div className={styles.certSelector} ref={dropdownRef}>
          <button
            className={styles.certButton}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {selectedCertName} ▾
          </button>
          {isDropdownOpen && certifications && (
            <div className={styles.certDropdown}>
              {certifications.map((cert) => (
                <button
                  key={cert.id}
                  className={styles.certOption}
                  data-selected={cert.id === certId}
                  onClick={() => {
                    setCertId(cert.id);
                    setIsDropdownOpen(false);
                  }}
                >
                  {cert.shortName} — {cert.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Score Overview */}
      <div className={styles.scoreOverview}>
        <div className={styles.gaugeContainer}>
          <svg className={styles.gauge} viewBox="0 0 128 128">
            <circle
              className={styles.gaugeBg}
              cx="64" cy="64" r="56"
              fill="none" strokeWidth="10"
            />
            <circle
              className={styles.gaugeFill}
              cx="64" cy="64" r="56"
              fill="none" strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ stroke: color }}
            />
          </svg>
          <div className={styles.gaugeValue}>
            <span className={styles.scoreNumber} style={{ color }}>{overall}</span>
            <span className={styles.scorePercent}>%</span>
          </div>
        </div>
        <div className={styles.scoreDetails}>
          <div className={styles.confidence} data-level={score.confidence}>
            {score.confidence} confidence
          </div>
          <div className={styles.scoreMeta}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Domains Covered</span>
              <span className={styles.metaValue}>
                {score.domains.filter((d) => d.totalAttempts > 0).length} / {score.domains.length}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Total Attempts</span>
              <span className={styles.metaValue}>
                {score.domains.reduce((sum, d) => sum + d.totalAttempts, 0)}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Last Updated</span>
              <span className={styles.metaValue}>{formatDate(score.calculatedAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Trend Chart */}
      {chartData.length > 1 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Readiness Trend</h2>
          <div className={styles.chartCard}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
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
                  formatter={(value: number) => [`${value}%`, 'Readiness']}
                />
                <ReferenceLine
                  y={70}
                  stroke="var(--success)"
                  strokeDasharray="5 5"
                  label={{
                    value: '70% Passing',
                    position: 'insideTopRight',
                    fill: 'var(--success)',
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--accent-primary)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--accent-primary)', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Domain Breakdown Table */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Domain Breakdown</h2>
        <table className={styles.domainTable}>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Weight</th>
              <th>Score</th>
              <th>Accuracy</th>
              <th>Coverage</th>
              <th>Recency</th>
            </tr>
          </thead>
          <tbody>
            {sortedDomains.map((domain: DomainReadiness) => {
              const domainScore = Math.round(domain.score);
              return (
                <tr key={domain.domainId}>
                  <td className={styles.domainName}>{domain.domainName}</td>
                  <td className={styles.domainWeight}>{Math.round(domain.domainWeight * 100)}%</td>
                  <td className={styles.scoreCell} style={{ color: getScoreColor(domainScore) }}>
                    {domainScore}%
                  </td>
                  <td className={styles.metricCell}>{Math.round(domain.accuracy * 100)}%</td>
                  <td className={styles.metricCell}>{Math.round(domain.coverage * 100)}%</td>
                  <td className={styles.metricCell}>{Math.round(domain.recency * 100)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actionable Recommendations */}
      {recommendations.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Recommendations</h2>
          <div className={styles.recommendations}>
            {recommendations.slice(0, 5).map((rec) => {
              const recScore = Math.round(rec.currentScore);
              return (
                <div key={rec.domainId} className={styles.recCard}>
                  <div className={styles.recInfo}>
                    <span className={styles.recDomain}>{rec.domainName}</span>
                    <span className={styles.recAction}>{rec.action}</span>
                  </div>
                  <div className={styles.recRight}>
                    <span className={styles.recScore} style={{ color: getScoreColor(recScore) }}>
                      {recScore}%
                    </span>
                    <button
                      className={styles.practiceButton}
                      onClick={() => navigate(`/study?domainId=${rec.domainId}`)}
                    >
                      Practice Now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
