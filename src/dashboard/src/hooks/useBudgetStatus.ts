import { useState, useEffect } from 'react';
import { fetchAPI } from '../lib/api-client';

interface ProjectBudget {
  project_id: string;
  spent_cents: number;
  cap_cents: number | null;
  pct_used: number;
}

export interface RoutingSignals {
  file_count: number;
  code_diff_lines: number;
  tool_call_count: number;
  estimated_tokens: number;
  task_description: string;
  requires_reasoning: boolean;
  task_classification: string;
}

export interface RecentEvent {
  event_id: string;
  correlation_id: string | null;
  agent_id: string;
  model: string;
  routed_tier: string;
  cost_cents: number;
  input_tokens: number;
  output_tokens: number;
  routing_signals: RoutingSignals | null;
  manual_override: boolean;
  created_at: string;
}

interface LiveData {
  cost_rate_cents_per_hour: number;
  active_agents: string[];
  projects: ProjectBudget[];
  recent_events?: RecentEvent[];
  timestamp: string;
}

export function useBudgetStatus(pollIntervalMs: number = 5000) {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        const result = await fetchAPI<LiveData>('/live');
        if (active) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (active) setError((err as Error).message);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, pollIntervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pollIntervalMs]);

  return { data, error };
}
