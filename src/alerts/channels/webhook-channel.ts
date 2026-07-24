// =============================================================================
// src/alerts/channels/webhook-channel.ts — HMAC-SHA256 signed webhook
// REQ-056: Multi-channel alert delivery with HMAC signing
// =============================================================================

import { createHmac } from 'node:crypto';
import type { Alert } from '../../types.js';

/**
 * Send an alert via webhook with HMAC-SHA256 signature.
 * The signature is placed in the X-Economics-Signature header.
 */
export async function sendWebhookAlert(
  webhookUrl: string,
  webhookSecret: string,
  alert: Alert,
): Promise<boolean> {
  if (!webhookUrl) return false;

  const payload = JSON.stringify({
    alert_id: alert.alert_id,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    source: alert.source,
    created_at: alert.created_at,
  });

  // HMAC-SHA256 signature
  const signature = createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Economics-Signature': `sha256=${signature}`,
      'X-Economics-Event': alert.severity,
    },
    body: payload,
  });

  return response.ok;
}
