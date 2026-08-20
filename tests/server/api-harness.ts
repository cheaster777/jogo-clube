import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { hashOpaqueToken, hashPassword } from '../../server/auth/password';
import { createApp } from '../../server/app';
import { loadConfig, type AppConfig } from '../../server/config';
import type { Pool } from 'pg';

type QueryResult = { rows: any[]; rowCount: number };

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  status: string;
  publicName: string;
};

type StoredSession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

type StoredMatch = {
  id: string;
  createdBy: string;
  mode: 'local' | 'online';
  status: string;
  seed: string;
  ruleVersion: string;
  stateVersion: number;
  currentRound: number;
  currentPlayerIndex: number;
  state: any;
};

type StoredPlayer = {
  id: string;
  matchId: string;
  userId: string | null;
  seat: number;
  displayName: string;
  isBot: boolean;
  status: string;
  score: number;
};

type StoredEvent = {
  id: number;
  matchId: string;
  commandId: string;
  actorUserId: string;
  versionBefore: number;
  versionAfter: number;
  eventType: string;
  payload: any;
  result: any;
  createdAt: string;
};

class TransactionMutex {
  private tail = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>(resolve => { release = resolve; });
    const previous = this.tail;
    this.tail = this.tail.then(() => next);
    await previous;
    return release;
  }
}

class MemoryClient {
  private releaseTransaction: (() => void) | null = null;

  constructor(private readonly database: MemoryDatabase) {}

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
    if (normalized === 'BEGIN') {
      this.releaseTransaction = await this.database.mutex.acquire();
      return { rows: [], rowCount: 0 };
    }
    if (normalized === 'COMMIT' || normalized === 'ROLLBACK') {
      this.releaseTransaction?.();
      this.releaseTransaction = null;
      return { rows: [], rowCount: 0 };
    }
    return this.database.query(sql, params);
  }

  release(): void {
    this.releaseTransaction?.();
    this.releaseTransaction = null;
  }
}

/**
 * Fake Pool determinístico para testes de contrato HTTP.
 * Não tenta simular PostgreSQL: apenas persiste o mínimo necessário para
 * exercitar as transações e as consultas dos repositórios reais.
 */
export class MemoryDatabase {
  readonly mutex = new TransactionMutex();
  readonly users: StoredUser[] = [];
  readonly sessions: StoredSession[] = [];
  readonly matches: StoredMatch[] = [];
  readonly players: StoredPlayer[] = [];
  readonly events: StoredEvent[] = [];
  readonly snapshots: Array<{ matchId: string; version: number; state: any }> = [];
  readonly scores: Array<Record<string, unknown>> = [
    {
      score: 120,
      quality_category: 'Bom',
      played_at: '2026-01-02T10:00:00.000Z',
      full_name: 'Jogadora Pública',
      email: 'nao-expor@example.com',
    },
  ];
  readonly queryLog: Array<{ sql: string; params: any[] }> = [];
  private nextMatchId = 1;
  private nextSessionId = 1;
  private nextEventId = 1;

  async connect(): Promise<MemoryClient> {
    return new MemoryClient(this);
  }

  seedUser(user: StoredUser): void {
    this.users.push(user);
  }

  seedSession(userId: string, token: string, id = `session-seeded-${userId}`): void {
    this.sessions.push({
      id,
      userId,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: null,
    });
  }

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    const q = sql.replace(/\s+/g, ' ').trim();
    this.queryLog.push({ sql: q, params });

    if (q === 'SELECT 1') return { rows: [{ '?column?': 1 }], rowCount: 1 };

    if (q.startsWith('SELECT s.id AS session_id')) {
      const session = this.sessions.find(item => item.tokenHash === params[0]
        && !item.revokedAt && item.expiresAt.getTime() > Date.now());
      const user = session ? this.users.find(item => item.id === session.userId && item.status === 'active') : undefined;
      if (!session || !user) return { rows: [], rowCount: 0 };
      return {
        rows: [{
          session_id: session.id,
          id: user.id,
          email: user.email,
          status: user.status,
          public_name: user.publicName,
        }],
        rowCount: 1,
      };
    }

    if (q.startsWith('UPDATE sessions SET last_seen_at')) return { rows: [], rowCount: 1 };

    if (q.startsWith('SELECT expires_at FROM sessions')) {
      const session = this.sessions.find(item => item.id === params[0]);
      return { rows: session ? [{ expires_at: session.expiresAt }] : [], rowCount: session ? 1 : 0 };
    }

    if (q.startsWith('UPDATE sessions SET revoked_at = now() WHERE id')) {
      const session = this.sessions.find(item => item.id === params[0]);
      if (session) session.revokedAt = new Date();
      return { rows: [], rowCount: session ? 1 : 0 };
    }

