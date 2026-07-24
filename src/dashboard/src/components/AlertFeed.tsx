import React from 'react';

interface AlertItem {
  type: string;
  data: {
    severity?: string;
    title?: string;
    message?: string;
    agent_id?: string;
    threshold_pct?: number;
    action?: string;
  };
}

interface Props {
  alerts: AlertItem[];
}

const severityColors: Record<string, string> = {
  critical: '#ef4444',
  warning: '#eab308',
  info: '#3b82f6',
};

export function AlertFeed({ alerts }: Props) {
  return (
    <div style={{ background: '#1a1b23', borderRadius: 8, padding: 20 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}>
        Recent Alerts
      </h3>
      {alerts.length === 0 && (
        <p style={{ color: '#71717a', fontSize: 13 }}>No recent alerts</p>
      )}
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {alerts.map((alert, i) => (
          <div
            key={i}
            style={{
              borderLeft: `3px solid ${severityColors[alert.data.severity ?? 'info'] ?? '#71717a'}`,
              padding: '8px 12px',
              marginBottom: 8,
              background: '#27272a',
              borderRadius: '0 4px 4px 0',
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {alert.type.replace('_', ' ').toUpperCase()}
            </div>
            {alert.data.message && (
              <div style={{ color: '#a1a1aa', marginTop: 4 }}>
                {alert.data.message}
              </div>
            )}
            {alert.data.agent_id && (
              <div style={{ color: '#71717a', marginTop: 4, fontSize: 11 }}>
                Agent: {alert.data.agent_id}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
