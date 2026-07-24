import { useState, useEffect } from 'react';
import { fetchAPI } from '../lib/api-client';

interface TrendPoint {
  date: string;
  cost_cents: number;
  events: number;
}

interface Forecast {
  horizon_days: number;
  projected_total_cents: number;
  confidence_low_cents: number;
  confidence_high_cents: number;
  burn_rate_cents_per_day: number;
}

interface TrendData {
  history: TrendPoint[];
  forecast: Forecast;
}

export function useCostTrend(days: number = 30, projectId?: string) {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const params = new URLSearchParams({ days: days.toString() });
    if (projectId) params.set('project_id', projectId);

    fetchAPI<TrendData>(`/trends?${params}`)
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [days, projectId]);

  return { data, loading, error };
}