    if (q.startsWith('UPDATE sessions SET revoked_at = now() WHERE user_id')) {
      let count = 0;
      for (const session of this.sessions) {
        if (session.userId === params[0] && !session.revokedAt) {
          session.revokedAt = new Date();
          count += 1;
        }
      }
      return { rows: [], rowCount: count };
    }

    if (q.startsWith('SELECT u.id, u.email, u.password_hash') && q.includes('lower(u.email)')) {
      const email = String(params[0]).toLowerCase();
      const user = this.users.find(item => item.email.toLowerCase() === email);
      return {
        rows: user ? [this.userRow(user)] : [],
        rowCount: user ? 1 : 0,
      };
    }

    if (q.startsWith('SELECT u.id, u.email, u.password_hash') && q.includes('WHERE u.id')) {
      const user = this.users.find(item => item.id === params[0]);
      return {
        rows: user ? [this.userRow(user)] : [],
        rowCount: user ? 1 : 0,
      };
    }

    if (q.startsWith('UPDATE users SET last_login_at')) return { rows: [], rowCount: 1 };

    if (q.startsWith('INSERT INTO sessions')) {
      const session: StoredSession = {
        id: `session-${this.nextSessionId++}`,
        userId: params[0],
        tokenHash: params[1],
        expiresAt: new Date(params[2]),
        revokedAt: null,
      };
      this.sessions.push(session);
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('INSERT INTO matches')) {
      const match: StoredMatch = {
        id: `match-${this.nextMatchId++}`,
        createdBy: params[0],
        mode: params[1],
        status: 'active',
        seed: params[2],
        ruleVersion: '1.0.0',
        stateVersion: 0,
        currentRound: Number(params[3]),
        currentPlayerIndex: Number(params[4]),
        state: null,
      };
      this.matches.push(match);
      return { rows: [{ id: match.id }], rowCount: 1 };
    }

    if (q.startsWith('INSERT INTO match_players')) {
      this.players.push({
        id: `player-${this.players.length + 1}`,
        matchId: params[0],
        userId: params[1],
        seat: Number(params[2]),
        displayName: params[3],
        isBot: Boolean(params[4]),
        status: 'active',
        score: Number(params[5]),
      });
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('INSERT INTO match_snapshots')) {
      const initial = params.length === 2;
      const version = initial ? 0 : Number(params[1]);
      const state = initial ? params[1] : params[2];
      const matchId = params[0];
      this.snapshots.push({ matchId, version, state });
      const match = this.matches.find(item => item.id === matchId);
      if (match) match.state = state;
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('SELECT id, mode, status FROM matches')) {
      const match = this.matches.find(item => item.id === params[0]);
      return {
        rows: match ? [{ id: match.id, mode: match.mode, status: match.status }] : [],
        rowCount: match ? 1 : 0,
      };
    }

    if (q.startsWith('SELECT 1 FROM match_players WHERE match_id = $1 AND user_id = $2')) {
      const exists = this.players.some(item => item.matchId === params[0] && item.userId === params[1]);
      return { rows: exists ? [{ '?column?': 1 }] : [], rowCount: exists ? 1 : 0 };
    }

    if (q.startsWith('SELECT seat FROM match_players')) {
      const player = this.players
        .filter(item => item.matchId === params[0] && !item.isBot && item.userId === null)
        .sort((a, b) => a.seat - b.seat)[0];
      return { rows: player ? [{ seat: player.seat }] : [], rowCount: player ? 1 : 0 };
    }

    if (q.startsWith('UPDATE match_players SET user_id')) {
      const player = this.players.find(item => item.matchId === params[0] && item.seat === Number(params[1]));
      if (player) {
        player.userId = params[2];
        player.displayName = params[3];
      }
      return { rows: [], rowCount: player ? 1 : 0 };
    }

    if (q.startsWith('SELECT id, created_by, mode, status, seed, rule_version')) {
      const match = this.matches.find(item => item.id === params[0]);
      return { rows: match ? [this.matchRow(match)] : [], rowCount: match ? 1 : 0 };
    }

    if (q.startsWith('SELECT id, match_id, user_id, seat, display_name, is_bot, status, score')) {
      const rows = this.players
        .filter(item => item.matchId === params[0])
        .sort((a, b) => a.seat - b.seat)
        .map(item => ({
          id: item.id,
          match_id: item.matchId,
          user_id: item.userId,
          seat: item.seat,
          display_name: item.displayName,
          is_bot: item.isBot,
          status: item.status,
          score: item.score,
        }));
      return { rows, rowCount: rows.length };
    }

    if (q.startsWith('SELECT state FROM match_snapshots')) {
      const snapshot = this.snapshots.find(item => item.matchId === params[0] && item.version === Number(params[1]));
      return { rows: snapshot ? [{ state: snapshot.state }] : [], rowCount: snapshot ? 1 : 0 };
    }

