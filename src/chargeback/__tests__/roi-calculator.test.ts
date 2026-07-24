// =============================================================================
// ROI calculator tests — integer arithmetic correctness
// REQ-051: ROI = manual_cost / ai_cost
// =============================================================================

import { describe, it, expect } from 'vitest';

// Test the ROI calculation logic directly (without DB)
describe('ROI calculation logic', () => {
  const ROI_HOURS_PER_STORY_POINT = 4;
  const ROI_DEVELOPER_RATE_CENTS_PER_HOUR = 15000; // $150/hr

  function computeROIRatio(
    aiCostCents: number,
    storyPoints: number,
  ): {
    estimatedManualHours: number;
    estimatedManualCents: number;
    roiRatio: number;
  } {
    const estimatedManualHours = storyPoints * ROI_HOURS_PER_STORY_POINT;
    const estimatedManualCents = Number(
      BigInt(Math.round(estimatedManualHours * 100)) *
        BigInt(ROI_DEVELOPER_RATE_CENTS_PER_HOUR) /
        BigInt(100),
    );
    const roiRatio = aiCostCents > 0
      ? estimatedManualCents / aiCostCents
      : 0;

    return {
      estimatedManualHours,
      estimatedManualCents,
      roiRatio: Math.round(roiRatio * 10000) / 10000,
    };
  }

  it('computes ROI for a typical feature', () => {
    // 5 story points * 4 hrs/pt = 20 hours * $150/hr = $3,000
    // AI cost: $15 (1500 cents)
    // ROI: 3000 * 100 / 1500 = 200
    const result = computeROIRatio(1500, 5);
    expect(result.estimatedManualHours).toBe(20);
    expect(result.estimatedManualCents).toBe(300000); // $3,000
    expect(result.roiRatio).toBe(200);
  });

  it('handles zero AI cost (returns 0 ratio)', () => {
    const result = computeROIRatio(0, 5);
    expect(result.roiRatio).toBe(0);
  });

  it('handles zero story points', () => {
    const result = computeROIRatio(1500, 0);
    expect(result.estimatedManualHours).toBe(0);
    expect(result.estimatedManualCents).toBe(0);
    expect(result.roiRatio).toBe(0);
  });

  it('handles fractional story points', () => {
    // 0.5 story points * 4 hrs/pt = 2 hours * $150/hr = $300
    const result = computeROIRatio(500, 0.5);
    expect(result.estimatedManualHours).toBe(2);
    expect(result.estimatedManualCents).toBe(30000); // $300
    expect(result.roiRatio).toBe(60);
  });

  it('uses integer arithmetic (no floating point in cents)', () => {
    const result = computeROIRatio(333, 3);
    // 3 * 4 = 12 hours * $150 = $1,800 = 180,000 cents
    expect(Number.isInteger(result.estimatedManualCents)).toBe(true);
  });
});
