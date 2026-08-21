import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionCard, FamilyCard } from '../constants';
import { ApiError, apiClient, isApiConfigured, type MatchCommandResult } from '../lib/api';

export interface ServerPlayer {
  id: number;
  name: string;
  hand: FamilyCard[];
  handCount: number;
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
  if (!value || typeof value !== 'object') throw new Error('Resposta inválida da partida.');
  const state = value as Partial<ServerGameState>;
  if (!Array.isArray(state.players)) throw new Error('Resposta da partida sem jogadores.');
  const players = state.players.map((rawPlayer, index) => {
    if (!rawPlayer || typeof rawPlayer !== 'object') throw new Error(`Jogador inválido na posição ${index}.`);
    const player = rawPlayer as Partial<ServerPlayer>;
    if (typeof player.id !== 'number' || typeof player.name !== 'string') {
      throw new Error(`Dados inválidos do jogador ${index + 1}.`);
    }
    return {
      ...player,
      hand: Array.isArray(player.hand) ? player.hand as FamilyCard[] : [],
      handCount: Number.isFinite(Number(player.handCount)) ? Number(player.handCount) : 0,
    } as ServerPlayer;
  });
  const phase = state.phase === 'action' || state.phase === 'gameOver' ? state.phase : 'playing';
  return {
    viewerSeat: Number(state.viewerSeat ?? -1),
    players,
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
  const generationRef = useRef(0);
  const versionRef = useRef(0);
  const pollInFlightRef = useRef(false);

  const reset = useCallback(() => {
    generationRef.current += 1;
    versionRef.current = 0;
    pollInFlightRef.current = false;
    setMatchId(null);
    setVersion(0);
    setState(null);
    setError(null);
    setJoinMatchId('');
  }, []);

  const applySnapshot = useCallback((snapshot: ServerMatchSnapshot, generation = generationRef.current, force = false) => {
    const nextVersion = Number(snapshot.version);
    if (
      generation !== generationRef.current ||
      !Number.isInteger(nextVersion) ||
      (!force && nextVersion <= versionRef.current)
    ) {
      return false;
    }
    const nextState = serverStateToUi(snapshot.state);
    versionRef.current = nextVersion;
    setVersion(nextVersion);
    setState(nextState);
    return true;
  }, []);

  const refreshSnapshot = useCallback(async () => {
    if (!matchId || pollInFlightRef.current) return;
    const generation = generationRef.current;
    pollInFlightRef.current = true;
    try {
      const snapshot = await apiClient.getMatch(matchId) as ServerMatchSnapshot;
      if (generation !== generationRef.current) return;
      applySnapshot(snapshot, generation);
      setError(null);
    } finally {
      if (generation === generationRef.current) pollInFlightRef.current = false;
    }
  }, [applySnapshot, matchId]);

  const start = useCallback(async () => {
    if (!isApiConfigured) {
      setError('Partidas com ranking oficial ainda não estão disponíveis neste ambiente.');
      return;
    }
    const generation = ++generationRef.current;
    versionRef.current = 0;
    setLoading(true);
    setError(null);
    try {
      const created = await apiClient.createMatch({
        mode: 'online',
        playerCount,
        playerNames,
      });
      const snapshot = await apiClient.getMatch(created.id) as ServerMatchSnapshot;
      if (generation !== generationRef.current) return;
      setMatchId(created.id);
      applySnapshot(snapshot, generation, true);
    } catch (requestError) {
      if (generation === generationRef.current) {
        setError(requestError instanceof ApiError
          ? requestError.message
          : 'Não foi possível iniciar a partida no servidor.');
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [applySnapshot, playerCount, playerNames]);

  const join = useCallback(async () => {
    const id = joinMatchId.trim();
    if (!id) {
      setError('Informe o código da sala.');
      return;
    }
    const generation = ++generationRef.current;
    versionRef.current = 0;
    setLoading(true);
    setError(null);
    try {
      const snapshot = await apiClient.joinMatch(id, playerNames[0]) as ServerMatchSnapshot & { id: string };
      if (generation !== generationRef.current) return;
      setMatchId(snapshot.id);
      applySnapshot(snapshot, generation, true);
    } catch (requestError) {
      if (generation === generationRef.current) {
        setError(requestError instanceof ApiError
          ? requestError.message
          : 'Não foi possível entrar na sala.');
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [applySnapshot, joinMatchId, playerNames]);

  const sendCommand = useCallback(async (type: 'DRAW_ACTION' | 'END_TURN') => {
    if (!matchId) return;
    const generation = generationRef.current;
    const expectedVersion = versionRef.current;
    setLoading(true);
    setError(null);
    try {
      const command: MatchCommandResult = await apiClient.sendMatchCommand(matchId, {
        command_id: globalThis.crypto.randomUUID(),
        expected_version: expectedVersion,
        type,
      });
      if (command.state && generation === generationRef.current) {
        applySnapshot({
          state: command.state,
          version: command.version ?? expectedVersion + 1,
        }, generation);
      }
    } catch (requestError) {
      if (generation === generationRef.current) {
        if (requestError instanceof ApiError && requestError.status === 409) {
          setError('Sua jogada chegou atrasada: a partida foi atualizada. Sincronizando…');
          void refreshSnapshot().catch(() => undefined);
        } else {
          setError(requestError instanceof ApiError
            ? requestError.message
            : 'Não foi possível sincronizar a partida.');
        }
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [applySnapshot, matchId, refreshSnapshot]);

  useEffect(() => {
    if (!enabled) {
      reset();
      return undefined;
    }
    if (!matchId || phase === 'gameOver') return undefined;

    const generation = generationRef.current;
    const timer = window.setInterval(async () => {
      if (generation !== generationRef.current) return;
      try {
        await refreshSnapshot();
      } catch (requestError) {
        if (generation !== generationRef.current) return;
        setError(requestError instanceof ApiError && requestError.status === 401
          ? 'Sua sessão expirou. Entre novamente para continuar a partida.'
          : 'Falha de conexão com o servidor. Tentando reconectar…');
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [enabled, matchId, phase, refreshSnapshot, reset]);

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
