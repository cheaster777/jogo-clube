import { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { Info, RotateCcw, ArrowLeft, LogOut, Droplets, AlertTriangle, ShieldCheck, Heart } from 'lucide-react';
import type { ActionCard, FamilyCard } from './constants';
import { useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';
import { isApiConfigured } from './lib/api';
import { createLocalGame, dispatchLocalCommand, getLocalUiState, LocalGameState } from './game/localAdapter';
import { useServerMatch } from './hooks/useServerMatch';

// Cada fase carrega só quando precisa: reduz o bundle inicial (a tela de
// autenticação/loading nunca precisa do código de jogo, ranking etc).
const HomePage = lazy(() => import('./pages/HomePage'));
const SetupPanel = lazy(() => import('./components/SetupPanel'));
const GameBoard = lazy(() => import('./components/GameBoard'));
const GameOverPage = lazy(() => import('./pages/GameOverPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const RulesModal = lazy(() => import('./components/RulesModal'));
const AboutModal = lazy(() => import('./components/AboutModal'));

function PhaseFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

type GamePhase = 'home' | 'setup' | 'playing' | 'action' | 'gameOver' | 'leaderboard';

interface Player {
  id: number;
  name: string;
  hand: FamilyCard[];
  score: number;
  isBot: boolean;
}

type GameMode = 'local' | 'server';

export default function App() {
  const { user, profile, loading, localMode, signOut } = useAuth();

  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [familyDeck, setFamilyDeck] = useState<FamilyCard[]>([]);
  const [actionDeck, setActionDeck] = useState<ActionCard[]>([]);
  const [phase, setPhase] = useState<GamePhase>('home');
  const [lastAction, setLastAction] = useState<ActionCard | null>(null);
  const [actionMessage, setActionMessage] = useState<string>('');
  const [numPlayers, setNumPlayers] = useState(2);
  const [playerNames, setPlayerNames] = useState<string[]>(['Jogador 1', 'Jogador 2']);
  const [botFlags, setBotFlags] = useState<boolean[]>([false, true]);
  const [currentRound, setCurrentRound] = useState(1);
  const MAX_ROUNDS = 5;
  const [localGame, setLocalGame] = useState<LocalGameState | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('local');
  const serverMatch = useServerMatch({
    enabled: gameMode === 'server',
    phase,
    playerCount: numPlayers,
    playerNames,
  });

  const [showRules, setShowRules] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  // Deltas de pontuação (id do jogador -> variação) causados pela última carta
  // de ação puxada, para deixar visível quando o efeito atinge outro jogador.
  const [scoreDeltas, setScoreDeltas] = useState<Record<string, number>>({});

  // Auto-fill player 1 name from the authenticated API profile.
  useEffect(() => {
    if (profile?.full_name) {
      setPlayerNames(prev => {
        const newNames = [...prev];
        newNames[0] = profile.full_name;
        return newNames;
      });
    }
  }, [profile]);

  // A partida atual é local. O resultado não é publicado pelo navegador;
  // somente uma partida criada e finalizada pela API poderá entrar no ranking.

  useEffect(() => {
    setPlayerNames(prev => {
      const newNames = [...prev];
      if (newNames.length < numPlayers) {
        for (let i = newNames.length; i < numPlayers; i++) {
          newNames.push(`Jogador ${i + 1}`);
        }
      } else if (newNames.length > numPlayers) {
        return newNames.slice(0, numPlayers);
      }
      return newNames;
    });

    setBotFlags(prev => {
      const newFlags = [...prev];
      if (newFlags.length < numPlayers) {
        for (let i = newFlags.length; i < numPlayers; i++) {
          newFlags.push(i > 0);
        }
      } else if (newFlags.length > numPlayers) {
        return newFlags.slice(0, numPlayers);
      }
      return newFlags;
    });
  }, [numPlayers]);

  useEffect(() => {
    if (gameMode !== 'server' || !serverMatch.state) return;
    const state = serverMatch.state;
    setPlayers(state.players);
    setFamilyDeck(new Array(state.familyDeckCount) as FamilyCard[]);
    setActionDeck(new Array(state.actionDeckCount) as ActionCard[]);
    setCurrentPlayerIndex(state.currentPlayerIndex);
    setCurrentRound(state.currentRound);
    setPhase(state.phase);
    setLastAction(state.lastAction);
    setActionMessage(state.actionMessage);
  }, [gameMode, serverMatch.state]);


  // Initialize Game
  const initGame = async () => {
    if (gameMode === 'server') {
      await serverMatch.start();
      return;
    }

    const nextGame = createLocalGame({
      seed: String(Date.now()),
      players: Array.from({ length: numPlayers }, (_, i) => ({
        name: botFlags[i] ? `${playerNames[i]} (BOT)` : playerNames[i],
        isBot: botFlags[i],
      })),
      maxRounds: MAX_ROUNDS,
    });

    syncLocalGame(nextGame);
  };

  const syncLocalGame = useCallback((nextGame: LocalGameState) => {
    const uiState = getLocalUiState(nextGame);
    setLocalGame(nextGame);
    setPlayers(uiState.players);
    setFamilyDeck(uiState.familyDeck);
    setActionDeck(uiState.actionDeck);
    setCurrentPlayerIndex(uiState.currentPlayerIndex);
    setCurrentRound(uiState.currentRound);
    setPhase(uiState.phase);
    setLastAction(uiState.lastAction);
    setActionMessage(uiState.actionMessage);
  }, []);

  const runLocalCommand = useCallback((command: 'DRAW_ACTION' | 'END_TURN') => {
    if (!localGame) return;

    try {
      const prevScoresById: Record<string, number> = {};
      localGame.players.forEach(p => { prevScoresById[String(p.id)] = p.score; });
      const nextGame = dispatchLocalCommand(localGame, { type: command });

      if (command === 'DRAW_ACTION') {
        const deltas: Record<string, number> = {};
        nextGame.players.forEach(p => {
          const prev: number = prevScoresById[String(p.id)] ?? p.score;
          if (p.score !== prev) deltas[String(p.id)] = p.score - prev;
        });
        setScoreDeltas(deltas);
      } else {
        setScoreDeltas({});
      }

      syncLocalGame(nextGame);
    } catch (error) {
      console.error('Falha ao executar comando local:', error);
    }
  }, [localGame, syncLocalGame]);

  const runServerCommand = useCallback((type: 'DRAW_ACTION' | 'END_TURN') => {
    void serverMatch.sendCommand(type);
  }, [serverMatch.sendCommand]);

  const drawAction = useCallback(() => {
    if (gameMode === 'server') {
      void runServerCommand('DRAW_ACTION');
      return;
    }
    runLocalCommand('DRAW_ACTION');
  }, [gameMode, runLocalCommand, runServerCommand]);

  const nextTurn = useCallback(() => {
    if (gameMode === 'server') {
      void runServerCommand('END_TURN');
      return;
    }
    runLocalCommand('END_TURN');
  }, [gameMode, runLocalCommand, runServerCommand]);

  // Bot Logic
  useEffect(() => {
    if (phase === 'playing' && players[currentPlayerIndex]?.isBot) {
      const timer = setTimeout(() => {
        drawAction();
      }, 1500);
      return () => clearTimeout(timer);
    }
    if (phase === 'action' && players[currentPlayerIndex]?.isBot) {
      const timer = setTimeout(() => {
        nextTurn();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [phase, currentPlayerIndex, players, drawAction, nextTurn]);
  const handPlayerIndex = gameMode === 'server' && (serverMatch.state?.viewerSeat ?? -1) >= 0
    ? serverMatch.state?.viewerSeat ?? -1
    : currentPlayerIndex;

  const requestReset = useCallback((targetPhase: GamePhase) => {
    const isDestructive = phase === 'playing' || phase === 'action' || phase === 'gameOver';
    if (isDestructive && !window.confirm('Reiniciar vai descartar a expedição atual. Continuar?')) {
      return;
    }
    serverMatch.reset();
    setPhase(targetPhase);
  }, [phase, serverMatch]);

  const serverMatchForBoard = useMemo(() => ({
    loading: serverMatch.loading,
    error: serverMatch.error,
    matchId: serverMatch.matchId,
    state: serverMatch.state ? { viewerSeat: serverMatch.state.viewerSeat ?? -1 } : serverMatch.state,
  }), [serverMatch.loading, serverMatch.error, serverMatch.matchId, serverMatch.state]);

  // Auth gate: show login screen if not authenticated
  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-ink-muted font-mono text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user && !localMode) {
    return <AuthScreen />;
  }

  const showStatBar = phase !== 'setup' && phase !== 'home' && phase !== 'leaderboard' && phase !== 'gameOver';

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-bg text-ink font-sans selection:bg-accent selection:text-white">
      {/* ==================== HEADER ==================== */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-md p-4 md:p-6 flex justify-between items-center sticky top-0 z-50">
        <button
          type="button"
          className="flex items-center gap-3 text-left"
          onClick={() => requestReset('home')}
        >
          <div className="relative w-24 h-16 flex items-center shrink-0">
            <img
              src="/assets/images/Cópia de Logo (1).png"
              alt="Logo Clube de Ciências"
              className="absolute left-0 rounded-lg scale-[1.35] origin-left drop-shadow-md z-10"
            />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight font-serif italic">Clube de Ciências de Bona</h1>
            <p className="text-xs text-ink-muted font-mono uppercase tracking-widest hidden sm:block">Bioindicadores & Impacto Ambiental</p>
          </div>
        </button>
        <div className="flex gap-2 md:gap-4 items-center">
          <a
            href="https://clubedecienciasbona.com/"
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-strong text-xs font-bold text-ink-secondary hover:bg-surface-alt hover:text-ink transition-all"
            target="_blank"
            rel="noopener noreferrer"
            title="Volte para o site principal"
          >
            <ArrowLeft size={16} />
            <span>Volte para o site principal</span>
          </a>
          <button
            onClick={() => setShowRules(true)}
            className="p-3 hover:bg-surface-alt rounded-lg transition-all text-ink-secondary hover:text-ink"
            title="Ver Regras"
            id="btn-rules"
          >
            <Info size={18} />
          </button>
          {showStatBar && (
            <div className="flex gap-4 font-mono text-xs border-l border-border pl-4 ml-2 hidden md:flex">
              <div className="stat-block">
                <span className="stat-label">Rodada</span>
                <span className="stat-value">{currentRound} / {MAX_ROUNDS}</span>
              </div>
              <div className="stat-block">
                <span className="stat-label">Famílias</span>
                <span className="stat-value">{familyDeck.length}</span>
              </div>
              <div className="stat-block">
                <span className="stat-label">Ações</span>
                <span className="stat-value">{actionDeck.length}</span>
              </div>
            </div>
          )}
          {phase !== 'home' && (
            <button
              onClick={() => requestReset('setup')}
              className="p-3 hover:bg-surface-alt rounded-lg transition-all text-ink-secondary hover:text-ink"
              title="Reiniciar"
              id="btn-restart"
            >
              <RotateCcw size={18} />
            </button>
          )}
          {/* User info + Logout */}
          <div className="flex items-center gap-2 border-l border-border pl-3 ml-1">
              <div className="hidden md:block text-right">
                <div className="text-xs font-bold font-serif italic leading-tight truncate max-w-[120px]">{profile?.full_name}</div>
              <div className="text-xs text-ink-muted font-mono truncate max-w-[120px]">{user?.email || 'Modo local'}</div>
            </div>
            <button
              onClick={signOut}
              className="p-3 hover:bg-danger-light rounded-lg transition-all text-ink-secondary hover:text-danger"
              title="Sair da conta"
              id="btn-logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <Suspense fallback={<PhaseFallback />}>
          <AnimatePresence mode="wait">

            {phase === 'home' && (
              <HomePage
                onStart={() => setPhase('setup')}
                onShowRules={() => setShowRules(true)}
                onGoToLeaderboard={() => setPhase('leaderboard')}
              />
            )}

            {phase === 'setup' && (
              <SetupPanel
                gameMode={gameMode}
                apiConfigured={isApiConfigured}
                onGameModeChange={setGameMode}
                playerCount={numPlayers}
                onPlayerCountChange={setNumPlayers}
                playerNames={playerNames}
                onPlayerNameChange={(index, name) => setPlayerNames(previous => previous.map((current, currentIndex) => currentIndex === index ? name : current))}
                botFlags={botFlags}
                onBotToggle={index => setBotFlags(previous => previous.map((flag, currentIndex) => currentIndex === index ? !flag : flag))}
                serverError={serverMatch.error}
                serverLoading={serverMatch.loading}
                joinMatchId={serverMatch.joinMatchId}
                onJoinMatchIdChange={serverMatch.setJoinMatchId}
                onJoin={() => void serverMatch.join()}
                onStart={() => void initGame()}
              />
            )}

            {(phase === 'playing' || phase === 'action') && (
              <GameBoard
                phase={phase}
                players={players}
                currentPlayerIndex={currentPlayerIndex}
                handPlayerIndex={handPlayerIndex}
                lastAction={lastAction}
                actionMessage={actionMessage}
                scoreDeltas={scoreDeltas}
                gameMode={gameMode}
                serverMatch={serverMatchForBoard}
                onDrawAction={drawAction}
                onNextTurn={nextTurn}
              />
            )}

            {phase === 'gameOver' && (
              <GameOverPage
                players={players}
                gameMode={gameMode}
                onShowRules={() => setShowRules(true)}
                onViewRanking={() => setPhase('leaderboard')}
                onNewGame={() => setPhase('setup')}
                onGoHome={() => setPhase('home')}
              />
            )}

            {phase === 'leaderboard' && (
              <LeaderboardPage
                onBack={() => setPhase('home')}
                onPlay={() => setPhase('setup')}
              />
            )}

          </AnimatePresence>
        </Suspense>
      </main>

      {/* ==================== RULES MODAL ==================== */}
      <Suspense fallback={null}>
        <RulesModal open={showRules} onClose={() => setShowRules(false)} />
      </Suspense>

      {/* ==================== ABOUT MODAL + FAB ==================== */}
      <Suspense fallback={null}>
        <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
      </Suspense>
      <motion.button
        onClick={() => setShowAbout(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-accent text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-all"
        title="Quem Somos Nós"
        aria-label="Quem Somos Nós"
        id="btn-about-fab"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <Heart size={24} />
      </motion.button>

      {/* ==================== GLOBAL FOOTER ==================== */}
      <footer className="mt-16 md:mt-20 border-t border-border p-8 md:p-12 bg-surface/50">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          <div className="space-y-4">
            <div className="label font-bold">Sobre o Jogo</div>
            <p className="text-sm leading-relaxed text-ink-secondary">
              O Clube de Ciências é um jogo estratégico que ensina sobre a importância dos macroinvertebrados como bioindicadores da qualidade da água. Famílias mais sensíveis à poluição valem mais pontos, mas são as primeiras a sofrer com impactos ambientais.
            </p>
          </div>
          <div className="space-y-4">
            <div className="label font-bold">Mecânicas</div>
            <ul className="text-sm space-y-2 text-ink-secondary">
              <li className="flex items-center gap-2"><Droplets size={12} className="text-accent shrink-0" /> Pontuação baseada em sensibilidade (1-10)</li>
              <li className="flex items-center gap-2"><AlertTriangle size={12} className="text-danger shrink-0" /> Cartas de Impacto removem bioindicadores</li>
              <li className="flex items-center gap-2"><ShieldCheck size={12} className="text-success shrink-0" /> Cartas de Mitigação recuperam o ecossistema</li>
            </ul>
          </div>
          <div className="space-y-4">
            <div className="label font-bold">Legenda de Cores</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#3b82f6' }} /> Sens. Alta (10)
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#60a5fa' }} /> Sens. Alta (8)
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#22c55e' }} /> Sens. M-Alta (7)
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#86efac' }} /> Sens. Média (6)
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#fde047' }} /> Sens. Média (5)
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#fb923c' }} /> Sens. M-Baixa (4)
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#f97316' }} /> Sens. Baixa (3)
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#ea580c' }} /> Sens. Baixa (2)
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#dc2626' }} /> Resistentes (1)
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-10 pt-8 border-t border-border text-center">
          <p className="text-xs uppercase tracking-widest text-ink-muted font-mono">Desenvolvido por Victor Gabriel para o projeto de clube bona</p>
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
}
