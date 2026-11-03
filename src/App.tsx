import { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, RotateCcw, ArrowLeft, LogOut, Droplets, AlertTriangle, ShieldCheck, Heart } from 'lucide-react';
import type { ActionCard, FamilyCard } from './constants';
import { useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';
import InstallPrompt from './components/InstallPrompt';
import { ApiError, isApiConfigured } from './lib/api';
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
    <div className="min-h-[100dvh] flex items-center justify-center" role="status" aria-label="Carregando tela">
      <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

type GamePhase = 'home' | 'setup' | 'playing' | 'action' | 'gameOver' | 'leaderboard';

interface Player {
  id: number;
  name: string;
  hand: FamilyCard[];
  handCount?: number;
  score: number;
  isBot: boolean;
}

type GameMode = 'local' | 'server';

const LOCAL_MATCH_KEY = 'clube:partida-local';
const serverMatchKey = (userId: string) => `clube:partida-online:${userId}`;

function hasEmailAction() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return Boolean(query.get('verify') || query.get('reset') || hash.get('verify') || hash.get('reset'));
}

function clearSavedLocalMatch() {
  try {
    window.sessionStorage.removeItem(LOCAL_MATCH_KEY);
  } catch {
    // Storage may be blocked. The match still works, it only cannot be restored.
  }
}

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
  const [emailAction, setEmailAction] = useState(hasEmailAction);
  const serverMatch = useServerMatch({
    enabled: gameMode === 'server' && Boolean(user),
    phase,
    playerCount: numPlayers,
    playerNames,
  });

  const [showRules, setShowRules] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const matchRestored = useRef<string | null>(null);
  const inMatch = phase === 'playing' || phase === 'action';
  const clearSavedMatch = useCallback(() => {
    clearSavedLocalMatch();
    try {
      if (user) window.sessionStorage.removeItem(serverMatchKey(user.id));
    } catch { /* Storage may be blocked. */ }
  }, [user?.id]);

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
        name: playerNames[i],
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

    try {
      if (uiState.phase === 'playing' || uiState.phase === 'action') {
        window.sessionStorage.setItem(LOCAL_MATCH_KEY, JSON.stringify(nextGame));
      } else {
        window.sessionStorage.removeItem(LOCAL_MATCH_KEY);
      }
    } catch {
      // Storage may be blocked. The match still works, it only cannot be restored.
    }
  }, []);

  // A reload resumes the authenticated user's server match from its latest
  // authoritative snapshot. Only its ID is persisted, never private game state.
  useEffect(() => {
    if (loading) return;
    if (!user && !localMode) {
      matchRestored.current = null;
      setPhase('home');
      return;
    }
    const owner = user?.id ?? 'local';
    if (matchRestored.current === owner) return;
    if (emailAction) return;
    matchRestored.current = owner;
    try {
      const onlineId = user && window.sessionStorage.getItem(serverMatchKey(user.id));
      if (onlineId) {
        setGameMode('server');
        setPhase('setup');
        void serverMatch.resume(onlineId).catch(error => {
          if (error instanceof ApiError && [403, 404].includes(error.status)) {
            try { window.sessionStorage.removeItem(serverMatchKey(user.id)); } catch { /* Storage may be blocked. */ }
          }
        });
        return;
      }
      const saved = window.sessionStorage.getItem(LOCAL_MATCH_KEY);
      if (!saved) return;
      setGameMode('local');
      syncLocalGame(JSON.parse(saved) as LocalGameState);
    } catch {
      clearSavedLocalMatch();
    }
  }, [loading, user, localMode, syncLocalGame, emailAction, serverMatch.resume]);

  useEffect(() => {
    if (!user || gameMode !== 'server' || !serverMatch.matchId || !serverMatch.state) return;
    try {
      const key = serverMatchKey(user.id);
      if (serverMatch.state.phase === 'gameOver') window.sessionStorage.removeItem(key);
      else {
        window.sessionStorage.setItem(key, serverMatch.matchId);
        clearSavedLocalMatch();
      }
    } catch { /* Storage may be blocked. */ }
  }, [user?.id, gameMode, serverMatch.matchId, serverMatch.state]);

  // Each new phase and each turn of the viewer starts at the top of the page.
  useEffect(() => {
    if (phase === 'playing' && players[currentPlayerIndex]?.isBot) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentPlayerIndex]);

  // The browser Back button must not leave the app in the middle of a match.
  useEffect(() => {
    if (!inMatch) return undefined;
    window.history.pushState({ match: true }, '');
    const handlePopState = () => {
      if (window.confirm('Sair agora vai descartar a expedição atual. Continuar?')) {
        clearSavedMatch();
        serverMatch.reset();
        setPhase('home');
      } else {
        window.history.pushState({ match: true }, '');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inMatch]);

  const runLocalCommand = useCallback((command: 'DRAW_ACTION' | 'END_TURN') => {
    if (!localGame) return;

    try {
      syncLocalGame(dispatchLocalCommand(localGame, { type: command }));
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
    if (gameMode !== 'local') return undefined;
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
    return undefined;
  }, [gameMode, phase, currentPlayerIndex, players, drawAction, nextTurn]);

  const viewerSeat = serverMatch.state?.viewerSeat ?? -1;
  // Bots have no screen: during their turn the viewer keeps seeing their own hand.
  const firstHumanIndex = Math.max(players.findIndex(player => !player.isBot), 0);
  const handPlayerIndex = gameMode === 'server' && viewerSeat >= 0
    ? viewerSeat
    : players[currentPlayerIndex]?.isBot ? firstHumanIndex : currentPlayerIndex;

  const requestReset = useCallback((targetPhase: GamePhase) => {
    if (inMatch && !window.confirm('Reiniciar vai descartar a expedição atual. Continuar?')) {
      return;
    }
    clearSavedMatch();
    serverMatch.reset();
    setPhase(targetPhase);
  }, [inMatch, serverMatch, clearSavedMatch]);

  const leaveFinishedMatch = useCallback((targetPhase: GamePhase) => {
    serverMatch.reset();
    setPhase(targetPhase);
  }, [serverMatch]);

  const handleSignOut = useCallback(async () => {
    if (inMatch && !window.confirm('Sair da conta vai descartar a expedição atual. Continuar?')) {
      return;
    }
    clearSavedMatch();
    serverMatch.reset();
    setPlayers([]);
    setCurrentPlayerIndex(0);
    setFamilyDeck([]);
    setActionDeck([]);
    setPhase('home');
    setLastAction(null);
    setActionMessage('');
    setLocalGame(null);
    await signOut();
  }, [inMatch, serverMatch, signOut, clearSavedMatch]);

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
        <div className="text-center space-y-4" role="status" aria-label="Carregando aplicação">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-ink-muted font-mono text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  const installPrompt = <InstallPrompt paused={inMatch} />;

  if (emailAction || (!user && !localMode)) {
    return (
      <>
        <AuthScreen onComplete={() => setEmailAction(false)} />
        {installPrompt}
      </>
    );
  }

  const showStatBar = phase !== 'setup' && phase !== 'home' && phase !== 'leaderboard' && phase !== 'gameOver';

  return (
    <div className="min-h-screen bg-bg text-ink font-sans selection:bg-accent selection:text-white">
      {/* ==================== HEADER ==================== */}
      <header className="min-w-0 border-b border-border bg-surface/80 backdrop-blur-md px-4 py-2 md:p-6 flex justify-between items-center gap-3 sticky top-0 z-50">
        <button
          type="button"
          className="min-w-0 flex-1 flex items-center gap-3 text-left"
          onClick={() => requestReset('home')}
          aria-label="Clube de Ciências Bona, voltar ao início"
        >
          <img
            src="/assets/images/logo-clube.webp"
            width={192}
            height={192}
            alt=""
            className="h-11 w-11 md:h-14 md:w-14 shrink-0"
          />
          <div className="min-w-0 hidden min-[420px]:block">
            <span className="block truncate text-base md:text-xl font-bold tracking-tight font-serif italic">Clube de Ciências Bona</span>
            <p className="text-xs text-ink-muted font-mono uppercase tracking-widest hidden xl:block">Bioindicadores & Impacto Ambiental</p>
          </div>
        </button>
        <div className="shrink-0 flex gap-1.5 md:gap-4 items-center">
          <a
            href="https://clubedecienciasbona.com.br/"
            className="hidden xl:flex items-center gap-2 min-h-11 px-3 rounded-lg border border-border-strong text-xs font-bold text-ink-secondary hover:bg-surface-alt hover:text-ink transition-all"
            target="_blank"
            rel="noopener noreferrer"
            title="Volte para o site principal"
          >
            <ArrowLeft size={16} />
            <span>Volte para o site principal</span>
          </a>
          <button
            onClick={() => setShowRules(true)}
            className="min-w-[44px] min-h-[44px] p-3 hover:bg-surface-alt rounded-lg transition-all text-ink-secondary hover:text-ink"
            title="Ver Regras"
            aria-label="Ver regras do jogo"
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
              className="min-w-[44px] min-h-[44px] p-3 hover:bg-surface-alt rounded-lg transition-all text-ink-secondary hover:text-ink"
              title="Reiniciar"
              aria-label="Reiniciar expedição"
              id="btn-restart"
            >
              <RotateCcw size={18} />
            </button>
          )}
          {/* User info + Logout */}
          <div className={`${inMatch ? 'hidden md:flex' : 'flex'} items-center gap-2 border-l border-border pl-3 ml-1`}>
              <div className="hidden xl:block text-right">
                <div className="text-xs font-bold font-serif italic leading-tight truncate max-w-[120px]">{profile?.full_name}</div>
              <div className="text-xs text-ink-muted font-mono truncate max-w-[120px]">{user?.email || 'Modo local'}</div>
            </div>
            <button
              onClick={() => void handleSignOut()}
              className="min-w-[44px] min-h-[44px] p-3 hover:bg-danger-light rounded-lg transition-all text-ink-secondary hover:text-danger-text"
              title="Sair da conta"
              aria-label="Sair da conta"
              id="btn-logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto p-4 md:p-6 ${inMatch ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : ''}`}>
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
                currentRound={currentRound}
                maxRounds={MAX_ROUNDS}
                familyDeckCount={familyDeck.length}
                actionDeckCount={actionDeck.length}
                gameMode={gameMode}
                serverMatch={serverMatchForBoard}
                onDrawAction={drawAction}
                onNextTurn={nextTurn}
              />
            )}

            {phase === 'gameOver' && (
              <GameOverPage
                players={players}
                viewerIndex={gameMode === 'server' ? viewerSeat : firstHumanIndex}
                gameMode={gameMode}
                onShowRules={() => setShowRules(true)}
                onViewRanking={() => leaveFinishedMatch('leaderboard')}
                onNewGame={() => leaveFinishedMatch('setup')}
                onGoHome={() => leaveFinishedMatch('home')}
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

      {installPrompt}

      {/* ==================== RULES MODAL ==================== */}
      <Suspense fallback={null}>
        <RulesModal open={showRules} onClose={() => setShowRules(false)} />
      </Suspense>

      {/* ==================== ABOUT MODAL + FAB ==================== */}
      <Suspense fallback={null}>
        <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
      </Suspense>
      {!inMatch && (
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
      )}

      {/* ==================== GLOBAL FOOTER ==================== */}
      {!inMatch && (
      <footer className="pb-24 md:pb-12 mt-16 md:mt-20 border-t border-border p-8 md:p-12 bg-surface/50">
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
              <li className="flex items-center gap-2"><AlertTriangle size={12} className="text-danger-text shrink-0" /> Cartas de Impacto removem bioindicadores</li>
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
      )}
    </div>
  );
}
