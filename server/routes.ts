import { Router, type Response } from 'express';
import type { Pool } from 'pg';
import type { AppConfig } from './config';
import { consumeEmailVerification, consumePasswordReset, createEmailVerification, createPasswordReset, createUser, findUserByEmail, markLogin, sessionExpiry } from './repositories/auth';
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from './auth/password';
import { clearSessionCookie, createSession, setSessionCookie } from './auth/session';
import { withTransaction } from './db';
import { AppError, asyncHandler, badRequest, unauthorized } from './errors';
import { sendPasswordResetEmail, sendVerificationEmail } from './email';
import { requireAuth } from './middleware/auth';
import { createRateLimiter } from './middleware/rateLimit';
import { createMatch, executeCommand, getMatch, joinMatch, leaderboard, listEvents, publicState } from './repositories/matches';
import type { AuthenticatedRequest } from './types';
import {
  bodyObject,
  normalizeEmail,
  parseAfterVersion,
  parseMatchCommand,
  parseMatchCreate,
  parseOffset,
  parsePositiveLimit,
  requiredString,
  validatePassword,
} from './validation';

function authRequest(req: AuthenticatedRequest): { userId: string; email: string; publicName: string; sessionId: string } {
  if (!req.user || !req.sessionId) throw unauthorized();
  return { ...req.user, userId: req.user.id, sessionId: req.sessionId };
}

function authResponse(user: { id: string; email: string; publicName: string }, expiresAt: string | null) {
  return {
    user: { id: user.id, email: user.email, email_verified: true },
    profile: { id: user.id, full_name: user.publicName, created_at: new Date().toISOString() },
    session: { expires_at: expiresAt },
  };
}

