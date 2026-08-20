import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  applyCommand,
  createGame,
  playBotTurn,
  type GameCommand,
  type GameState,
  type PlayerSetup,
} from '../../src/game';
import { withTransaction } from '../db';
import { conflict, forbidden, notFound } from '../errors';
import type { MatchPlayerRecord, Queryable } from '../types';
import { waterQualityForScore } from '../game/score';

interface MatchRow {
  id: string;
  created_by: string;
  mode: 'local' | 'online';
  status: string;
  seed: string;
  rule_version: string;
  state_version: string | number;
  current_round: number;
  current_player_index: number;
}

export interface StoredMatch {
  match: MatchRow;
  players: MatchPlayerRecord[];
  state: GameState;
}

export interface MatchCreateInput {
  userId: string;
  publicName: string;
  mode: 'local' | 'online';
  playerCount: number;
  playerNames: string[];
}

function mapPlayer(row: any): MatchPlayerRecord {
  return {
    id: row.id,
    matchId: row.match_id,
    userId: row.user_id,
    seat: Number(row.seat),
    displayName: row.display_name,
    isBot: Boolean(row.is_bot),
    status: row.status,
    score: Number(row.score),
  };
}

async function readMatch(db: Queryable, matchId: string, forUpdate = false): Promise<StoredMatch> {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const matchResult = await db.query(
    `SELECT id, created_by, mode, status, seed, rule_version, state_version,
            current_round, current_player_index
       FROM matches WHERE id = $1${lock}`,
    [matchId],
  );
  const match = matchResult.rows[0] as MatchRow | undefined;
  if (!match) throw notFound('Partida não encontrada.');

  const [playersResult, snapshotResult] = await Promise.all([
    db.query(
      `SELECT id, match_id, user_id, seat, display_name, is_bot, status, score
         FROM match_players WHERE match_id = $1 ORDER BY seat`,
      [matchId],
    ),
    db.query(
      `SELECT state FROM match_snapshots
        WHERE match_id = $1 AND version = $2 LIMIT 1`,
      [matchId, match.state_version],
    ),
  ]);
  const snapshot = snapshotResult.rows[0];
  if (!snapshot) throw new Error('Snapshot da partida não encontrado.');
  return {
    match,
    players: playersResult.rows.map(mapPlayer),
    state: snapshot.state as GameState,
  };
}

function assertParticipant(stored: StoredMatch, userId: string): void {
  if (stored.match.created_by !== userId && !stored.players.some(player => player.userId === userId)) {
    throw forbidden('Você não participa desta partida.');
  }
}

