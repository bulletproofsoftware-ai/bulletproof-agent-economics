import React from 'react';
import { formatCents, formatPct } from '../lib/format';

interface ProjectBudget {
  project_id: string;
  spent_cents: number;
  cap_cents: number | null;
  pct_used: number;
}

interface Props {
  projects: ProjectBudget[];
}

function getBarColor(pct: number): string {
  if (pct >= 100) return '#ef4444';
  if (pct >= 90) return '#f97316';
  if (pct >= 80) return '#eab308';
  if (pct >= 60) return '#3b82f6';
  return '#22c55e';
}

export function SpendVsBudget({ projects }: Props) {
  return (
    <div style={{ background: '#1a1b23', borderRadius: 8, padding: 20 }}>
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
        Spend vs Budget
      </h3>
      {projects.length === 0 && (
        <p style={{ color: '#71717a' }}>No project data available</p>
      )}
      {projects.map((p) => (
        <div key={p.project_id} style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 4,
              fontSize: 13,
            }}
          >
            <span>{p.project_id}</span>
            <span>
              {formatCents(p.spent_cents)}
              {p.cap_cents ? ` / ${formatCents(p.cap_cents)}` : ''}
              {p.cap_cents ? ` (${formatPct(p.pct_used)})` : ''}
            </span>
          </div>
          {p.cap_cents && (
            <div
              style={{
                height: 8,
                background: '#27272a',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, p.pct_used)}%`,
                  background: getBarColor(p.pct_used),
                  borderRadius: 4,
                  transition: 'width 0.3s',
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
