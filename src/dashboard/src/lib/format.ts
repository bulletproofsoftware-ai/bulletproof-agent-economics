// =============================================================================
// Currency + number formatting utilities
// =============================================================================

/**
 * Format integer cents as dollar string. No floating point.
 */
export function formatCents(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `$${dollars.toLocaleString()}.${remainder.toString().padStart(2, '0')}`;
}

/**
 * Format a large number with K/M suffixes.
 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * Format a percentage.
 */
export function formatPct(pct: number): string {
  return `${Math.round(pct)}%`;
}

/**
 * Format cents per hour as a rate.
 */
export function formatRate(centsPerHour: number): string {
  return `${formatCents(centsPerHour)}/hr`;
}