export async function createMatch(pool: Pool, input: MatchCreateInput): Promise<{ id: string; version: number }> {
  return withTransaction(pool, async (client) => {
    const setups: PlayerSetup[] = Array.from({ length: input.playerCount }, (_, seat) => ({
      name: input.playerNames[seat] || (seat === 0 ? input.publicName : `Bot ${seat + 1}`),
      isBot: input.mode === 'local' && seat > 0,
    }));
    const seed = randomBytes(16).toString('hex');
    const state = createGame({ seed, players: setups });
    const matchResult = await client.query(
      `INSERT INTO matches (created_by, mode, status, seed, rule_version,
          current_round, current_player_index, state_version)
       VALUES ($1, $2, 'active', $3, '1.0.0', $4, $5, 0)
       RETURNING id`,
      [input.userId, input.mode, seed, state.currentRound, state.currentPlayerIndex],
    );
    const id = matchResult.rows[0].id as string;

    for (const [seat, setup] of setups.entries()) {
      await client.query(
        `INSERT INTO match_players (match_id, user_id, seat, display_name, is_bot, score)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, seat === 0 ? input.userId : null, seat, setup.name, setup.isBot, state.players[seat].score],
      );
    }
    await client.query(
      `INSERT INTO match_snapshots (match_id, version, state) VALUES ($1, 0, $2)`,
      [id, state],
    );
    return { id, version: 0 };
  });
}

export async function getMatch(db: Queryable, matchId: string, userId: string): Promise<StoredMatch> {
  const stored = await readMatch(db, matchId);
  assertParticipant(stored, userId);
  return stored;
}

export async function joinMatch(pool: Pool, matchId: string, userId: string, displayName: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    const matchResult = await client.query('SELECT id, mode, status FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
    const match = matchResult.rows[0];
    if (!match) throw notFound('Partida não encontrada.');
    if (match.mode !== 'online' || match.status !== 'active') throw conflict('Esta sala não aceita novos jogadores.');
    const existing = await client.query('SELECT 1 FROM match_players WHERE match_id = $1 AND user_id = $2', [matchId, userId]);
    if (existing.rows[0]) return;
    const seat = await client.query(
      `SELECT seat FROM match_players
        WHERE match_id = $1 AND is_bot = false AND user_id IS NULL
        ORDER BY seat LIMIT 1 FOR UPDATE`,
      [matchId],
    );
    if (!seat.rows[0]) throw conflict('A sala está cheia.');
    await client.query(
      `UPDATE match_players SET user_id = $3, display_name = $4
        WHERE match_id = $1 AND seat = $2`,
      [matchId, seat.rows[0].seat, userId, displayName],
    );
  });
}

export function publicState(stored: StoredMatch, viewerId: string): Record<string, unknown> {
  return {
    viewerSeat: stored.players.find(player => player.userId === viewerId)?.seat ?? -1,
    players: stored.state.players.map((player) => {
      const record = stored.players.find(item => item.seat === player.id);
      const canSeeHand = record?.userId === viewerId;
      return {
        id: player.id,
        name: record?.displayName ?? player.name,
        score: player.score,
        isBot: player.isBot,
        hand: canSeeHand ? player.hand : [],
        handCount: player.hand.length,
      };
    }),
    familyDeckCount: stored.state.familyDeck.length,
    actionDeckCount: stored.state.actionDeck.length,
    currentPlayerIndex: stored.state.currentPlayerIndex,
    currentRound: stored.state.currentRound,
    maxRounds: stored.state.maxRounds,
    phase: stored.state.phase,
    lastAction: stored.state.lastAction,
    actionMessage: stored.state.actionMessage,
    turnNumber: stored.state.turnNumber,
    gameOverReason: stored.state.gameOverReason,
  };
}

export async function executeCommand(
  pool: Pool,
  matchId: string,
  userId: string,
  command: { commandId: string; expectedVersion: number; type: GameCommand['type'] },
): Promise<{ version: number; state: GameState; event: Record<string, unknown>; duplicate?: boolean }> {
  return withTransaction(pool, async (client: PoolClient) => {
    const stored = await readMatch(client, matchId, true);
    assertParticipant(stored, userId);

    const actor = stored.players.find(player => player.userId === userId);
    const duplicateResult = await client.query(
      `SELECT result FROM match_events WHERE match_id = $1 AND command_id = $2 LIMIT 1`,
      [matchId, command.commandId],
    );
    if (duplicateResult.rows[0]) {
      return { ...(duplicateResult.rows[0].result as any), duplicate: true };
    }

    if (Number(stored.match.state_version) !== command.expectedVersion) {
      throw conflict('A versão da partida está desatualizada.', {
        currentVersion: Number(stored.match.state_version),
      });
    }
    if (!actor || stored.state.currentPlayerIndex !== actor.seat) {
      throw forbidden('Aguarde o seu turno.');
    }
    if (stored.match.status !== 'active') throw conflict('A partida não está ativa.');

    let nextState: GameState;
    try {
      nextState = applyCommand(stored.state, { type: command.type });
      const botTurns: string[] = [];
      for (let count = 0; count < 4; count += 1) {
        const current = nextState.players[nextState.currentPlayerIndex];
        if (!current?.isBot || nextState.phase === 'gameOver') break;
        botTurns.push(current.name);
        nextState = playBotTurn(nextState);
      }
      const versionBefore = Number(stored.match.state_version);
      const versionAfter = versionBefore + 1;
      const event = { type: 'GAME_COMMAND', commandType: command.type, botTurns };
      const result = { version: versionAfter, state: nextState, event };

      await client.query(
        `INSERT INTO match_events
          (match_id, command_id, actor_user_id, version_before, version_after,
           event_type, payload, result)
         VALUES ($1, $2, $3, $4, $5, 'GAME_COMMAND', $6, $7)`,
        [matchId, command.commandId, userId, versionBefore, versionAfter,
          { commandType: command.type, botTurns }, result],
      );
      await client.query(
        `INSERT INTO match_snapshots (match_id, version, state) VALUES ($1, $2, $3)`,
        [matchId, versionAfter, nextState],
      );
      await client.query(
        `UPDATE matches SET state_version = $2, current_round = $3,
            current_player_index = $4, status = $5,
            finished_at = CASE WHEN $5 = 'finished' THEN now() ELSE finished_at END
          WHERE id = $1`,
        [matchId, versionAfter, nextState.currentRound,
          nextState.currentPlayerIndex, nextState.phase === 'gameOver' ? 'finished' : 'active'],
      );
      for (const player of nextState.players) {
        await client.query(
          `UPDATE match_players SET score = $3 WHERE match_id = $1 AND seat = $2`,
          [matchId, player.id, player.score],
        );
      }
      if (nextState.phase === 'gameOver') {
        const creator = nextState.players.find(player => player.id === stored.players.find(item => item.userId === stored.match.created_by)?.seat);
        if (creator) {
          const quality = waterQualityForScore(creator.score);
          await client.query(
            `INSERT INTO game_scores
              (match_id, user_id, score, quality_category, quality_diagnosis, families_count, rule_version)
             VALUES ($1, $2, $3, $4, $5, $6, '1.0.0')
             ON CONFLICT (match_id) DO NOTHING`,
            [matchId, stored.match.created_by, creator.score, quality.category,
              quality.diagnosis, creator.hand.length],
          );
        }
      }
      return result;
    } catch (error) {
      if (error instanceof Error && !(error as any).statusCode) {
        throw conflict('Comando inválido para o estado atual.');
      }
      throw error;
    }
  });
}

export async function listEvents(db: Queryable, matchId: string, userId: string, afterVersion: number) {
  const stored = await getMatch(db, matchId, userId);
  const result = await db.query(
    `SELECT version_after, event_type, payload, actor_user_id, created_at
       FROM match_events WHERE match_id = $1 AND version_after > $2
      ORDER BY version_after ASC LIMIT 200`,
    [matchId, afterVersion],
  );
  return {
    currentVersion: Number(stored.match.state_version),
    events: result.rows.map((row: any) => ({
      version: Number(row.version_after),
      type: row.event_type,
      payload: row.payload,
      actorUserId: row.actor_user_id,
      createdAt: row.created_at,
    })),
  };
}

export async function leaderboard(db: Queryable, limit: number, offset = 0) {
  const result = await db.query(
    `SELECT gs.score, gs.quality_category, gs.played_at,
            p.public_name AS full_name
       FROM game_scores gs
       JOIN profiles p ON p.user_id = gs.user_id
      ORDER BY gs.score DESC, gs.played_at ASC, gs.id ASC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows.map((row: any) => ({
    score: Number(row.score),
    quality_category: row.quality_category,
    played_at: new Date(row.played_at).toISOString(),
    full_name: row.full_name,
  }));
}
