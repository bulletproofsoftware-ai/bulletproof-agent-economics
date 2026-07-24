import React from 'react';
import type { RecentEvent } from '../hooks/useBudgetStatus';

interface Props {
  events: RecentEvent[];
}

const tierColors: Record<string, string> = {
  haiku: '#4ade80',
  sonnet: '#60a5fa',
  opus: '#f97316',
  fable: '#c084fc',
  'ollama-local': '#71717a',
  codex: '#71717a',
  agy: '#71717a',
  'gemini-flash': '#60a5fa',
  'gemini-pro': '#f97316',
  'nano-banana-pro': '#eab308',
  veo: '#eab308',
  elevenlabs: '#eab308',
  'edge-tts': '#71717a',
};

function formatCost(cents: number): string {
  if (cents === 0) return 'free';
  if (cents < 100) return `${cents}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function RoutingFeed({ events }: Props) {
  return (
    <div style={{ background: '#1a1b23', borderRadius: 8, padding: 20 }}>
      <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}>
        Recent Routing Decisions
      </h3>
      {events.length === 0 && (
        <p style={{ color: '#71717a', fontSize: 13 }}>No recent routing activity</p>
      )}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {events.map((event) => (
          <div
            key={event.event_id}
            style={{
              borderLeft: `3px solid ${tierColors[event.routed_tier] ?? '#71717a'}`,
              padding: '8px 12px',
              marginBottom: 8,
              background: '#27272a',
              borderRadius: '0 4px 4px 0',
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: tierColors[event.routed_tier] ?? '#e5e7eb' }}>
                {event.routed_tier}
                {event.manual_override && (
                  <span style={{ color: '#71717a', fontWeight: 400 }}> (override)</span>
                )}
              </span>
              <span style={{ color: '#a1a1aa', fontSize: 12 }}>{formatCost(event.cost_cents)}</span>
            </div>
            {event.routing_signals?.task_description && (
              <div style={{ color: '#e5e7eb', marginTop: 4 }}>
                {truncate(event.routing_signals.task_description, 100)}
              </div>
            )}
            <div style={{ color: '#71717a', marginTop: 4, fontSize: 11 }}>
              {event.agent_id} · {event.input_tokens ?? 0}/{event.output_tokens ?? 0} tok · {new Date(event.created_at).toLocaleTimeString()}
            </div>
            {event.correlation_id && (
              <div style={{ marginTop: 4, fontSize: 11 }}>
                <code
                  title="Click to copy — cross-reference against Event Router and Metrics Engine"
                  style={{ color: '#71717a', cursor: 'pointer' }}
                  onClick={() => navigator.clipboard.writeText(event.correlation_id!)}
                >
                  {event.correlation_id}
                </code>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
