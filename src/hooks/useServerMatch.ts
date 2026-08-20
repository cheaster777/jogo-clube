import { useCallback, useEffect, useState } from 'react';
import type { ActionCard, FamilyCard } from '../constants';
import { ApiError, apiClient, isApiConfigured, type MatchCommandResult } from '../lib/api';

export interface ServerPlayer {
  id: number;
  name: string;
  hand: FamilyCard[];
  score: number;
  isBot: boolean;
}

export interface ServerGameState {
  viewerSeat: number;
  players: ServerPlayer[];
  familyDeckCount: number;
  actionDeckCount: number;
  currentPlayerIndex: number;
  currentRound: number;
  phase: 'playing' | 'action' | 'gameOver';
  lastAction: ActionCard | null;
  actionMessage: string;
}

function serverActionToUi(action: unknown): ActionCard | null {
  if (!action || typeof action !== 'object') return null;
  const value = action as Omit<ActionCard, 'effect'>;
  return { ...value, effect: () => undefined } as ActionCard;
}

export function serverStateToUi(value: unknown): ServerGameState {
  const state = value as Partial<ServerGameState>;
  const phase = state.phase === 'action' || state.phase === 'gameOver' ? state.phase : 'playing';
  return {
    viewerSeat: Number(state.viewerSeat ?? -1),
    players: Array.isArray(state.players) ? state.players as ServerPlayer[] : [],
    familyDeckCount: Number(state.familyDeckCount ?? 0),
    actionDeckCount: Number(state.actionDeckCount ?? 0),
    currentPlayerIndex: Number(state.currentPlayerIndex ?? 0),
    currentRound: Number(state.currentRound ?? 1),
    phase,
    lastAction: serverActionToUi(state.lastAction),
    actionMessage: typeof state.actionMessage === 'string' ? state.actionMessage : '',
  };
}

interface UseServerMatchOptions {
  enabled: boolean;
  phase: 'home' | 'setup' | 'playing' | 'action' | 'gameOver' | 'leaderboard';
  playerCount: number;
  playerNames: string[];
}

interface ServerMatchSnapshot {
  version: number;
  state: unknown;
}

export function useServerMatch({ enabled, phase, playerCount, playerNames }: UseServerMatchOptions) {
  const [matchId, setMatchId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<ServerGameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinMatchId, setJoinMatchId] = useState('');

  const reset = useCallback(() => {
    setMatchId(null);
    setVersion(0);
    setState(null);
    setError(null);
    setJoinMatchId('');
  }, []);

  const applySnapshot = useCallback((snapshot: ServerMatchSnapshot) => {
    setVersion(snapshot.version);
    setState(serverStateToUi(snapshot.state));
  }, []);

  const start = useCallback(async () => {
    if (!isApiConfigured) {
      setError('Partidas com ranking oficial ainda não estão disponíveis neste ambiente.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await apiClient.createMatch({
        mode: 'online',
        playerCount,
        playerNames,
      });
      const snapshot = await apiClient.getMatch(created.id) as ServerMatchSnapshot;
      setMatchId(created.id);
      applySnapshot(snapshot);
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? requestError.message
        : 'Não foi possível iniciar a partida no servidor.');
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, playerCount, playerNames]);

  const join = useCallback(async () => {
    const id = joinMatchId.trim();
    if (!id) {
      setError('Informe o código da sala.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const snapshot = await apiClient.joinMatch(id, playerNames[0]) as ServerMatchSnapshot & { id: string };
      setMatchId(snapshot.id);
      applySnapshot(snapshot);
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? requestError.message
        : 'Não foi possível entrar na sala.');
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, joinMatchId, playerNames]);

  const sendCommand = useCallback(async (type: 'DRAW_ACTION' | 'END_TURN') => {
    if (!matchId) return;
    setLoading(true);
    setError(null);
    try {
      const command: MatchCommandResult = await apiClient.sendMatchCommand(matchId, {
        command_id: globalThis.crypto.randomUUID(),
        expected_version: version,
        type,
      });
      if (command.state) {
        applySnapshot({
          state: command.state,
          version: command.version ?? version + 1,
        });
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? requestError.message
        : 'Não foi possível sincronizar a partida.');
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, matchId, version]);

  useEffect(() => {
    if (!enabled) {
      reset();
      return undefined;
    }
    if (!matchId || phase === 'gameOver') return undefined;

    const timer = window.setInterval(async () => {
      try {
        const snapshot = await apiClient.getMatch(matchId) as ServerMatchSnapshot;
        if (snapshot.version > version) applySnapshot(snapshot);
      } catch {
        // A próxima rodada tenta a reconexão sem interromper a UI.
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [applySnapshot, enabled, matchId, phase, reset, version]);

  return {
    matchId,
    version,
    state,
    loading,
    error,
    joinMatchId,
    setJoinMatchId,
    reset,
    start,
    join,
    sendCommand,
  };
}
