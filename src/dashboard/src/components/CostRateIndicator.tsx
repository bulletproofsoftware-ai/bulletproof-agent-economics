import React from 'react';
import { formatRate } from '../lib/format';

interface Props {
  centsPerHour: number;
  activeAgents: string[];
}

export function CostRateIndicator({ centsPerHour, activeAgents }: Props) {
  return (
    <div style={{ background: '#1a1b23', borderRadius: 8, padding: 20 }}>
      <h3 style={{ marginBottom: 8, fontSize: 14, color: '#71717a' }}>
        Live Cost Rate
      </h3>
      <div style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {formatRate(centsPerHour)}
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: '#71717a' }}>
        {activeAgents.length} active agent{activeAgents.length !== 1 ? 's' : ''}
      </div>
      {activeAgents.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            maxHeight: 120,
            overflowY: 'auto',
          }}
        >
          {activeAgents.map((id) => (
            <span
              key={id}
              style={{
                background: '#27272a',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11,
              }}
            >
              {id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
