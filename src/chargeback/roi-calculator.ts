// =============================================================================
// src/chargeback/roi-calculator.ts — Per-feature ROI computation
// REQ-051: ROI = estimated_manual_cost / ai_cost
// =============================================================================

import { config } from '../config.js';
import { query } from '../database.js';
import type { ROICalculation } from '../types.js';

/**
 * Compute ROI for a feature. All arithmetic in integer cents.
 *
 * ROI ratio = estimated_manual_cents / ai_cost_cents
 * estimated_manual_cents = story_points * hours_per_point * hourly_rate_cents
 */
export async function computeROI(
  featureId: string,
  projectId: string,
  storyPoints: number,
): Promise<ROICalculation> {
  // Get actual AI cost from cost_events
  const costResult = await query<{
    total_cost_cents: string;
    session_count: string;
  }>(
    `SELECT
      COALESCE(SUM(cost_cents), 0) as total_cost_cents,
      COUNT(DISTINCT session_id) as session_count
     FROM cost_events
     WHERE feature_id = $1 AND project_id = $2`,
    [featureId, projectId],
  );

  const aiCostCents = parseInt(costResult.rows[0].total_cost_cents, 10);
  const aiSessionsCount = parseInt(costResult.rows[0].session_count, 10);

  // Calculate estimated manual cost using integer arithmetic
  const hoursPerPoint = config.roiHoursPerStoryPoint;
  const estimatedManualHours = storyPoints * hoursPerPoint;

  // BigInt for precise integer multiplication
  const estimatedManualCents = Number(
    BigInt(Math.round(estimatedManualHours * 100)) *
      BigInt(config.roiDeveloperRateCentsPerHour) /
      BigInt(100),
  );

  // ROI ratio (avoid division by zero)
  const roiRatio = aiCostCents > 0
    ? estimatedManualCents / aiCostCents
    : 0;

  const roi: ROICalculation = {
    feature_id: featureId,
    project_id: projectId,
    ai_cost_cents: aiCostCents,
    ai_sessions_count: aiSessionsCount,
    estimated_story_points: storyPoints,
    estimated_manual_hours: estimatedManualHours,
    estimated_manual_cents: estimatedManualCents,
    roi_ratio: Math.round(roiRatio * 10000) / 10000, // 4 decimal places
  };

  // Upsert to database
  await query(
    `INSERT INTO roi_calculations (
      feature_id, project_id, ai_cost_cents, ai_sessions_count,
      estimated_story_points, hours_per_story_point, hourly_rate_cents,
      estimated_manual_hours, estimated_manual_cents, roi_ratio, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    ON CONFLICT (feature_id, project_id)
    DO UPDATE SET
      ai_cost_cents = $3, ai_sessions_count = $4,
      estimated_story_points = $5, estimated_manual_hours = $8,
      estimated_manual_cents = $9, roi_ratio = $10, updated_at = NOW()`,
    [
      featureId,
      projectId,
      aiCostCents,
      aiSessionsCount,
      storyPoints,
      hoursPerPoint,
      config.roiDeveloperRateCentsPerHour,
      estimatedManualHours,
      estimatedManualCents,
      roi.roi_ratio,
    ],
  );

  return roi;
}

/**
 * Get all ROI calculations for a project.
 */
export async function getProjectROI(
  projectId: string,
): Promise<ROICalculation[]> {
  const result = await query<{
    feature_id: string;
    project_id: string;
    ai_cost_cents: string;
    ai_sessions_count: string;
    estimated_story_points: string;
    estimated_manual_hours: string;
    estimated_manual_cents: string;
    roi_ratio: string;
  }>(
    `SELECT * FROM roi_calculations WHERE project_id = $1 ORDER BY roi_ratio DESC`,
    [projectId],
  );

  return result.rows.map((r) => ({
    feature_id: r.feature_id,
    project_id: r.project_id,
    ai_cost_cents: parseInt(r.ai_cost_cents, 10),
    ai_sessions_count: parseInt(r.ai_sessions_count, 10),
    estimated_story_points: parseFloat(r.estimated_story_points),
    estimated_manual_hours: parseFloat(r.estimated_manual_hours),
    estimated_manual_cents: parseInt(r.estimated_manual_cents, 10),
    roi_ratio: parseFloat(r.roi_ratio),
  }));
}
