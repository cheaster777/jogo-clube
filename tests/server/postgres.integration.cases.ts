import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../../server/app';
import { loadConfig } from '../../server/config';

const databaseUrl = process.env.TEST_DATABASE_URL;

function poolForTest(): Pool {
  return new Pool({
    connectionString: databaseUrl,
    ssl: process.env.TEST_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
}

async function jsonRequest(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<{ status: number; body: any; setCookie: string }> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const raw = await response.text();
  return {
    status: response.status,
    body: raw ? JSON.parse(raw) : null,
    setCookie: response.headers.get('set-cookie') ?? '',
  };
}

function cookieFromSetCookie(value: string): string {
  return value.split(';', 1)[0];
}

async function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function registerAndConfirm(baseUrl: string, email: string, fullName: string, password: string) {
  const registered = await jsonRequest(baseUrl, '/api/v1/auth/register', {
    method: 'POST',
    body: { email, fullName, password },
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.requires_email_verification, true);
  assert.equal(typeof registered.body.verification_token, 'string');

  const confirmed = await jsonRequest(baseUrl, '/api/v1/auth/email-verification/confirm', {
    method: 'POST',
    body: { token: registered.body.verification_token },
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.user.email, email);
  return {
    userId: confirmed.body.user.id as string,
    cookie: cookieFromSetCookie(confirmed.setCookie),
  };
}

test('integração PostgreSQL opcional: schema mínimo disponível', {
  skip: databaseUrl ? false : 'Defina TEST_DATABASE_URL para executar; nenhum daemon foi presumido.',
}, async () => {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.TEST_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  try {
    const result = await pool.query(`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
    `, [[
          'users', 'profiles', 'sessions', 'matches', 'match_players',
          'match_events', 'match_snapshots', 'game_scores', 'email_verification_tokens',
        ]]);
    const tables = new Set(result.rows.map(row => row.table_name));
    assert.equal(tables.size, 9, 'Execute npm run db:migrate antes do smoke test PostgreSQL.');

    const openSeatConstraint = await pool.query(`
      SELECT 1
        FROM pg_constraint
       WHERE conrelid = 'public.match_players'::regclass
         AND conname = 'player_identity'
    `);
    assert.equal(openSeatConstraint.rowCount, 1, 'A migração deve permitir assentos online abertos.');
  } finally {
    await pool.end();
  }
});

test('integração PostgreSQL: conta, sala online, comandos e finalização', {
  skip: databaseUrl ? false : 'Defina TEST_DATABASE_URL para executar; nenhum daemon foi presumido.',
}, async () => {
  const pool = poolForTest();
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    RESET_TOKEN_EXPOSE: 'true',
    EMAIL_MODE: 'console',
    CORS_ORIGIN: 'http://localhost:3000',
    AUTH_RATE_LIMIT_MAX: '1000',
    COMMAND_RATE_LIMIT_MAX: '1000',
    RATE_LIMIT_MAX: '1000',
  });
  const { server, baseUrl } = await listen(createApp(pool, config));
  const firstEmail = `ci-${randomUUID()}@example.test`;
  const secondEmail = `ci-${randomUUID()}@example.test`;
  const password = 'Senha-forte-123';
  const newPassword = 'Senha-nova-456';
  const userIds: string[] = [];
  let matchId: string | null = null;

  try {
    const first = await registerAndConfirm(baseUrl, firstEmail, 'Jogadora CI', password);
    userIds.push(first.userId);

    const secondRegistered = await jsonRequest(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: { email: secondEmail, fullName: 'Jogador dois', password },
    });
    assert.equal(secondRegistered.status, 201);

    const pendingLogin = await jsonRequest(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: secondEmail, password },
    });
    assert.equal(pendingLogin.status, 401);
    assert.match(pendingLogin.body.error.message, /não confirmado/i);

    const secondConfirmed = await jsonRequest(baseUrl, '/api/v1/auth/email-verification/confirm', {
      method: 'POST',
      body: { token: secondRegistered.body.verification_token },
    });
    assert.equal(secondConfirmed.status, 200);
    const second = {
      userId: secondConfirmed.body.user.id as string,
      cookie: cookieFromSetCookie(secondConfirmed.setCookie),
    };
    userIds.push(second.userId);

    const resetRequest = await jsonRequest(baseUrl, '/api/v1/auth/password-reset', {
      method: 'POST',
      body: { email: firstEmail },
    });
    assert.equal(resetRequest.status, 200);
    assert.equal(typeof resetRequest.body.reset_token, 'string');
    const resetConfirm = await jsonRequest(baseUrl, '/api/v1/auth/password-reset/confirm', {
      method: 'POST',
      body: { token: resetRequest.body.reset_token, newPassword },
    });
    assert.equal(resetConfirm.status, 204);

    const firstLogin = await jsonRequest(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: firstEmail, password: newPassword },
    });
    assert.equal(firstLogin.status, 200);
    first.cookie = cookieFromSetCookie(firstLogin.setCookie);
    const firstMe = await jsonRequest(baseUrl, '/api/v1/me', { cookie: first.cookie });
    assert.equal(firstMe.status, 200);
    assert.equal(firstMe.body.user.email_verified, true);

    const created = await jsonRequest(baseUrl, '/api/v1/matches', {
      method: 'POST',
      cookie: first.cookie,
      body: { mode: 'online', playerCount: 2, playerNames: ['Jogadora CI', 'Aguardando'] },
    });
    assert.equal(created.status, 201);
    matchId = created.body.id;

    const beforeJoin = await jsonRequest(baseUrl, `/api/v1/matches/${matchId}`, { cookie: first.cookie });
    assert.equal(beforeJoin.status, 200);
    assert.equal(beforeJoin.body.state.players[1].userId, undefined);
    assert.equal(beforeJoin.body.state.players[1].handCount, 7);

    const joined = await jsonRequest(baseUrl, `/api/v1/matches/${matchId}/join`, {
      method: 'POST',
      cookie: second.cookie,
      body: { displayName: 'Jogador dois conectado' },
    });
    assert.equal(joined.status, 200);
    assert.equal(joined.body.state.viewerSeat, 1);

    const race = await Promise.all(['race-a', 'race-b'].map(commandId => jsonRequest(
      baseUrl,
      `/api/v1/matches/${matchId}/commands`,
      {
        method: 'POST',
        cookie: first.cookie,
        body: { command_id: commandId, expected_version: 0, type: 'DRAW_ACTION' },
      },
    )));
    assert.deepEqual(race.map(item => item.status).sort((a, b) => a - b), [200, 409]);

    let version = 1;
    let currentSeat = 0;
    let finalState: any = null;
    const cookies = [first.cookie, second.cookie];
    const sendTurn = async (type: 'DRAW_ACTION' | 'END_TURN') => {
      const response = await jsonRequest(baseUrl, `/api/v1/matches/${matchId}/commands`, {
        method: 'POST',
        cookie: cookies[currentSeat],
        body: { command_id: `ci-${version}-${type}`, expected_version: version, type },
      });
      assert.equal(response.status, 200);
      version = response.body.version;
      finalState = response.body.state;
      return response;
    };

    await sendTurn('END_TURN');
    currentSeat = 1;
    for (let remainingTurns = 0; remainingTurns < 9; remainingTurns += 1) {
      await sendTurn('DRAW_ACTION');
      const ending = await sendTurn('END_TURN');
      currentSeat = currentSeat === 0 ? 1 : 0;
      if (remainingTurns === 8) assert.equal(ending.body.state.phase, 'gameOver');
    }
    assert.equal(finalState.phase, 'gameOver');
    assert.equal(version, 20);

    const score = await pool.query(
      'SELECT user_id, score, quality_category FROM game_scores WHERE match_id = $1',
      [matchId],
    );
    assert.equal(score.rowCount, 1);
    assert.equal(String(score.rows[0].user_id), first.userId);
    assert.equal(typeof score.rows[0].score, 'number');

    const events = await jsonRequest(baseUrl, `/api/v1/matches/${matchId}/events?afterVersion=0`, {
      cookie: second.cookie,
    });
    assert.equal(events.status, 200);
    assert.equal(events.body.currentVersion, 20);
    assert.equal(events.body.events.length, 20);
    assert.equal(JSON.stringify(events.body).includes(firstEmail), false);

    const ranking = await jsonRequest(baseUrl, '/api/v1/leaderboard?limit=10&offset=0');
    assert.equal(ranking.status, 200);
    assert.equal(JSON.stringify(ranking.body).includes(firstEmail), false);
    assert.equal(ranking.body.some((entry: any) => entry.full_name === 'Jogadora CI'), true);
  } finally {
    if (matchId) await pool.query('DELETE FROM matches WHERE id = $1', [matchId]);
    if (userIds.length > 0) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [[firstEmail, secondEmail]]);
    await closeServer(server);
    await pool.end();
  }
});
