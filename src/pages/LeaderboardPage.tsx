import { motion } from 'motion/react';
import { Trophy, RotateCcw, ArrowLeft, AlertTriangle, Play, Medal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { getWaterQuality } from '../lib/cardDisplay';
import type { LeaderboardEntry } from '../lib/api';

interface LeaderboardPageProps {
  /** Navigate back to the home screen (header back arrow). */
  onBack: () => void;
  /** Navigate to the setup screen to start/join a game (empty-state CTA and bottom "Jogar Agora"). */
  onPlay: () => void;
}

// The API-side LeaderboardEntry type doesn't (yet) declare `user_id`, but the
// leaderboard payload does include it so we can highlight the viewer's own
// position. Widen locally instead of touching the shared api.ts contract.
type LeaderboardEntryWithUser = LeaderboardEntry & { user_id?: string };

export default function LeaderboardPage({ onBack, onPlay }: LeaderboardPageProps) {
  const { user } = useAuth();
  const {
    leaderboardData,
    leaderboardLoading,
    leaderboardLoaded,
    leaderboardError,
    fetchLeaderboard,
  } = useLeaderboard({ enabled: true });

  return (
    <motion.div
      key="leaderboard"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-warning-light flex items-center justify-center rounded-xl">
            <Trophy size={24} className="text-warning" />
          </div>
          <div>
            <h2 className="text-2xl font-bold italic font-serif">Ranking</h2>
            <p className="text-[10px] text-ink-muted font-mono uppercase tracking-[0.2em]">Top Expedicionistas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLeaderboard}
            disabled={leaderboardLoading}
            className="p-2.5 hover:bg-surface-alt rounded-lg transition-all text-ink-secondary hover:text-ink disabled:opacity-40"
            title="Atualizar ranking"
          >
            <RotateCcw size={18} className={leaderboardLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onBack}
            className="p-2.5 hover:bg-surface-alt rounded-lg transition-all text-ink-secondary hover:text-ink"
          >
            <ArrowLeft size={18} />
          </button>
        </div>
      </div>

      {!leaderboardLoaded ? (
        <div className="card p-8 text-center">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-ink-muted font-mono text-sm">Carregando ranking...</p>
        </div>
      ) : leaderboardError ? (
        <div className="card p-8 text-center space-y-4" role="alert">
          <AlertTriangle size={40} className="text-danger mx-auto opacity-80" />
          <div>
            <p className="font-semibold text-danger">Não foi possível carregar o ranking.</p>
            <p className="text-sm text-ink-muted mt-1">{leaderboardError}</p>
          </div>
          <button
            onClick={fetchLeaderboard}
            className="btn btn-secondary mx-auto"
            disabled={leaderboardLoading}
          >
            <RotateCcw size={16} className={leaderboardLoading ? 'animate-spin' : ''} />
            Tentar novamente
          </button>
        </div>
      ) : leaderboardData.length === 0 ? (
        <div className="card p-8 text-center space-y-4">
          <Trophy size={40} className="text-ink-muted mx-auto opacity-30" />
          <p className="text-ink-muted font-serif italic">Nenhuma expedição registrada ainda. Seja o primeiro!</p>
          <button
            onClick={onPlay}
            className="btn btn-primary"
            id="btn-start-from-empty-leaderboard"
          >
            <Play size={16} fill="currentColor" /> Começar Expedição
          </button>
        </div>
      ) : (() => {
        // Find the user's best position in the ranking
        const userEntries = leaderboardData
          .map((e, i) => ({ entry: e as LeaderboardEntryWithUser, idx: i }))
          .filter(({ entry }) => entry.user_id === user?.id);
        const userBestPosition = userEntries.length > 0 ? userEntries[0].idx + 1 : null;

        return (
          <>
            {/* User position banner */}
            {userBestPosition !== null ? (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 px-4 py-3 bg-accent-light border border-accent/20 rounded-xl flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <Medal size={16} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold text-accent">Você está em #{userBestPosition}° no ranking!</div>
                  <div className="text-xs text-ink-secondary font-mono">Melhor pontuação: {userEntries[0].entry.score} pts</div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 px-4 py-3 bg-surface-alt border border-border rounded-xl flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center shrink-0 border border-border">
                  <Trophy size={16} className="text-ink-muted" />
                </div>
                <div>
                  <div className="text-sm font-bold text-ink">Você ainda não jogou</div>
                  <div className="text-xs text-ink-muted font-mono">Complete uma expedição para entrar no ranking!</div>
                </div>
              </motion.div>
            )}

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-alt border-b border-border">
                    <tr>
                      <th className="px-4 py-2.5 font-bold uppercase text-xs text-ink-secondary">#</th>
                      <th className="px-4 py-2.5 font-bold uppercase text-xs text-ink-secondary">Jogador</th>
                      <th className="px-4 py-2.5 font-bold uppercase text-xs text-ink-secondary">Pontos</th>
                      <th className="px-4 py-2.5 font-bold uppercase text-xs text-ink-secondary">Qualidade</th>
                      <th className="px-4 py-2.5 font-bold uppercase text-xs text-ink-secondary">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {leaderboardData.map((entry, idx) => {
                      const quality = getWaterQuality(entry.score);
                      const playerName = entry.full_name || 'Anônimo';
                      return (
                        <tr
                          key={`${entry.played_at}-${idx}`}
                          className={`transition-colors ${
                            idx === 0
                              ? 'bg-warning-light/30'
                              : 'hover:bg-surface-alt'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <span className={`font-mono font-bold ${
                              idx === 0 ? 'text-warning' :
                              idx === 1 ? 'text-ink-secondary' :
                              idx === 2 ? 'text-warning/60' :
                              'text-ink-muted'
                            }`}>
                              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-serif italic font-semibold">{playerName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold">{entry.score}</td>
                          <td className="px-4 py-3">
                            <span
                              className="px-2 py-0.5 rounded-md text-white font-bold text-xs"
                              style={{ backgroundColor: quality.color }}
                            >
                              {quality.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                            {new Date(entry.played_at).toLocaleDateString('pt-BR')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      <div className="mt-6 text-center">
        <button
          onClick={onPlay}
          className="btn btn-primary btn-lg"
          id="btn-play-from-leaderboard"
        >
          <Play size={18} fill="currentColor" /> Jogar Agora
        </button>
      </div>
    </motion.div>
  );
}
