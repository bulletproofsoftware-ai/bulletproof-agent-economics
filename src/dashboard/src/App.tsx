import React, { useState, useEffect } from 'react';
import { SpendVsBudget } from './components/SpendVsBudget';
import { CostRateIndicator } from './components/CostRateIndicator';
import { TrendChart } from './components/TrendChart';
import { AlertFeed } from './components/AlertFeed';
import { RoutingFeed } from './components/RoutingFeed';
import { useBudgetStatus } from './hooks/useBudgetStatus';
import { useCostTrend } from './hooks/useCostTrend';
import { useWebSocket } from './hooks/useWebSocket';

export function App() {
  const { data: liveData, error: liveError } = useBudgetStatus(5000);
  const { data: trendData } = useCostTrend(30);
  const { connected, lastMessage } = useWebSocket();
  const [alerts, setAlerts] = useState<Array<{ type: string; data: Record<string, unknown> }>>([]);

  // Collect WebSocket alerts
  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage as { type: string; data: Record<string, unknown> };
    if (
      msg.type === 'budget_update' ||
      msg.type === 'anomaly_alert' ||
      msg.type === 'cost_event'
    ) {
      setAlerts((prev) => [msg, ...prev].slice(0, 50));
    }
  }, [lastMessage]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Agent Economics</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connected ? '#22c55e' : '#ef4444',
            }}
          />
          <span style={{ fontSize: 13, color: '#71717a' }}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {liveError && (
        <div
          style={{
            background: '#451a03',
            border: '1px solid #92400e',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          API Error: {liveError}
        </div>
      )}

      {/* Top row: Rate + Budget */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '300px 1fr',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <CostRateIndicator
          centsPerHour={liveData?.cost_rate_cents_per_hour ?? 0}
          activeAgents={liveData?.active_agents ?? []}
        />
        <SpendVsBudget projects={liveData?.projects ?? []} />
      </div>

      {/* Trend Chart */}
      {trendData && (
        <div style={{ marginBottom: 16 }}>
          <TrendChart
            history={trendData.history}
            forecast={trendData.forecast}
          />
        </div>
      )}

      {/* Routing + Alerts: combined into one page rather than a separate
          dashboard instance — same live data flow, same layout pattern. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        <RoutingFeed events={liveData?.recent_events ?? []} />
        <AlertFeed alerts={alerts} />
      </div>
    </div>
  );
}
