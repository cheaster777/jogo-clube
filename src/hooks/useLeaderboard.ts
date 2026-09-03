import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiClient } from '../lib/api';
import type { LeaderboardEntry } from '../lib/api';
import { isSupabaseMode, supabasePublic } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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

interface SupabaseRankingRow {
  id: string;
  user_id: string;
  score: number;
  quality_category: string;
  quality_diagnosis?: string;
  families_count?: number;
  played_at: string;
  full_name?: string;
}

/**
 * Encapsulates ranking/leaderboard data fetching: loading/loaded/error state
 * plus a request-id guard so that a stale, slow request can never clobber a
 * newer one's result (race-condition guard for concurrent fetches).
 */
export function useLeaderboard({ enabled }: UseLeaderboardOptions) {
  const { user } = useAuth();
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardLoaded, setLeaderboardLoaded] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const leaderboardRequestId = useRef(0);

  // Fetch leaderboard through either Supabase (Netlify) or the API (VPS)
  const fetchLeaderboard = useCallback(async () => {
    const requestId = leaderboardRequestId.current + 1;
    leaderboardRequestId.current = requestId;

    setLeaderboardLoading(true);
    setLeaderboardLoaded(false);
    setLeaderboardError(null);
    setLeaderboardData([]);

    try {
      if (isSupabaseMode) {
        const { data, error } = await supabasePublic
          .from('ranking_global')
          .select('id, user_id, score, quality_category, quality_diagnosis, families_count, played_at, full_name')
          .order('score', { ascending: false })
          .limit(50);

        if (requestId !== leaderboardRequestId.current) return;

        if (error) {
          console.warn('ranking_global indisponível, tentando fallback em game_scores:', error.message);
          const { data: fallback, error: fallbackErr } = await supabasePublic
            .from('game_scores')
            .select('id, user_id, score, quality_category, quality_diagnosis, families_count, played_at')
            .order('score', { ascending: false })
            .limit(50);

          if (fallbackErr) throw new Error(fallbackErr.message);

          const entries: LeaderboardEntry[] = ((fallback as unknown as SupabaseRankingRow[]) || []).map(row => ({
            score: row.score,
            quality_category: row.quality_category,
            played_at: row.played_at,
            full_name: 'Cientista',
            is_current_user: user?.id ? row.user_id === user.id : false,
          }));
          setLeaderboardData(entries);
        } else {
          const entries: LeaderboardEntry[] = ((data as unknown as SupabaseRankingRow[]) || []).map(row => ({
            score: row.score,
            quality_category: row.quality_category,
            played_at: row.played_at,
            full_name: row.full_name || 'Cientista',
            is_current_user: user?.id ? row.user_id === user.id : false,
          }));
          setLeaderboardData(entries);
        }
      } else {
        const response = await apiClient.getLeaderboard(50);
        if (requestId !== leaderboardRequestId.current) return;

        const entries = Array.isArray(response)
          ? response
          : (response as LeaderboardApiEnvelope).data ?? (response as LeaderboardApiEnvelope).entries ?? [];
        setLeaderboardData(entries as LeaderboardEntry[]);
      }
    } catch (err) {
      if (requestId !== leaderboardRequestId.current) return;
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Não foi possível carregar o ranking. Tente novamente.';
      setLeaderboardData([]);
      setLeaderboardError(message);
    } finally {
      if (requestId !== leaderboardRequestId.current) return;
      setLeaderboardLoading(false);
      setLeaderboardLoaded(true);
    }
  }, [user]);

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