    if (q.startsWith('SELECT result FROM match_events')) {
      const event = this.events.find(item => item.matchId === params[0] && item.commandId === params[1]);
      return { rows: event ? [{ result: event.result }] : [], rowCount: event ? 1 : 0 };
    }

    if (q.startsWith('INSERT INTO match_events')) {
      const event: StoredEvent = {
        id: this.nextEventId++,
        matchId: params[0],
        commandId: params[1],
        actorUserId: params[2],
        versionBefore: Number(params[3]),
        versionAfter: Number(params[4]),
        eventType: 'GAME_COMMAND',
        payload: params[5],
        result: params[6],
        createdAt: new Date().toISOString(),
      };
      this.events.push(event);
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('UPDATE matches SET state_version')) {
      const match = this.matches.find(item => item.id === params[0]);
      if (match) {
        match.stateVersion = Number(params[1]);
        match.currentRound = Number(params[2]);
        match.currentPlayerIndex = Number(params[3]);
        match.status = params[4];
      }
      return { rows: [], rowCount: match ? 1 : 0 };
    }

    if (q.startsWith('UPDATE match_players SET score')) {
      const player = this.players.find(item => item.matchId === params[0] && item.seat === Number(params[1]));
      if (player) player.score = Number(params[2]);
      return { rows: [], rowCount: player ? 1 : 0 };
    }

    if (q.startsWith('INSERT INTO game_scores')) {
      this.scores.push({
        match_id: params[0],
        user_id: params[1],
        score: params[2],
        quality_category: params[3],
        quality_diagnosis: params[4],
        families_count: params[5],
        played_at: new Date().toISOString(),
      });
      return { rows: [], rowCount: 1 };
    }

    if (q.startsWith('SELECT version_after, event_type, payload, actor_user_id, created_at')) {
      const rows = this.events
        .filter(item => item.matchId === params[0] && item.versionAfter > Number(params[1]))
        .sort((a, b) => a.versionAfter - b.versionAfter)
        .slice(0, 200)
        .map(item => ({
          version_after: item.versionAfter,
          event_type: item.eventType,
          payload: item.payload,
          actor_user_id: item.actorUserId,
          created_at: item.createdAt,
        }));
      return { rows, rowCount: rows.length };
    }

    if (q.startsWith('SELECT gs.score, gs.quality_category, gs.played_at')) {
      return { rows: this.scores.slice(Number(params[1]), Number(params[1]) + Number(params[0])), rowCount: this.scores.length };
    }

    throw new Error(`Consulta não coberta pelo harness QA: ${q}`);
  }

  private userRow(user: StoredUser): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email,
      password_hash: user.passwordHash,
      status: user.status,
      public_name: user.publicName,
    };
  }

  private matchRow(match: StoredMatch): Record<string, unknown> {
    return {
      id: match.id,
      created_by: match.createdBy,
      mode: match.mode,
      status: match.status,
      seed: match.seed,
      rule_version: match.ruleVersion,
      state_version: match.stateVersion,
      current_round: match.currentRound,
      current_player_index: match.currentPlayerIndex,
    };
  }
}

export interface TestHarness {
  database: MemoryDatabase;
  config: AppConfig;
  baseUrl: string;
  server: Server;
}

export async function createHarness(): Promise<TestHarness> {
  const database = new MemoryDatabase();
  const passwordHash = await hashPassword('Senha-forte-123');
  database.seedUser({
    id: 'user-1',
    email: 'ana@example.com',
    passwordHash,
    status: 'active',
    publicName: 'Ana',
  });
  database.seedUser({
    id: 'user-2',
    email: 'beto@example.com',
    passwordHash,
    status: 'active',
    publicName: 'Beto',
  });
  database.seedSession('user-1', 'token-one');
  database.seedSession('user-2', 'token-two');

  const config = loadConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://qa/fake',
    COOKIE_SECURE: 'true',
    CORS_ORIGIN: 'http://localhost:3000',
    AUTH_RATE_LIMIT_MAX: '100',
    COMMAND_RATE_LIMIT_MAX: '100',
    RATE_LIMIT_MAX: '100',
  });
  const app = createApp(database as unknown as Pool, config);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return { database, config, baseUrl: `http://127.0.0.1:${address.port}`, server };
}

export async function closeHarness(harness: TestHarness): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    harness.server.close(error => error ? reject(error) : resolve());
  });
}

export async function jsonRequest(
  harness: TestHarness,
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<{ status: number; body: any; setCookie: string }> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;
  const response = await fetch(`${harness.baseUrl}${path}`, {
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

export function cookieFromSetCookie(setCookie: string): string {
  return setCookie.split(';', 1)[0];
}

export async function withHarness<T>(callback: (harness: TestHarness) => Promise<T>): Promise<T> {
  const harness = await createHarness();
  try {
    return await callback(harness);
  } finally {
    await closeHarness(harness);
  }
}
