import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { dataDir } from '../../config/paths.js';

export interface AdminUser { id: string; username: string; }
export interface AdminSession { token: string; user: AdminUser; expiresAt: number; }

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
// ponytail: synchronous scrypt is acceptable for one isolated client; move to a worker if concurrent logins matter.
const passwordHash = (password: string, salt: string) => scryptSync(password, salt, 64).toString('hex');

export class CoreStore {
  private db: DatabaseSync;

  constructor(directory = dataDir('core')) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'core.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);
    const columns = new Set((this.db.prepare('PRAGMA table_info(users)').all() as any[]).map(c => c.name));
    if (!columns.has('must_change')) this.db.exec('ALTER TABLE users ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0');
  }

  /** Operator-created login (bin/cli.js create-user): random one-time password the client must change at first login. */
  createUserWithTemporaryPassword(username: string): { username: string; password: string } {
    const password = randomBytes(12).toString('base64url');
    this.createAdmin(username, password);
    this.db.prepare('UPDATE users SET must_change = 1 WHERE username = ?').run(username);
    return { username, password };
  }

  /** New one-time password, every session revoked. */
  resetPassword(username: string): { username: string; password: string } {
    const row = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as any;
    if (!row) throw new Error(`No user ${username}`);
    const password = randomBytes(12).toString('base64url'), salt = randomBytes(16).toString('hex');
    this.db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change = 1 WHERE id = ?').run(passwordHash(password, salt), salt, row.id);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
    return { username, password };
  }

  changePassword(userId: string, current: string, next: string): void {
    const row = this.db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
    if (!row || !this.login(row.username, current)) throw new Error('Current password is wrong');
    this.validateCredentials(row.username, next);
    if (next === current) throw new Error('Choose a new password');
    const salt = randomBytes(16).toString('hex');
    this.db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change = 0 WHERE id = ?').run(passwordHash(next, salt), salt, userId);
  }

  mustChangePassword(userId: string): boolean {
    return Boolean((this.db.prepare('SELECT must_change FROM users WHERE id = ?').get(userId) as any)?.must_change);
  }

  hasAdmin(): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM users LIMIT 1').get());
  }

  createAdmin(username: string, password: string): AdminSession {
    this.validateCredentials(username, password);
    if (this.hasAdmin()) throw new Error('Client administrator is already configured');
    const user = { id: `usr_${randomBytes(12).toString('hex')}`, username };
    const salt = randomBytes(16).toString('hex');
    this.db.prepare('INSERT INTO users(id, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, user.username, passwordHash(password, salt), salt, Date.now());
    return this.createSession(user);
  }

  login(username: string, password: string): AdminSession | null {
    const validInput = /^[a-zA-Z0-9_.@-]{3,80}$/.test(username) && password.length <= 200;
    const row = validInput ? this.db.prepare('SELECT id, username, password_hash, password_salt FROM users WHERE username = ?').get(username) as any : undefined;
    const actual = Buffer.from(passwordHash(validInput ? password : 'invalid', row?.password_salt ?? '00000000000000000000000000000000'), 'hex');
    const expected = Buffer.from(row?.password_hash ?? '00'.repeat(64), 'hex');
    if (!row || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    return this.createSession({ id: row.id, username: row.username });
  }

  authenticate(token: string | undefined): AdminUser | null {
    if (!token) return null;
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const row = this.db.prepare(`
      SELECT users.id, users.username FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash(token), Date.now()) as AdminUser | undefined;
    return row ?? null;
  }

  logout(token: string | undefined): void {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  }

  private createSession(user: AdminUser): AdminSession {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_MS;
    this.db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash(token), user.id, expiresAt, Date.now());
    return { token, user, expiresAt };
  }

  private validateCredentials(username: string, password: string): void {
    if (!/^[a-zA-Z0-9_.@-]{3,80}$/.test(username)) throw new Error('Username must be 3-80 letters, numbers, or . _ @ -');
    if (password.length < 12 || password.length > 200) throw new Error('Password must be 12-200 characters');
  }

  close(): void { this.db.close(); }
}
