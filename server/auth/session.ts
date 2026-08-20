import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AppConfig } from '../config';
import { unauthorized } from '../errors';
import type { AuthUser, Queryable } from '../types';

function sessionHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(';').flatMap(part => {
    const index = part.indexOf('=');
    if (index < 0) return [];
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    return key ? [[key, decodeURIComponent(value)] as const] : [];
  }));
}

function cookieHeader(config: AppConfig, token: string, maxAge: number): string {
  const secure = config.secureCookies ? '; Secure' : '';
  return `${config.sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createSession(
  db: Queryable,
  userId: string,
  config: AppConfig,
  metadata: { userAgent?: string; ip?: string }
): Promise<string> {
  const token = createOpaqueSessionToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000);
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, sessionHash(token), expiresAt, metadata.userAgent ?? null, metadata.ip ?? null]
  );
  return token;
}

function createOpaqueSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function setSessionCookie(res: Response, config: AppConfig, token: string): void {
  res.setHeader('Set-Cookie', cookieHeader(config, token, config.sessionTtlSeconds));
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.setHeader('Set-Cookie', cookieHeader(config, '', 0));
}

export function sessionTokenFromRequest(req: Request, config: AppConfig): string | null {
  return parseCookies(req.headers.cookie)[config.sessionCookieName] ?? null;
}

export async function loadAuthUser(
  db: Queryable,
  req: Request,
  config: AppConfig
): Promise<{ user: AuthUser; sessionId: string } | null> {
  const token = sessionTokenFromRequest(req, config);
  if (!token) return null;

  const result = await db.query(
    `SELECT s.id AS session_id, u.id, u.email, u.status, p.public_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN profiles p ON p.user_id = u.id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status = 'active'`,
    [sessionHash(token)]
  );
  const row = result.rows[0];
  if (!row) return null;

  void db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]).catch(() => undefined);
  return {
    sessionId: row.session_id,
    user: {
      id: row.id,
      email: row.email,
      publicName: row.public_name,
      status: row.status,
    },
  };
}

export async function requireSession(
  db: Queryable,
  req: Request,
  config: AppConfig
): Promise<{ user: AuthUser; sessionId: string }> {
  const auth = await loadAuthUser(db, req, config);
  if (!auth) throw unauthorized();
  return auth;
}
