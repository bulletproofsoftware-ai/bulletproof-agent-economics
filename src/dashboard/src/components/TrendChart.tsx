import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { formatCents } from '../lib/format';

interface TrendPoint {
  date: string;
  cost_cents: number;
  events: number;
}

interface Forecast {
  burn_rate_cents_per_day: number;
  projected_total_cents: number;
  confidence_low_cents: number;
  confidence_high_cents: number;
}

interface Props {
  history: TrendPoint[];
  forecast: Forecast;
}

export function TrendChart({ history, forecast }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || history.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 600;
    const height = 200;
    const margin = { top: 20, right: 20, bottom: 30, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const data = history.map((d) => ({
      date: new Date(d.date),
      cost: d.cost_cents,
    }));

    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, innerWidth]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.cost) ?? 100])
      .nice()
      .range([innerHeight, 0]);

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(6))
      .selectAll('text')
      .style('fill', '#71717a')
      .style('font-size', '10px');

    g.append('g')
      .call(
        d3.axisLeft(y).ticks(5).tickFormat((d) => formatCents(d as number)),
      )
      .selectAll('text')
      .style('fill', '#71717a')
      .style('font-size', '10px');

    // Grid lines
    g.selectAll('.grid-line')
      .data(y.ticks(5))
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', '#27272a')
      .attr('stroke-dasharray', '2,2');

    // Area
    const area = d3
      .area<{ date: Date; cost: number }>()
      .x((d) => x(d.date))
      .y0(innerHeight)
      .y1((d) => y(d.cost))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('fill', 'rgba(59, 130, 246, 0.15)')
      .attr('d', area);

    // Line
    const line = d3
      .line<{ date: Date; cost: number }>()
      .x((d) => x(d.date))
      .y((d) => y(d.cost))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Dots
    g.selectAll('.dot')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (d) => x(d.date))
      .attr('cy', (d) => y(d.cost))
      .attr('r', 3)
      .attr('fill', '#3b82f6');
  }, [history, forecast]);

  return (
    <div style={{ background: '#1a1b23', borderRadius: 8, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Cost Trend</h3>
        <div style={{ fontSize: 13, color: '#71717a' }}>
          Burn rate: {formatCents(forecast.burn_rate_cents_per_day)}/day
        </div>
      </div>
      <svg ref={svgRef} style={{ width: '100%', height: 200 }} />
    </div>
  );
}
