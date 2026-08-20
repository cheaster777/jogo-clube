import { motion } from 'motion/react';
import { User, Layers, Zap, AlertTriangle, ShieldCheck, ChevronRight } from 'lucide-react';
import type { ActionCard, FamilyCard } from '../constants';
import { shouldUseDarkText } from '../lib/cardDisplay';

export interface GameBoardPlayer {
  id: number;
  name: string;
  hand: FamilyCard[];
  score: number;
  isBot: boolean;
}

/** Subset of useServerMatch's return value that GameBoard actually needs. */
export interface GameBoardServerMatch {
  loading: boolean;
  error: string | null;
  matchId: string | null;
  state: { viewerSeat: number } | null | undefined;
}

interface GameBoardProps {
  phase: 'playing' | 'action';
  players: GameBoardPlayer[];
  currentPlayerIndex: number;
  /** Index into `players` whose hand is displayed (viewer seat for server games, current player for local). */
  handPlayerIndex: number;
  lastAction: ActionCard | null;
  actionMessage: string;
  /** Player id (as string) -> score delta caused by the last action card, local mode only. */
  scoreDeltas: Record<string, number>;
  gameMode: 'local' | 'server';
  serverMatch: GameBoardServerMatch;
  onDrawAction: () => void;
  onNextTurn: () => void;
}

