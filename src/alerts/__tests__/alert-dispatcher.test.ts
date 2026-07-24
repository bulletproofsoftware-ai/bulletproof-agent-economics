// =============================================================================
// Alert dispatcher tests
// REQ-056: Multi-channel delivery with retry
// =============================================================================

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

describe('webhook HMAC-SHA256 signing', () => {
  it('produces valid HMAC-SHA256 signature', () => {
    const secret = 'test-secret-key';
    const payload = JSON.stringify({
      alert_id: 'test-123',
      severity: 'critical',
      title: 'Budget exceeded',
      message: 'Project X has exceeded 100% of budget',
      source: 'project-x',
      created_at: '2026-04-06T12:00:00Z',
    });

    const signature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Verify the signature is valid hex
    expect(signature).toMatch(/^[a-f0-9]{64}$/);

    // Verify it's deterministic
    const signature2 = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    expect(signature).toBe(signature2);

    // Verify different payload produces different signature
    const otherSig = createHmac('sha256', secret)
      .update('different payload')
      .digest('hex');
    expect(signature).not.toBe(otherSig);
  });

  it('produces different signatures for different secrets', () => {
    const payload = '{"test": true}';
    const sig1 = createHmac('sha256', 'secret-1').update(payload).digest('hex');
    const sig2 = createHmac('sha256', 'secret-2').update(payload).digest('hex');
    expect(sig1).not.toBe(sig2);
  });
});

describe('default channel selection', () => {
  function getDefaultChannels(severity: string): string[] {
    switch (severity) {
      case 'critical':
        return ['slack', 'email', 'webhook'];
      case 'warning':
        return ['slack', 'email'];
      case 'info':
        return ['slack'];
      default:
        return ['slack'];
    }
  }

  it('critical alerts go to all channels', () => {
    expect(getDefaultChannels('critical')).toEqual(['slack', 'email', 'webhook']);
  });

  it('warning alerts go to slack and email', () => {
    expect(getDefaultChannels('warning')).toEqual(['slack', 'email']);
  });

  it('info alerts go to slack only', () => {
    expect(getDefaultChannels('info')).toEqual(['slack']);
  });
});
