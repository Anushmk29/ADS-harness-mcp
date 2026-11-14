import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from '../../config/paths.js';

/**
 * Minimal, dependency-free OAuth token store.
 *
 * Tokens are AES-256-GCM encrypted at <workspace>/.marketing-data/oauth/<provider>.json.
 * MARKETING_TOKEN_KEY is supplied through the environment. Only opaque tokens and their
 * expiry are stored — no ad data, no shared secrets beyond the OAuth client
 * secret which the operator supplies via environment variables.
 */

interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  /** Unix epoch seconds; 0 = unknown/never expires. */
  expiry?: number;
  updatedAt: number;
}

interface EncryptedToken {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

function encryptionKey(): Buffer {
  const secret = process.env.MARKETING_TOKEN_KEY;
  if (!secret || secret.length < 32) throw new Error('MARKETING_TOKEN_KEY must contain at least 32 characters');
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(value: StoredToken): EncryptedToken {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

function decrypt(value: EncryptedToken): StoredToken {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}

function assertProvider(provider: string): void {
  if (!/^[a-z0-9_-]{1,40}$/i.test(provider)) throw new Error('Invalid OAuth provider name');
}

export interface TokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  /** Caller-provided values to persist verbatim (e.g. extra fields a provider needs). */
  extra?: Record<string, unknown>;
}

export function tokenFilePath(provider: string): string {
  assertProvider(provider);
  const dir = dataDir('oauth');
  return path.join(dir, `${provider}.json`);
}

function ensureTokenDir(): string {
  const dir = dataDir('oauth');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export class TokenStore {
  private static instance: TokenStore;

  public static getInstance(): TokenStore {
    if (!TokenStore.instance) TokenStore.instance = new TokenStore();
    return TokenStore.instance;
  }

  public save(provider: string, token: TokenPair): void {
    ensureTokenDir();
    const entry: StoredToken = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiry: token.expiresIn ? Math.floor(Date.now() / 1000) + token.expiresIn : 0,
      updatedAt: Date.now(),
      ...(token.extra || {})
    };
    fs.writeFileSync(tokenFilePath(provider), JSON.stringify(encrypt(entry)), { encoding: 'utf8', mode: 0o600 });
  }

  public load(provider: string): StoredToken | null {
    const p = tokenFilePath(provider);
    if (!fs.existsSync(p)) return null;
    try {
      const stored = JSON.parse(fs.readFileSync(p, 'utf8')) as EncryptedToken;
      if (stored.version !== 1) return null;
      return decrypt(stored);
    } catch {
      return null;
    }
  }

  public getAccessToken(provider: string): string | null {
    return this.load(provider)?.accessToken || null;
  }

  public clear(provider: string): void {
    const p = tokenFilePath(provider);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
