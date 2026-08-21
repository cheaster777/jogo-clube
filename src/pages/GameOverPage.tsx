import { motion } from 'motion/react';
import { Trophy } from 'lucide-react';
import type { FamilyCard } from '../constants';
import { getWaterQuality, shouldUseDarkText } from '../lib/cardDisplay';

// Mirrors the `Player` shape defined in App.tsx. Kept as a local copy (rather
// than a shared src/types/game.ts) so this file types cleanly on its own
// before App.tsx is wired up to import from here.
export interface Player {
  id: number;
  name: string;
  hand: FamilyCard[];
  handCount?: number;
  score: number;
  isBot: boolean;
}

type GameMode = 'local' | 'server';

interface GameOverPageProps {
  players: Player[];
  gameMode: GameMode;
  /** Open the rules modal (used by the BMWP water-quality table link). */
  onShowRules: () => void;
  /** Navigate to the leaderboard/ranking screen. */
  onViewRanking: () => void;
  /** Start a new expedition (go to the setup screen). */
  onNewGame: () => void;
  /** Return to the home screen. */
  onGoHome: () => void;
}

export default function GameOverPage({
  players,
  gameMode,
  onShowRules,
  onViewRanking,
  onNewGame,
  onGoHome,
}: GameOverPageProps) {
  return (
    <motion.div
      key="gameOver"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-2xl mx-auto mt-12 md:mt-20 text-center"
    >
      <div className="inline-block p-5 rounded-2xl bg-warning-light mb-6">
        <Trophy size={56} className="text-warning" />
      </div>
      <h2 className="text-4xl md:text-5xl font-bold italic font-serif mb-4 tracking-tight">Fim da Expedição!</h2>
      <p className="text-ink-secondary mb-10 leading-relaxed">Após 5 rodadas intensas, os dados foram coletados e o impacto foi medido. Quem melhor preservou o ecossistema?</p>

      <div className="grid grid-cols-1 gap-4 mb-10">
        {[...players].sort((a, b) => b.score - a.score).map((p, idx) => {
          const quality = getWaterQuality(p.score);
          return (
            <div
              key={p.id}
              className={`card p-5 md:p-6 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 ${
                idx === 0 ? 'ring-2 ring-warning shadow-lg bg-warning-light/30' : ''
              }`}
              id={`result-player-${p.id}`}
            >
              <div className="flex items-center gap-4 w-full md:w-auto">
                <span className="font-mono text-2xl text-ink-muted">#{String(idx + 1).padStart(2, '0')}</span>
                <div className="text-left">
                  <div className="font-bold text-lg md:text-xl italic font-serif">{p.name}</div>
                  <div className="text-xs text-ink-muted uppercase tracking-widest">{p.handCount ?? p.hand.length} famílias identificadas</div>
                </div>
              </div>

              <div className="flex flex-col items-center md:items-end gap-1.5 w-full md:w-auto">
                <div className="text-2xl md:text-3xl font-bold font-mono">{p.score} <span className="text-xs uppercase text-ink-muted">pts</span></div>
                <div
                  className="px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-md"
                  style={{ backgroundColor: quality.color, color: shouldUseDarkText(quality.color) ? '#1C1917' : '#FFFFFF' }}
                >
                  {quality.category}: {quality.diagnosis}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Water Quality hint link to rules */}
      <div className="mb-8">
        <button
          onClick={onShowRules}
          className="text-xs font-mono text-ink-muted hover:text-accent transition-colors underline underline-offset-2"
        >
          Ver tabela completa de qualidade da água (BMWP) →
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 px-4 py-2 bg-surface-alt border border-border rounded-lg text-ink-secondary text-sm font-semibold mb-6"
      >
        {gameMode === 'server'
          ? 'Resultado calculado pela API e elegível ao ranking oficial.'
          : 'Partida local: o resultado não é publicado no ranking. Apenas partidas validadas pela API geram pontuação oficial.'}
      </motion.div>

      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={onViewRanking}
          className="btn btn-secondary btn-lg"
          id="btn-view-ranking"
        >
          <Trophy size={18} /> Ver Ranking
        </button>
        <button
          onClick={onNewGame}
          className="btn btn-primary btn-lg"
          id="btn-new-game"
        >
          Nova Expedição
        </button>
        <button
          onClick={onGoHome}
          className="btn btn-secondary btn-lg"
          id="btn-go-home"
        >
          Voltar ao Início
        </button>
      </div>
    </motion.div>
  );
}
