import { useState, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { User, Layers, Zap, AlertTriangle, ShieldCheck, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import { ACTION_CARDS_DATA, type ActionCard, type FamilyCard } from '../constants';
import { describeActionMessage, shouldUseDarkText } from '../lib/cardDisplay';
import CardDetailModal from './CardDetailModal';
import {
  playActionCardSound,
  getAudioMuted,
  toggleAudioMuted,
  subscribeAudioState,
  ensureAudioUnlocked,
} from '../lib/audio';

export interface GameBoardPlayer {
  id: number;
  name: string;
  hand: FamilyCard[];
  handCount?: number;
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
  /** Index into `players` whose hand is displayed: the viewer, never a bot. */
  handPlayerIndex: number;
  lastAction: ActionCard | null;
  actionMessage: string;
  currentRound: number;
  maxRounds: number;
  familyDeckCount: number;
  actionDeckCount: number;
  gameMode: 'local' | 'server';
  serverMatch: GameBoardServerMatch;
  onDrawAction: () => void;
  onNextTurn: () => void;
}

const SCOREBOARD_COLUMNS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

export default function GameBoard({
  phase,
  players,
  currentPlayerIndex,
  handPlayerIndex,
  lastAction,
  actionMessage,
  currentRound,
  maxRounds,
  familyDeckCount,
  actionDeckCount,
  gameMode,
  serverMatch,
  onDrawAction,
  onNextTurn,
}: GameBoardProps) {
  const [selectedCard, setSelectedCard] = useState<FamilyCard | null>(null);
  const [isMuted, setIsMuted] = useState(getAudioMuted());
  const [scoreDeltas, setScoreDeltas] = useState<Record<number, number>>({});
  const previousScores = useRef<Map<number, number>>(new Map(players.map(player => [player.id, player.score])));

  useEffect(() => {
    return subscribeAudioState((muted) => setIsMuted(muted));
  }, []);

  useEffect(() => {
    if (phase === 'action' && lastAction) {
      playActionCardSound(lastAction.title);
    }
  }, [phase, lastAction]);

  // The reveal animation lasts about 500 ms, so the art must already be cached.
  useEffect(() => {
    ACTION_CARDS_DATA.forEach(card => {
      const image = new Image();
      image.src = card.image;
    });
  }, []);

  // Works for both modes because it compares the state each one publishes.
  useEffect(() => {
    if (phase === 'playing') {
      setScoreDeltas({});
    } else {
      const deltas: Record<number, number> = {};
      players.forEach(player => {
        const previous = previousScores.current.get(player.id) ?? player.score;
        if (player.score !== previous) deltas[player.id] = player.score - previous;
      });
      setScoreDeltas(current => (Object.keys(deltas).length > 0 ? deltas : current));
    }
    previousScores.current = new Map(players.map(player => [player.id, player.score]));
  }, [players, phase]);

  const currentPlayer = players[currentPlayerIndex];
  const viewerSeat = serverMatch.state?.viewerSeat ?? -1;
  const viewerIsActing = gameMode === 'server' ? viewerSeat === currentPlayerIndex : !currentPlayer?.isBot;
  const resultMessage = describeActionMessage(actionMessage, currentPlayer?.name ?? '', viewerIsActing);
  const viewerHand = players[handPlayerIndex];

  const renderWaitStatus = (text: string) => (
    <div className="flex items-center justify-center gap-3 text-ink-secondary min-h-11" role="status">
      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      <span className="font-mono text-sm">{text}</span>
    </div>
  );

  // The same control appears inline on large screens and in the bottom bar on
  // phones, where the card and the collection push the inline one off screen.
  const renderTurnControl = (isBar: boolean): ReactNode => {
    if (currentPlayer?.isBot) {
      return renderWaitStatus(phase === 'playing' ? `${currentPlayer.name} está jogando...` : 'Próximo turno em instantes...');
    }
    if (!viewerIsActing) {
      return renderWaitStatus(`Aguardando ${currentPlayer?.name ?? 'o próximo jogador'}...`);
    }
    if (phase === 'playing') {
      return (
        <button
          type="button"
          onClick={() => {
            ensureAudioUnlocked();
            onDrawAction();
          }}
          disabled={serverMatch.loading}
          className={`btn btn-accent gap-3 ${isBar ? 'w-full' : 'btn-lg shadow-md hover:shadow-lg'}`}
          id={isBar ? 'btn-draw-action-bar' : 'btn-draw-action'}
        >
          Puxar Carta de Ação
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onNextTurn}
        disabled={serverMatch.loading}
        className={`btn btn-primary w-full gap-2 ${isBar ? '' : 'btn-lg'}`}
        id={isBar ? 'btn-next-turn-bar' : 'btn-next-turn'}
      >
        Próximo Turno <ChevronRight size={18} />
      </button>
    );
  };

  return (
    <motion.div
      key="game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-8"
    >
      {/* Keeps one stable live region, because the visible text is remounted on each phase. */}
      <div className="sr-only" aria-live="polite">
        {phase === 'action' && lastAction
          ? `${currentPlayer?.name ?? ''}: ${lastAction.title}. ${resultMessage}`
          : `Vez de ${currentPlayer?.name ?? 'aguarde'}.`}
      </div>

      {/* Sidebar: Players List */}
      <div className="lg:col-span-1 space-y-2 lg:space-y-3">
        {gameMode === 'server' && serverMatch.matchId && (
          <div className="card p-3 bg-accent-light/50 border-accent/20">
            <div className="label mb-1">Código da sala</div>
            <code className="text-xs break-all select-all text-accent">{serverMatch.matchId}</code>
            <p className="text-xs text-ink-muted mt-2">Compartilhe para outro jogador entrar.</p>
          </div>
        )}
        <div className="flex items-center justify-between lg:mb-4">
          <div className="label hidden lg:block">Expedição Atual</div>
          <div className="text-xs font-mono text-ink-secondary lg:hidden">
            Rodada <strong className="text-ink">{currentRound}</strong> de {maxRounds} · Famílias {familyDeckCount} · Ações {actionDeckCount}
          </div>
          <button
            type="button"
            onClick={() => toggleAudioMuted()}
            className="min-h-11 min-w-11 px-2 rounded-lg border border-border hover:border-accent text-ink-secondary hover:text-ink transition-colors flex items-center justify-center gap-1.5 text-xs font-mono"
            title={isMuted ? 'Ativar efeitos sonoros' : 'Silenciar efeitos sonoros'}
            aria-label={isMuted ? 'Ativar efeitos sonoros' : 'Silenciar efeitos sonoros'}
          >
            {isMuted ? <VolumeX size={15} className="text-danger-text" /> : <Volume2 size={15} className="text-accent" />}
            <span className="hidden sm:inline">{isMuted ? 'Mudo' : 'Som'}</span>
          </button>
        </div>
        <div className={`sticky top-[60px] md:top-[105px] lg:static z-30 -mx-1 px-1 py-1 bg-bg lg:bg-transparent grid ${SCOREBOARD_COLUMNS[players.length] ?? 'grid-cols-2'} lg:grid-cols-1 gap-2 lg:gap-3`}>
          {players.map((p, idx) => {
            const delta = scoreDeltas[p.id];
            return (
              <div
                key={p.id}
                className={`card min-w-0 p-2 lg:p-4 transition-all ${
                  currentPlayerIndex === idx ? 'card-active lg:scale-[1.02]' : 'bg-surface-alt'
                }`}
                id={`player-card-${p.id}`}
              >
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start lg:mb-2">
                  <div className="flex items-center gap-1.5 lg:gap-2 min-w-0">
                    <User size={14} className={`hidden lg:block shrink-0 ${currentPlayerIndex === idx ? 'text-accent' : ''}`} />
                    <span className="text-sm lg:text-base font-bold italic font-serif truncate">{p.name}</span>
                    {p.isBot && <span className="badge bg-accent-light text-accent text-xs shrink-0">Bot</span>}
                  </div>
                  <div className="flex items-baseline gap-1.5 shrink-0">
                    <span className="font-mono font-bold text-lg leading-tight lg:text-xs lg:bg-ink lg:text-white lg:px-2 lg:py-1 lg:rounded-md">
                      {p.score}<span className="text-xs lg:text-inherit"> pts</span>
                    </span>
                    {phase === 'action' && delta !== undefined && (
                      <motion.span
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`font-mono text-xs font-bold ${delta > 0 ? 'text-success' : 'text-danger-text'}`}
                      >
                        {delta > 0 ? '+' : ''}{delta}
                      </motion.span>
                    )}
                  </div>
                </div>
                <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-ink-muted">
                  <Layers size={12} /> {gameMode === 'server' ? (p.handCount ?? p.hand.length) : p.hand.length} cartas em mãos
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Area: Current Player Action */}
      <div className="lg:col-span-3 space-y-6 md:space-y-8">
        <div className={`card relative overflow-hidden shadow-sm flex flex-col items-center justify-center ${
          phase === 'playing' ? 'p-5 md:p-8 md:min-h-[400px]' : 'p-3 md:p-6'
        }`}>
          {/* Subtle dot pattern */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#1C1917 1px, transparent 0)', backgroundSize: '24px 24px' }} />

          {phase === 'playing' ? (
            <div className="text-center space-y-3 md:space-y-6 relative z-10">
              <div className="hidden md:inline-block p-4 rounded-2xl bg-accent-light/50 mb-4">
                <Zap size={48} className="text-accent animate-pulse" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold italic font-serif">
                {viewerIsActing ? 'Sua vez' : `Vez de ${currentPlayer?.name ?? 'aguarde'}`}
              </h2>
              <p className="max-w-md mx-auto text-ink-secondary leading-relaxed">
                O ambiente está em constante mudança. Você deve enfrentar as consequências das ações humanas ou colher os frutos da preservação.
              </p>
              {lastAction && (
                <p className="text-xs font-mono text-ink-muted">Última carta: {lastAction.title}</p>
              )}
              <div className="hidden md:block">{renderTurnControl(false)}</div>
            </div>
          ) : (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-3xl relative z-10"
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

                <div className="md:grid md:grid-cols-[5fr_6fr]">
                  <div className="h-36 md:h-auto md:min-h-[360px] w-full overflow-hidden relative bg-surface-alt">
                    <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #1C1917 0, #1C1917 1px, transparent 0, transparent 50%)', backgroundSize: '10px 10px' }}></div>
                    <motion.img
                      initial={{ scale: 0.8, rotate: lastAction.category === 'impact' ? -10 : 10, y: 50, opacity: 0 }}
                      animate={{ scale: 1, rotate: lastAction.category === 'impact' ? 2 : -2, y: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 50, damping: 10 }}
                      src={lastAction.image}
                      alt={lastAction.title}
                      decoding="async"
                      className="absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)] object-contain drop-shadow-xl origin-center"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <div className="p-4 md:p-6 bg-surface z-10 relative flex flex-col">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h2 className="text-2xl md:text-3xl font-bold italic font-serif tracking-tight leading-tight">{lastAction.title}</h2>
                      <button
                        type="button"
                        onClick={() => playActionCardSound(lastAction.title)}
                        className="min-h-11 min-w-11 flex items-center justify-center rounded-full border border-border hover:border-accent hover:text-accent text-ink-secondary transition-all shrink-0 shadow-xs"
                        title="Ouvir som característico desta carta"
                        aria-label="Ouvir som característico desta carta"
                      >
                        <Volume2 size={20} />
                      </button>
                    </div>

                    <div className="p-3 md:p-4 bg-surface-alt rounded-lg border border-border mb-4">
                      <div className="label mb-2">Resultado na Mesa</div>
                      <div className="font-bold text-sm tracking-tight">{resultMessage}</div>
                      {Object.keys(scoreDeltas).length > 0 && (
                        <ul className="mt-3 pt-3 border-t border-border space-y-1">
                          {Object.entries(scoreDeltas).map(([playerId, delta]: [string, number]) => {
                            const player = players.find(p => p.id === Number(playerId));
                            if (!player) return null;
                            return (
                              <li key={playerId} className="flex justify-between items-center text-xs font-mono">
                                <span className="text-ink-secondary">{player.name}</span>
                                <span className={delta > 0 ? 'text-success font-bold' : 'text-danger-text font-bold'}>
                                  {delta > 0 ? '+' : ''}{delta} pts
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <p className="text-sm text-ink-secondary mb-4 leading-relaxed">{lastAction.description}</p>

                    <div className="hidden md:block mt-auto">{renderTurnControl(false)}</div>
                  </div>
                </div>
              </div>
            )}
            </motion.div>
          )}
        </div>

        {serverMatch.error && (
          <div className="card p-4 border-danger/30 bg-danger-light text-danger-text text-sm" role="alert">
            {serverMatch.error}
          </div>
        )}

        {/* Viewer's Hand */}
        <div className="space-y-4">
          <div className="flex justify-between items-end gap-3">
            <div className="label">Sua Coleção de Bioindicadores</div>
            <div className="text-sm font-mono shrink-0">Total: <span className="font-bold">{viewerHand?.score ?? 0} pontos</span></div>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-4">
            {viewerHand?.hand.map((card) => (
              <motion.div
                layout
                key={card.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setSelectedCard(card)}
                className="family-card flex flex-col group cursor-pointer relative md:min-h-[320px]"
                title={`${card.name} - Toque para ver a descrição científica`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedCard(card);
                  }
                }}
                aria-label={`Ver detalhes e descrição científica de ${card.name}`}
              >
                <div className="p-1.5 md:p-2.5 flex justify-between items-start gap-1 border-b border-border bg-surface rounded-t-lg">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold font-serif italic leading-tight truncate">{card.name}</div>
                    <div className="hidden md:block text-xs text-ink-muted font-mono mt-0.5 truncate">{card.group.split(' - ')[1] || card.group}</div>
                  </div>
                  <div
                    className="score-badge !w-8 !h-8 !text-base md:!w-7 md:!h-7 md:!text-xs"
                    style={{ backgroundColor: card.color, color: shouldUseDarkText(card.color) ? '#1C1917' : '#ffffff' }}
                  >
                    {card.score}
                  </div>
                </div>

                {/* Card Image */}
                <div
                  className="h-24 md:h-auto md:flex-grow w-full relative overflow-hidden flex items-center justify-center p-2.5 border-b-0 md:border-b border-border"
                  style={{ background: `radial-gradient(circle at 50% 50%, ${card.color}25 0%, #FAFAF9 75%)` }}
                >
                  <img
                    src={card.image}
                    alt={card.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full max-h-full object-contain scale-125 drop-shadow-md group-hover:drop-shadow-xl group-hover:scale-135 transition-all duration-500 ease-out z-10"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Card Body: on phones the description lives in the detail modal. */}
                <div className="hidden md:flex p-2.5 flex-col justify-between flex-grow min-h-[78px] bg-surface rounded-b-lg">
                  <div className="text-xs leading-tight text-ink-secondary line-clamp-2">{card.description}</div>
                  <div className="mt-1.5 pt-1 border-t border-border flex justify-between items-center text-xs">
                    <span className="font-mono text-ink-muted">Bioindicador</span>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: card.color }} />
                  </div>
                </div>
                {/* Hover overlay for desktop */}
                <div className="hidden md:flex absolute inset-0 bg-ink/85 backdrop-blur-sm text-white p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 flex-col justify-center text-center pointer-events-none z-20">
                  <div className="text-xs uppercase tracking-widest mb-2 text-white/70 font-mono">Descrição Científica</div>
                  <div className="text-xs leading-relaxed italic font-serif">{card.description}</div>
                </div>
              </motion.div>
            ))}
            {(viewerHand?.hand.length ?? 0) === 0 && (
              <div className="col-span-full py-12 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-ink-muted italic">
                Sua mão está vazia.
              </div>
            )}
          </div>
        </div>
      </div>

      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />

      {/* Outside the animated tree: a transformed ancestor would break `fixed`. */}
      {createPortal(
        <div className="md:hidden fixed inset-x-0 bottom-0 z-[45] border-t border-border bg-surface px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lg">
          {renderTurnControl(true)}
        </div>,
        document.body,
      )}
    </motion.div>
  );
}
