import type { Queryable } from '../types';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  status: string;
  publicName: string;
}

export interface ProfileRecord {
  userId: string;
  publicName: string;
  createdAt: string;
}

function mapUser(row: any): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    status: row.status,
    publicName: row.public_name,
  };
}

export async function findUserByEmail(db: Queryable, email: string): Promise<UserRecord | null> {
  const result = await db.query(
    `SELECT u.id, u.email, u.password_hash, u.status, p.public_name
       FROM users u
       JOIN profiles p ON p.user_id = u.id
      WHERE lower(u.email) = lower($1)
      LIMIT 1`,
    [email],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function findUserById(db: Queryable, userId: string): Promise<UserRecord | null> {
  const result = await db.query(
    `SELECT u.id, u.email, u.password_hash, u.status, p.public_name
       FROM users u
       JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function createUser(
  db: Queryable,
  input: { email: string; passwordHash: string; publicName: string },
): Promise<UserRecord> {
  const userResult = await db.query(
    `INSERT INTO users (email, password_hash, status)
     VALUES ($1, $2, 'pending')
     RETURNING id, email, password_hash, status`,
    [input.email, input.passwordHash],
  );
  const user = userResult.rows[0];
  await db.query(
    `INSERT INTO profiles (user_id, public_name) VALUES ($1, $2)`,
    [user.id, input.publicName],
  );
  return { ...mapUser({ ...user, public_name: input.publicName }) };
}

export async function createEmailVerification(
  db: Queryable,
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await db.query(
    `UPDATE email_verification_tokens SET used_at = now()
      WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
  await db.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
}

export async function consumeEmailVerification(db: Queryable, tokenHash: string): Promise<UserRecord | null> {
  const result = await db.query(
    `WITH consumed AS (
      UPDATE email_verification_tokens
         SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id
    )
    UPDATE users u
       SET status = 'active', email_verified_at = now(), updated_at = now()
      FROM consumed
     WHERE u.id = consumed.user_id AND u.status = 'pending'
     RETURNING u.id, u.email, u.password_hash, u.status`,
    [tokenHash],
  );
  if (!result.rows[0]) return null;
  const user = await findUserById(db, result.rows[0].id);
  return user;
}

export async function markLogin(db: Queryable, userId: string): Promise<void> {
  await db.query('UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1', [userId]);
}

export async function sessionExpiry(db: Queryable, sessionId: string): Promise<string | null> {
  const result = await db.query('SELECT expires_at FROM sessions WHERE id = $1', [sessionId]);
  return result.rows[0]?.expires_at ? new Date(result.rows[0].expires_at).toISOString() : null;
}

export async function createPasswordReset(
  db: Queryable,
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await db.query(
    `UPDATE password_reset_tokens SET used_at = now()
      WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
}

export async function consumePasswordReset(
  db: Queryable,
  tokenHash: string,
  passwordHash: string,
): Promise<boolean> {
  const result = await db.query(
    `WITH consumed AS (
      UPDATE password_reset_tokens
         SET used_at = now()
       WHERE token_hash = $2
         AND used_at IS NULL
         AND expires_at > now()
       RETURNING user_id
    )
    UPDATE users u
       SET password_hash = $1, updated_at = now()
      FROM consumed
     WHERE u.id = consumed.user_id
     RETURNING u.id`,
    [passwordHash, tokenHash],
  );
  if (!result.rows[0]) return false;
  await db.query(
    `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [result.rows[0].id],
  );
  return true;
}