export default function GameBoard({
  phase,
  players,
  currentPlayerIndex,
  handPlayerIndex,
  lastAction,
  actionMessage,
  scoreDeltas,
  gameMode,
  serverMatch,
  onDrawAction,
  onNextTurn,
}: GameBoardProps) {
  return (
    <motion.div
      key="game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-8"
    >
      {/* Sidebar: Players List */}
      <div className="lg:col-span-1 space-y-3">
        {gameMode === 'server' && serverMatch.matchId && (
          <div className="card p-3 bg-accent-light/50 border-accent/20">
            <div className="label mb-1">Código da sala</div>
            <code className="text-[11px] break-all select-all text-accent">{serverMatch.matchId}</code>
            <p className="text-[11px] text-ink-muted mt-2">Compartilhe para outro jogador entrar.</p>
          </div>
        )}
        <div className="label mb-4">Expedição Atual</div>
        {players.map((p, idx) => (
          <div
            key={p.id}
            className={`card p-4 transition-all ${
              currentPlayerIndex === idx
                ? 'card-active scale-[1.02]'
                : 'opacity-60'
            }`}
            id={`player-card-${p.id}`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <User size={14} className={currentPlayerIndex === idx ? 'text-accent shrink-0' : 'shrink-0'} />
                <span className="font-bold italic font-serif truncate">
                  {p.name}
                </span>
                {p.isBot && <span className="ml-1 badge bg-accent-light text-accent text-xs shrink-0">AI</span>}
              </div>
              <div className="font-mono text-xs font-bold bg-ink text-white px-2 py-1 rounded-md shrink-0">
                {p.score} pts
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-ink-muted">
              <Layers size={12} /> {p.hand.length} cartas em mãos
            </div>
          </div>
        ))}
      </div>

      {/* Main Area: Current Player Action */}
      <div className="lg:col-span-3 space-y-6 md:space-y-8">
        <div className="card p-6 md:p-8 min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden shadow-sm">
          {/* Subtle dot pattern */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#1C1917 1px, transparent 0)', backgroundSize: '24px 24px' }} />

          {phase === 'playing' ? (
            <div className="text-center space-y-6 relative z-10">
              <div className="inline-block p-4 rounded-2xl bg-accent-light/50 mb-4">
                <Zap size={48} className="text-accent animate-pulse" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold italic font-serif">Vez de {players[currentPlayerIndex].name}</h2>
              <p className="max-w-md mx-auto text-ink-secondary leading-relaxed">
                O ambiente está em constante mudança. Você deve enfrentar as consequências das ações humanas ou colher os frutos da preservação.
              </p>
              {players[currentPlayerIndex]?.isBot ? (
                <div className="flex items-center justify-center gap-3 text-ink-secondary" role="status" aria-live="polite">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  <span className="font-mono text-sm">{players[currentPlayerIndex].name} está jogando...</span>
                </div>
              ) : (
                <button
                  onClick={onDrawAction}
                  disabled={serverMatch.loading || (gameMode === 'server' && (serverMatch.state?.viewerSeat ?? -1) !== currentPlayerIndex)}
                  className="btn btn-accent btn-lg shadow-md hover:shadow-lg gap-3"
                  id="btn-draw-action"
                >
                  Puxar Carta de Ação
                </button>
              )}
            </div>
          ) : (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-2xl relative z-10"
            >
            {lastAction && (
              <div className={`action-card shadow-xl overflow-hidden ${
                lastAction.category === 'impact' ? 'action-card-impact' : 'action-card-mitigation'
              }`}>
                {/* Top Tag */}
                <div className={`w-full px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-white flex justify-between items-center z-20 relative ${
                  lastAction.category === 'impact' ? 'tag-impact' : 'tag-mitigation'
                }`}>
                  <span>{lastAction.category === 'impact' ? 'Impacto Ambiental' : 'Mitigação'}</span>
                  {lastAction.category === 'impact' ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
                </div>

                <div className="h-72 md:h-96 w-full overflow-hidden relative bg-surface-alt flex items-center justify-center">
                  <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #1C1917 0, #1C1917 1px, transparent 0, transparent 50%)', backgroundSize: '10px 10px' }}></div>

                  <motion.img
                    initial={{ scale: 0.8, rotate: lastAction.category === 'impact' ? -10 : 10, y: 50, opacity: 0 }}
                    animate={{ scale: 1.05, rotate: lastAction.category === 'impact' ? 2 : -2, y: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 50, damping: 10 }}
                    src={lastAction.image}
                    alt={lastAction.title}
                    decoding="async"
                    className="absolute inset-0 w-full h-[140%] top-1/2 -translate-y-1/2 object-contain drop-shadow-xl origin-center"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none"></div>
                </div>

                <div className="p-6 md:p-8 bg-surface z-10 relative">
                  <h2 className="text-3xl md:text-4xl font-bold mb-3 italic font-serif tracking-tight leading-tight">{lastAction.title}</h2>
                  <div className={`w-12 h-1 rounded-full mb-5 ${lastAction.category === 'impact' ? 'bg-danger' : 'bg-success'}`}></div>
                  <p className="text-ink-secondary mb-6 leading-relaxed">
                    {lastAction.description}
                  </p>

                  <div className="p-4 bg-surface-alt rounded-lg border border-border mb-6">
                    <div className="label mb-2">Resultado na Mesa</div>
                    <div className="font-bold text-sm tracking-tight">{actionMessage}</div>
                    {gameMode === 'local' && Object.keys(scoreDeltas).length > 0 && (
                      <ul className="mt-3 pt-3 border-t border-border space-y-1">
                        {Object.entries(scoreDeltas).map(([playerId, delta]: [string, number]) => {
                          const player = players.find(p => p.id === Number(playerId));
                          if (!player || delta === 0) return null;
                          return (
                            <li key={playerId} className="flex justify-between items-center text-xs font-mono">
                              <span className="text-ink-secondary">{player.name}</span>
                              <span className={delta > 0 ? 'text-success font-bold' : 'text-danger font-bold'}>
                                {delta > 0 ? '+' : ''}{delta} pts
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {players[currentPlayerIndex]?.isBot ? (
                    <div className="flex items-center justify-center gap-3 text-ink-secondary py-3" role="status" aria-live="polite">
                      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                      <span className="font-mono text-sm">{players[currentPlayerIndex].name} está decidindo o próximo passo...</span>
                    </div>
                  ) : (
                    <button
                      onClick={onNextTurn}
                      disabled={serverMatch.loading || (gameMode === 'server' && (serverMatch.state?.viewerSeat ?? -1) !== currentPlayerIndex)}
                      className="btn btn-primary btn-lg w-full gap-2"
                      id="btn-next-turn"
                    >
                      Próximo Turno <ChevronRight size={18} />
                    </button>
                  )}
                </div>
              </div>
            )}
            </motion.div>
          )}
        </div>

        {serverMatch.error && (
          <div className="card p-4 border-danger/30 bg-danger-light text-danger text-sm" role="alert">
            {serverMatch.error}
          </div>
        )}

        {/* Current Player's Hand */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <div className="label">Sua Coleção de Bioindicadores</div>
            <div className="text-sm font-mono">Total: <span className="font-bold">{players[handPlayerIndex]?.score ?? 0} pontos</span></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
            {players[handPlayerIndex]?.hand.map((card) => (
              <motion.div
                layout
                key={card.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="family-card aspect-[2/3] flex flex-col group cursor-help relative"
                title={card.description}
              >
                <div className="p-2.5 flex justify-between items-start border-b border-border bg-surface relative z-10 rounded-t-lg">
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="text-xs font-bold font-serif italic leading-tight truncate">{card.name}</div>
                    <div className="text-xs text-ink-muted font-mono mt-0.5 truncate">{card.group.split(' - ')[1] || card.group}</div>
                  </div>
                  <div
                    className="score-badge w-7 h-7 text-xs"
                    style={{ backgroundColor: card.color, color: shouldUseDarkText(card.color) ? '#1C1917' : '#ffffff' }}
                  >
                    {card.score}
                  </div>
                </div>

                {/* Card Image */}
                <div
                  className="flex-grow w-full relative border-b border-border overflow-hidden"
                  style={{
                    background: `radial-gradient(circle at 50% 50%, ${card.color}20 0%, #FAFAF9 70%)`
                  }}
                >
                  <img
                    src={card.image}
                    alt={card.name}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-[120%] object-contain top-1/2 -translate-y-1/2 drop-shadow-md group-hover:drop-shadow-xl group-hover:scale-110 group-hover:-translate-y-[55%] transition-all duration-500 ease-out"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[80px] font-serif italic font-bold opacity-[0.03] pointer-events-none select-none z-0" style={{ color: card.color }}>
                    {card.score}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-2.5 flex flex-col justify-between h-[72px] bg-surface z-10 relative rounded-b-lg">
                  <div className="overflow-hidden">
                    <div className="text-xs leading-tight text-ink-secondary line-clamp-2">{card.description}</div>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-border flex justify-between items-center">
                    <span className="text-xs font-mono text-ink-muted">Bioindicador</span>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: card.color }} />
                  </div>
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-ink/85 backdrop-blur-sm text-white p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-center text-center pointer-events-none z-20">
                  <div className="text-xs uppercase tracking-widest mb-2 text-white/60 font-mono">Descrição Científica</div>
                  <div className="text-xs leading-relaxed italic font-serif">{card.description}</div>
                </div>
              </motion.div>
            ))}
            {(players[handPlayerIndex]?.hand.length ?? 0) === 0 && (
              <div className="col-span-full py-12 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-ink-muted italic">
                Sua mão está vazia.
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