export function createApiRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const authLimit = createRateLimiter(config, config.authRateLimitMax);
  const commandLimit = createRateLimiter(config, config.commandRateLimitMax);
  const protectedRoute = requireAuth(pool, config);

  router.post('/auth/register', authLimit, asyncHandler(async (req, res) => {
    const body = bodyObject(req.body);
    const email = normalizeEmail(requiredString(body, 'email', 3, 254));
    const rawPassword = body.password;
    if (typeof rawPassword !== 'string') throw badRequest('O campo password é obrigatório.');
    const password = validatePassword(rawPassword);
    const publicName = requiredString(body, 'fullName', 2, 80);
    const passwordHash = await hashPassword(password);

    const verificationToken = createOpaqueToken();
    const result = await withTransaction(pool, async (client) => {
      const user = await createUser(client, { email, passwordHash, publicName });
      await createEmailVerification(client, user.id, hashOpaqueToken(verificationToken), new Date(Date.now() + config.emailTokenTtlSeconds * 1000));
      return { user };
    });
    try {
      await sendVerificationEmail(config, email, verificationToken);
    } catch {
      throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Não foi possível enviar o email de confirmação.');
    }
    res.status(201).json({
      requires_email_verification: true,
      ...(config.resetTokenExpose ? { verification_token: verificationToken } : {}),
    });
  }));

  router.post('/auth/login', authLimit, asyncHandler(async (req, res) => {
    const body = bodyObject(req.body);
    const email = normalizeEmail(requiredString(body, 'email', 3, 254));
    const rawPassword = body.password;
    if (typeof rawPassword !== 'string') throw unauthorized('Email ou senha inválidos.');
    const user = await findUserByEmail(pool, email);
    if (user?.status === 'pending' && await verifyPassword(rawPassword, user.passwordHash)) {
      throw unauthorized('Email ainda não confirmado. Verifique sua caixa de entrada.');
    }
    if (!user || user.status !== 'active' || !(await verifyPassword(rawPassword, user.passwordHash))) {
      throw unauthorized('Email ou senha inválidos.');
    }
    const result = await withTransaction(pool, async (client) => {
      await markLogin(client, user.id);
      const token = await createSession(client, user.id, config, {
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
      return { token };
    });
    setSessionCookie(res, config, result.token);
    res.json(authResponse(user, new Date(Date.now() + config.sessionTtlSeconds * 1000).toISOString()));
  }));

  router.post('/auth/email-verification/resend', authLimit, asyncHandler(async (req, res) => {
    const body = bodyObject(req.body);
    const email = normalizeEmail(requiredString(body, 'email', 3, 254));
    const user = await findUserByEmail(pool, email);
    if (user?.status === 'pending') {
      const token = createOpaqueToken();
      await createEmailVerification(pool, user.id, hashOpaqueToken(token), new Date(Date.now() + config.emailTokenTtlSeconds * 1000));
      try {
        await sendVerificationEmail(config, email, token);
      } catch {
        throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Não foi possível enviar o email de confirmação.');
      }
    }
    res.json({ message: 'Se o email estiver pendente, um novo link foi enviado.' });
  }));

  router.post('/auth/email-verification/confirm', authLimit, asyncHandler(async (req, res) => {
    const token = requiredString(bodyObject(req.body), 'token', 16, 256);
    const result = await withTransaction(pool, async (client) => {
      const user = await consumeEmailVerification(client, hashOpaqueToken(token));
      if (!user) return null;
      const sessionToken = await createSession(client, user.id, config, {});
      return { user, sessionToken };
    });
    if (!result) throw unauthorized('Token de confirmação inválido ou expirado.');
    setSessionCookie(res, config, result.sessionToken);
    res.json(authResponse(result.user, new Date(Date.now() + config.sessionTtlSeconds * 1000).toISOString()));
  }));

  router.post('/auth/logout', protectedRoute, asyncHandler(async (req, res) => {
    const auth = authRequest(req as AuthenticatedRequest);
    await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [auth.sessionId]);
    clearSessionCookie(res, config);
    res.status(204).end();
  }));

  router.post('/auth/password-reset', authLimit, asyncHandler(async (req, res) => {
    const body = bodyObject(req.body);
    const email = normalizeEmail(requiredString(body, 'email', 3, 254));
    const user = await findUserByEmail(pool, email);
    const response: { message: string; reset_token?: string } = {
      message: 'Se o email estiver cadastrado, as instruções de recuperação serão disponibilizadas.',
    };
    if (user) {
      const token = createOpaqueToken();
      await createPasswordReset(pool, user.id, hashOpaqueToken(token), new Date(Date.now() + 30 * 60 * 1000));
      try {
        await sendPasswordResetEmail(config, email, token);
      } catch {
        throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Não foi possível enviar o email de recuperação.');
      }
      if (config.resetTokenExpose) response.reset_token = token;
    }
    res.json(response);
  }));

  router.post('/auth/password-reset/confirm', authLimit, asyncHandler(async (req, res) => {
    const body = bodyObject(req.body);
    const token = requiredString(body, 'token', 16, 256);
    const rawPassword = body.newPassword;
    if (typeof rawPassword !== 'string') throw badRequest('O campo newPassword é obrigatório.');
    const passwordHash = await hashPassword(validatePassword(rawPassword));
    const consumed = await consumePasswordReset(pool, hashOpaqueToken(token), passwordHash);
    if (!consumed) throw unauthorized('Token de recuperação inválido ou expirado.');
    res.status(204).end();
  }));

  router.get('/me', protectedRoute, asyncHandler(async (req, res) => {
    const auth = authRequest(req as AuthenticatedRequest);
    const expiresAt = await sessionExpiry(pool, auth.sessionId);
    res.json(authResponse({ id: auth.userId, email: auth.email, publicName: auth.publicName }, expiresAt));
  }));

  router.get('/leaderboard', asyncHandler(async (req, res) => {
    const limit = parsePositiveLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);
    res.json(await leaderboard(pool, limit, offset));
  }));

  router.post('/matches', protectedRoute, asyncHandler(async (req, res) => {
    const auth = authRequest(req as AuthenticatedRequest);
    const input = parseMatchCreate(bodyObject(req.body));
    const match = await createMatch(pool, {
      userId: auth.userId,
      publicName: auth.publicName,
      ...input,
    });
    res.status(201).json(match);
  }));

  router.post('/matches/:id/join', protectedRoute, asyncHandler(async (req, res) => {
    const auth = authRequest(req as AuthenticatedRequest);
    const body = bodyObject(req.body);
    const displayName = typeof body.displayName === 'string' && body.displayName.trim().length > 0
      ? body.displayName.trim().slice(0, 80)
      : auth.publicName;
    await joinMatch(pool, req.params.id, auth.userId, displayName);
    const stored = await getMatch(pool, req.params.id, auth.userId);
    res.json({
      id: stored.match.id,
      version: Number(stored.match.state_version),
      state: publicState(stored, auth.userId),
    });
  }));

  router.get('/matches/:id', protectedRoute, asyncHandler(async (req, res) => {
    const auth = authRequest(req as AuthenticatedRequest);
    const stored = await getMatch(pool, req.params.id, auth.userId);
    res.json({
      id: stored.match.id,
      mode: stored.match.mode,
      status: stored.match.status,
      rule_version: stored.match.rule_version,
      version: Number(stored.match.state_version),
      state: publicState(stored, auth.userId),
    });
  }));

  router.get('/matches/:id/events', protectedRoute, asyncHandler(async (req, res) => {
    const auth = authRequest(req as AuthenticatedRequest);
    const afterVersion = parseAfterVersion(req.query.afterVersion);
    res.json(await listEvents(pool, req.params.id, auth.userId, afterVersion));
  }));

  router.post('/matches/:id/commands', protectedRoute, commandLimit, asyncHandler(async (req, res) => {
    const auth = authRequest(req as AuthenticatedRequest);
    const command = parseMatchCommand(bodyObject(req.body));
    const result = await executeCommand(pool, req.params.id, auth.userId, command);
    const stored = await getMatch(pool, req.params.id, auth.userId);
    res.json({
      version: result.version,
      duplicate: result.duplicate ?? false,
      event: result.event,
      state: publicState({ ...stored, state: result.state }, auth.userId),
    });
  }));

  return router;
}
