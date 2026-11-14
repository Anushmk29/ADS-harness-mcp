import { logger } from './logger.js';

export type AlertLevel = 'info' | 'warn' | 'critical';

const DEDUP_MS = 6 * 3_600_000;
const TELEGRAM_MAX = 4000; // API limit is 4096 chars per message
const ICON: Record<AlertLevel, string> = { info: 'ℹ️', warn: '⚠️', critical: '🔴' };
// ponytail: in-memory dedup, so a restart inside the 6h window can resend once; persist if that gets noisy.
const lastSent = new Map<string, number>();

/**
 * Operator alert: always logged, and sent to Telegram when ALERT_TELEGRAM_BOT_TOKEN + ALERT_TELEGRAM_CHAT_ID are set.
 * The same key alerts at most once per 6h. Never throws: alerting must not break the job that raised it.
 */
export async function alert(level: AlertLevel, key: string, message: string, options: { fetch?: typeof fetch; now?: number } = {}): Promise<boolean> {
  const now = options.now ?? Date.now();
  logger[level === 'info' ? 'info' : level === 'warn' ? 'warn' : 'error']('Alert', `${key}: ${message}`);
  if ((lastSent.get(key) ?? -Infinity) > now - DEDUP_MS) return false;
  lastSent.set(key, now);
  const token = process.env.ALERT_TELEGRAM_BOT_TOKEN, chatId = process.env.ALERT_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const client = process.env.APP_NAME || process.env.CLIENT_DOMAIN || 'harness';
  // Plain text (no parse_mode): provider errors and client text can't break Markdown/HTML escaping.
  const text = `${ICON[level]} ${client} · ${key}\n${message}`.slice(0, TELEGRAM_MAX);
  try {
    const res = await (options.fetch ?? fetch)(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
    });
    if (!res.ok) logger.warn('Alert', `telegram returned ${res.status}`);
    return res.ok;
  } catch (e: any) {
    logger.warn('Alert', `telegram failed: ${e.message.split(token).join('[redacted]')}`);
    return false;
  }
}

/** Test hook. */
export function resetAlertDedup() { lastSent.clear(); }
