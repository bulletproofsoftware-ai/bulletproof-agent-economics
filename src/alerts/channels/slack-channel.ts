// =============================================================================
// src/alerts/channels/slack-channel.ts — Slack webhook delivery
// REQ-056: Multi-channel alert delivery
// =============================================================================

import type { Alert } from '../../types.js';

export interface SlackMessage {
  text: string;
  blocks?: Array<{
    type: string;
    text?: { type: string; text: string };
    fields?: Array<{ type: string; text: string }>;
  }>;
}

/**
 * Send an alert to Slack via webhook.
 */
export async function sendSlackAlert(
  webhookUrl: string,
  alert: Alert,
): Promise<boolean> {
  if (!webhookUrl) return false;

  const severityEmoji: Record<string, string> = {
    info: ':information_source:',
    warning: ':warning:',
    critical: ':rotating_light:',
  };

  const message: SlackMessage = {
    text: `${severityEmoji[alert.severity] ?? ''} ${alert.title}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${alert.severity.toUpperCase()}: ${alert.title}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: alert.message },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Source:* ${alert.source}` },
          { type: 'mrkdwn', text: `*Time:* ${alert.created_at}` },
          { type: 'mrkdwn', text: `*Alert ID:* ${alert.alert_id}` },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  return response.ok;
}
