import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiClient } from '../lib/api';
import type { LeaderboardEntry } from '../lib/api';

interface UseLeaderboardOptions {
  /**
   * Whether the leaderboard should be (re)fetched. Pass `true` for as long as
   * the consuming page/component is mounted (e.g. while `phase === 'leaderboard'`),
   * or thread a boolean derived from your own phase/state through here.
   */
  enabled: boolean;
}

interface LeaderboardApiEnvelope {
  data?: LeaderboardEntry[];
  entries?: LeaderboardEntry[];
}

/**
 * Encapsulates ranking/leaderboard data fetching: loading/loaded/error state
 * plus a request-id guard so that a stale, slow request can never clobber a
 * newer one's result (race-condition guard for concurrent fetches).
 */
export function useLeaderboard({ enabled }: UseLeaderboardOptions) {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardLoaded, setLeaderboardLoaded] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const leaderboardRequestId = useRef(0);

  // Fetch leaderboard through the API, with an explicit retryable error state.
  const fetchLeaderboard = useCallback(async () => {
    const requestId = leaderboardRequestId.current + 1;
    leaderboardRequestId.current = requestId;

    setLeaderboardLoading(true);
    setLeaderboardLoaded(false);
    setLeaderboardError(null);
    setLeaderboardData([]);

    try {
      const response = await apiClient.getLeaderboard(50);
      if (requestId !== leaderboardRequestId.current) return;

      const entries = Array.isArray(response)
        ? response
        : (response as LeaderboardApiEnvelope).data ?? (response as LeaderboardApiEnvelope).entries ?? [];
      setLeaderboardData(entries as LeaderboardEntry[]);
    } catch (err) {
      if (requestId !== leaderboardRequestId.current) return;
      const message = err instanceof ApiError
        ? err.message
        : 'Não foi possível carregar o ranking. Tente novamente.';
      setLeaderboardData([]);
      setLeaderboardError(message);
    } finally {
      if (requestId !== leaderboardRequestId.current) return;
      setLeaderboardLoading(false);
      setLeaderboardLoaded(true);
    }
  }, []);

  // Fetch leaderboard whenever this becomes enabled (e.g. entering the leaderboard phase).
  useEffect(() => {
    if (!enabled) return;
    fetchLeaderboard();
  }, [enabled, fetchLeaderboard]);

  return {
    leaderboardData,
    leaderboardLoading,
    leaderboardLoaded,
    leaderboardError,
    fetchLeaderboard,
  };
}
