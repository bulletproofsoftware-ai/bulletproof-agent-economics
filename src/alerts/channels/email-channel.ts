// =============================================================================
// src/alerts/channels/email-channel.ts — Nodemailer SMTP delivery
// REQ-056: Multi-channel alert delivery
// =============================================================================

import nodemailer from 'nodemailer';
import type { Alert } from '../../types.js';
import { config } from '../../config.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.alertEmailSmtpHost,
      port: config.alertEmailSmtpPort,
      secure: config.alertEmailSmtpPort === 465,
    });
  }
  return transporter;
}

/**
 * Send an alert via email.
 */
export async function sendEmailAlert(
  recipients: string[],
  alert: Alert,
): Promise<boolean> {
  if (!config.alertEmailSmtpHost || recipients.length === 0) return false;

  const t = getTransporter();

  const severityColor: Record<string, string> = {
    info: '#2196F3',
    warning: '#FF9800',
    critical: '#F44336',
  };

  const html = `
    <div style="font-family: sans-serif; max-width: 600px;">
      <div style="background: ${severityColor[alert.severity] ?? '#666'}; color: white; padding: 12px 16px; border-radius: 4px 4px 0 0;">
        <strong>${alert.severity.toUpperCase()}: ${alert.title}</strong>
      </div>
      <div style="border: 1px solid #ddd; border-top: none; padding: 16px; border-radius: 0 0 4px 4px;">
        <p>${alert.message}</p>
        <hr style="border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">
          Source: ${alert.source}<br>
          Time: ${alert.created_at}<br>
          Alert ID: ${alert.alert_id}
        </p>
      </div>
    </div>
  `;

  try {
    await t.sendMail({
      from: config.alertEmailFrom,
      to: recipients.join(', '),
      subject: `[Agent Economics ${alert.severity.toUpperCase()}] ${alert.title}`,
      html,
    });
    return true;
  } catch (err) {
    console.error('[email-channel] Send failed:', (err as Error).message);
    return false;
  }
}
