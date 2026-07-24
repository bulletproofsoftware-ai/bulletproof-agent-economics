// =============================================================================
// src/alerts/alert-dispatcher.ts — Multi-channel alert dispatch with retry
// REQ-056: 3x retry with exponential backoff
// =============================================================================

import { randomUUID } from 'node:crypto';
import type { Alert, AlertSeverity, AlertChannel } from '../types.js';
import { config } from '../config.js';
import { sendSlackAlert } from './channels/slack-channel.js';
import { sendEmailAlert } from './channels/email-channel.js';
import { sendWebhookAlert } from './channels/webhook-channel.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s exponential backoff

export class AlertDispatcher {
  /**
   * Dispatch an alert to all configured channels.
   * Retries up to 3 times with exponential backoff on failure.
   */
  async dispatch(
    severity: AlertSeverity,
    title: string,
    message: string,
    source: string,
    channels?: AlertChannel[],
  ): Promise<Alert> {
    const alert: Alert = {
      alert_id: randomUUID(),
      severity,
      title,
      message,
      source,
      channels: channels ?? this.getDefaultChannels(severity),
      created_at: new Date().toISOString(),
      delivery_attempts: 0,
      delivered: false,
    };

    const results = await Promise.allSettled(
      alert.channels.map((channel) =>
        this.deliverWithRetry(channel, alert),
      ),
    );

    alert.delivered = results.some(
      (r) => r.status === 'fulfilled' && r.value === true,
    );

    return alert;
  }

  /**
   * Deliver to a single channel with retry logic.
   */
  private async deliverWithRetry(
    channel: AlertChannel,
    alert: Alert,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      alert.delivery_attempts++;

      try {
        const success = await this.deliverToChannel(channel, alert);
        if (success) return true;
      } catch (err) {
        console.error(
          `[alert-dispatcher] ${channel} attempt ${attempt + 1} failed:`,
          (err as Error).message,
        );
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    console.error(
      `[alert-dispatcher] ${channel} delivery failed after ${MAX_RETRIES} attempts for alert ${alert.alert_id}`,
    );
    return false;
  }

  /**
   * Deliver to a specific channel.
   */
  private async deliverToChannel(
    channel: AlertChannel,
    alert: Alert,
  ): Promise<boolean> {
    switch (channel) {
      case 'slack':
        return sendSlackAlert(config.alertSlackWebhookUrl, alert);
      case 'email':
        return sendEmailAlert(config.alertEmailRecipients, alert);
      case 'webhook':
        return sendWebhookAlert(
          config.alertWebhookUrl,
          config.alertWebhookSecret,
          alert,
        );
      default:
        return false;
    }
  }

  /**
   * Get default channels based on severity.
   * Critical: all channels. Warning: slack + email. Info: slack only.
   */
  private getDefaultChannels(severity: AlertSeverity): AlertChannel[] {
    switch (severity) {
      case 'critical':
        return ['slack', 'email', 'webhook'];
      case 'warning':
        return ['slack', 'email'];
      case 'info':
        return ['slack'];
    }
  }
}
