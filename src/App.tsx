import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { 
  Trophy, 
  Users, 
  RotateCcw, 
  Play, 
  Info, 
  AlertTriangle, 
  ShieldCheck, 
  ChevronRight, 
  User, 
  Layers, 
  Zap, 
  Instagram, 
  X, 
  Leaf, 
  Droplets, 
  BookOpen, 
  ArrowLeft, 
  LogOut,
  Medal
} from 'lucide-react';
import { 
  FAMILY_CARDS_DATA, 
  ACTION_CARDS_DATA, 
  WATER_QUALITY_DATA,
  FamilyCard, 
  ActionCard 
} from './constants';
import { useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';
import SetupPanel from './components/SetupPanel';
import { ApiError, apiClient, isApiConfigured } from './lib/api';
import type { LeaderboardEntry } from './lib/api';
import { createLocalGame, dispatchLocalCommand, getLocalUiState, LocalGameState } from './game/localAdapter';
import { useServerMatch } from './hooks/useServerMatch';

// Helper to get water quality
const getWaterQuality = (score: number) => {
  return WATER_QUALITY_DATA.find(q => score >= q.minScore && score <= q.maxScore) || WATER_QUALITY_DATA[WATER_QUALITY_DATA.length - 1];
};

// Helper: WCAG relative luminance + contrast ratio, used to pick whichever of
// black/white text actually reads better against a given background color
// (a fixed luminance threshold doesn't reliably predict real AA contrast).
function srgbChannelToLinear(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hexColor: string): number {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

// Helper: determine if badge text should be dark, by picking whichever of
// black/white text yields the higher WCAG contrast ratio against the background.
const shouldUseDarkText = (hexColor: string): boolean => {
  const bgLuminance = relativeLuminance(hexColor);
  const contrastWithBlack = contrastRatio(bgLuminance, relativeLuminance('#1C1917'));
  const contrastWithWhite = contrastRatio(bgLuminance, relativeLuminance('#FFFFFF'));
  return contrastWithBlack >= contrastWithWhite;
};

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
  const rulesModalRef = useRef<HTMLDivElement>(null);
  const rulesCloseButtonRef = useRef<HTMLButtonElement>(null);
  const rulesTriggerElementRef = useRef<HTMLElement | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardLoaded, setLeaderboardLoaded] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const leaderboardRequestId = useRef(0);
  // Deltas de pontuação (id do jogador -> variação) causados pela última carta
  // de ação puxada, para deixar visível quando o efeito atinge outro jogador.
  const [scoreDeltas, setScoreDeltas] = useState<Record<string, number>>({});

  // Foco/teclado do modal de Regras: guarda quem abriu, foca o botão de
  // fechar ao abrir, restaura o foco ao fechar, Esc fecha, Tab fica preso.
  useEffect(() => {
    if (showRules) {
      rulesTriggerElementRef.current = document.activeElement as HTMLElement | null;
      rulesCloseButtonRef.current?.focus();
    } else {
      rulesTriggerElementRef.current?.focus();
    }
  }, [showRules]);

  useEffect(() => {
    if (!showRules) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowRules(false);
        return;
      }
      if (event.key !== 'Tab' || !rulesModalRef.current) return;

      const focusable = rulesModalRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showRules]);

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
        : response.data ?? response.entries ?? [];
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

  // Fetch leaderboard whenever entering leaderboard phase
  useEffect(() => {
    if (phase !== 'leaderboard') return;
    fetchLeaderboard();
  }, [phase, fetchLeaderboard]);
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

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-bg text-ink font-sans selection:bg-accent selection:text-white">
      {/* ==================== HEADER ==================== */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-md p-4 md:p-6 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => { serverMatch.reset(); setPhase('home'); }}>
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
        </div>
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
            className="p-2.5 hover:bg-surface-alt rounded-lg transition-all text-ink-secondary hover:text-ink"
            title="Ver Regras"
            id="btn-rules"
          >
            <Info size={18} />
          </button>
          {phase !== 'setup' && phase !== 'home' && (
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
              onClick={() => { serverMatch.reset(); setPhase('setup'); }}
              className="p-2.5 hover:bg-surface-alt rounded-lg transition-all text-ink-secondary hover:text-ink"
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
              className="p-2.5 hover:bg-danger-light rounded-lg transition-all text-ink-secondary hover:text-danger"
              title="Sair da conta"
              id="btn-logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <AnimatePresence mode="wait">

          {/* ==================== HOME PAGE ==================== */}
          {phase === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-16 md:space-y-24 py-8 md:py-12"
            >
              {/* --- Hero Section --- */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center" id="hero">
                <div className="space-y-6 md:space-y-8">
                  <div className="space-y-4">
                    <span className="inline-block text-xs font-mono uppercase tracking-widest bg-accent text-white px-3 py-1.5 rounded-md font-semibold">O Jogo Educativo</span>
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold italic font-serif leading-[0.95] tracking-tight text-balance">
                      DESCUBRA A <br /> VIDA NOS <br /> <span className="text-accent">RIACHOS</span>
                    </h2>
                    <p className="text-lg text-ink-secondary font-serif italic leading-relaxed max-w-lg">
                      Uma jornada científica para entender como pequenos organismos revelam a saúde dos nossos ecossistemas aquáticos.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => setPhase('setup')}
                      className="btn btn-primary btn-lg gap-3 shadow-md hover:shadow-lg"
                      id="btn-start"
                    >
                      Começar Expedição <Play size={18} fill="currentColor" />
                    </button>
                    <button
                      onClick={() => setShowRules(true)}
                      className="btn btn-secondary btn-lg"
                      id="btn-how-to-play"
                    >
                      Como Jogar
                    </button>
                    <button
                      onClick={() => setPhase('leaderboard')}
                      className="btn btn-secondary btn-lg"
                      id="btn-leaderboard"
                    >
                      <Medal size={18} /> Ranking
                    </button>
                    <button
                      onClick={() => {
                        document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="btn btn-secondary btn-lg hidden md:inline-flex"
                      id="btn-see-cards"
                    >
                      Ver Cartas
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <div className="aspect-square bg-surface rounded-2xl p-4 rotate-2 shadow-lg overflow-hidden border border-border">
                    <img 
                      src="/assets/images/WhatsApp Image 2026-04-15 at 12.10.36.jpeg" 
                      alt="Logo Clube de Ciências de Bona" 
                      className="w-full h-full object-cover rounded-xl"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="absolute -bottom-4 -left-4 aspect-[2/3] w-40 md:w-48 bg-surface rounded-xl border border-border p-3 -rotate-6 shadow-lg hidden md:block overflow-hidden">
                    <img src={FAMILY_CARDS_DATA[0].image} alt="Card Preview" className="w-full h-44 object-cover mb-2 rounded-lg" referrerPolicy="no-referrer" />
                    <div className="text-sm font-bold font-serif italic">{FAMILY_CARDS_DATA[0].name}</div>
                    <div className="text-xs text-ink-muted font-mono uppercase">{FAMILY_CARDS_DATA[0].group}</div>
                  </div>
                </div>
              </section>

              {/* --- Features Section --- */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-6 border-y border-border py-12 md:py-16">
                <div className="card p-6 space-y-4">
                  <div className="w-12 h-12 bg-accent-light flex items-center justify-center rounded-xl">
                    <Leaf size={24} className="text-accent" />
                  </div>
                  <h3 className="text-lg font-bold font-serif italic">Bioindicadores Reais</h3>
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    Todas as cartas são baseadas em famílias reais de macroinvertebrados bentônicos, com descrições científicas precisas.
                  </p>
                </div>
                <div className="card p-6 space-y-4">
                  <div className="w-12 h-12 bg-warning-light flex items-center justify-center rounded-xl">
                    <Zap size={24} className="text-warning" />
                  </div>
                  <h3 className="text-lg font-bold font-serif italic">Mecânica Estratégica</h3>
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    Equilibre sua coleção entre organismos sensíveis (mais pontos) e resistentes, enquanto lida com impactos ambientais.
                  </p>
                </div>
                <div className="card p-6 space-y-4">
                  <div className="w-12 h-12 bg-success-light flex items-center justify-center rounded-xl">
                    <BookOpen size={24} className="text-success" />
                  </div>
                  <h3 className="text-lg font-bold font-serif italic">Aprendizado Ativo</h3>
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    Desenvolvido para o Clube de Ciências, o jogo transforma conceitos complexos de ecologia em uma experiência divertida.
                  </p>
                </div>
              </section>

              {/* --- About / Science Section --- */}
              <section className="card p-8 md:p-12 space-y-8" id="about">
                <div className="max-w-3xl mx-auto text-center space-y-6">
                  <h3 className="text-3xl md:text-4xl font-bold font-serif italic tracking-tight">A Ciência por Trás do Jogo</h3>
                  <p className="text-ink-secondary leading-relaxed">
                    Este jogo foi desenvolvido como uma ferramenta pedagógica para o ensino de ecologia e monitoramento ambiental. 
                    Através do estudo de macroinvertebrados bentônicos, podemos avaliar a qualidade da água de riachos de forma precisa e acessível.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left pt-8">
                    <div className="space-y-3">
                      <h4 className="font-bold uppercase tracking-widest text-xs text-accent">O que são Bioindicadores?</h4>
                      <p className="text-sm text-ink-secondary">
                        Organismos cuja presença, ausência ou abundância revelam as condições ambientais de um ecossistema. 
                        Neste jogo, as famílias têm pontuações baseadas em sua sensibilidade à poluição.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-bold uppercase tracking-widest text-xs text-accent-hover">Impacto Ambiental</h4>
                      <p className="text-sm text-ink-secondary">
                        As cartas de ação representam eventos reais, como despejo de esgoto ou replantio de mata ciliar, 
                        mostrando como ações humanas afetam diretamente a biodiversidade aquática.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* --- Card Gallery Section --- */}
              <section id="gallery" className="space-y-12 py-8 md:py-12 scroll-mt-24">
                <div className="text-center space-y-4">
                  <h3 className="text-4xl md:text-5xl font-bold font-serif italic tracking-tight">Catálogo de Bioindicadores</h3>
                  <p className="text-ink-secondary max-w-2xl mx-auto">
                    Conheça todas as famílias de macroinvertebrados e as ações ambientais presentes no jogo. 
                    Cada organismo possui um nível de sensibilidade que determina sua pontuação.
                  </p>
                </div>

                <div className="space-y-16">
                  {/* Family Cards */}
                  <div className="space-y-8">
                    <div className="divider">
                      <h4 className="label">Famílias de Organismos</h4>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                      {FAMILY_CARDS_DATA.map((card, idx) => (
                        <div
                          key={`gallery-f-${idx}`}
                          className="family-card aspect-[2/3] flex flex-col group cursor-help relative"
                        >
                          <div className="p-3 flex justify-between items-start border-b border-border bg-surface relative z-10">
                            <div className="min-w-0 flex-1 mr-2">
                              <div className="text-sm font-bold font-serif italic leading-tight truncate">{card.name}</div>
                              <div className="text-xs text-ink-muted font-mono mt-0.5 truncate">{card.group.split(' - ')[1] || card.group}</div>
                            </div>
                            <div 
                              className="score-badge"
                              style={{ backgroundColor: card.color, color: shouldUseDarkText(card.color) ? '#1C1917' : '#ffffff' }}
                            >
                              {card.score}
                            </div>
                          </div>
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
                              className="absolute inset-0 w-full h-[120%] object-contain top-1/2 -translate-y-1/2 drop-shadow-lg group-hover:drop-shadow-xl group-hover:scale-110 group-hover:-translate-y-[55%] transition-all duration-500 ease-out"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[100px] font-serif italic font-bold opacity-[0.03] pointer-events-none select-none z-0" style={{ color: card.color }}>
                              {card.score}
                            </div>
                          </div>
                          <div className="p-3 flex flex-col justify-between flex-grow bg-surface rounded-b-lg">
                            <div>
                              <div className="text-xs text-ink-muted font-mono mb-1 truncate">{card.group}</div>
                              <div className="text-xs leading-tight text-ink-secondary line-clamp-3">{card.description}</div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-border flex justify-between items-center">
                              <span className="text-xs font-mono text-ink-muted">Bioindicador</span>
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: card.color }} />
                            </div>
                          </div>
                          {/* Hover overlay with glassmorphism */}
                          <div className="absolute inset-0 bg-ink/85 backdrop-blur-sm text-white p-4 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-center text-center pointer-events-none z-20">
                            <div className="text-xs uppercase tracking-widest mb-2 text-white/60 font-mono">Descrição Científica</div>
                            <div className="text-sm leading-relaxed italic font-serif">{card.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Cards */}
                  <div className="space-y-8">
                    <div className="divider">
                      <h4 className="label">Cartas de Ação</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                      {ACTION_CARDS_DATA.map((card, idx) => (
                        <div
                          key={`gallery-a-${idx}`}
                          className={`action-card flex flex-col group overflow-hidden ${
                            card.category === 'impact' ? 'action-card-impact' : 'action-card-mitigation'
                          }`}
                        >
                          {/* Top Tag */}
                          <div className={`w-full px-4 py-2 text-xs font-mono uppercase tracking-widest text-white flex justify-between items-center ${
                            card.category === 'impact' ? 'tag-impact' : 'tag-mitigation'
                          }`}>
                            <span>{card.category === 'impact' ? 'Impacto Ambiental' : 'Mitigação de Impacto'}</span>
                            {card.category === 'impact' ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                          </div>

                          <div className="h-48 w-full overflow-hidden relative bg-surface-alt flex items-center justify-center">
                            <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #1C1917 0, #1C1917 1px, transparent 0, transparent 50%)', backgroundSize: '10px 10px' }}></div>
                            <img
                              src={card.image}
                              alt={card.title}
                              loading="lazy"
                              decoding="async"
                              className={`w-full h-[140%] object-contain drop-shadow-xl transition-all duration-500
                                ${card.category === 'impact' ? 'group-hover:scale-110 group-hover:rotate-2' : 'group-hover:scale-110 group-hover:-rotate-2'}
                              `}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          </div>
                          
                          <div className="p-5 flex-grow bg-surface z-10 relative">
                            <h5 className="text-xl font-bold font-serif italic mb-3 leading-tight tracking-tight">{card.title}</h5>
                            <div className={`w-10 h-1 rounded-full mb-4 ${card.category === 'impact' ? 'bg-danger' : 'bg-success'}`}></div>
                            <p className="text-sm text-ink-secondary leading-relaxed">{card.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* --- Home Footer --- */}
              <footer className="border-t border-border pt-12 pb-16 grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
                <div className="col-span-1 md:col-span-2 space-y-4">
                  <h4 className="text-xl font-bold font-serif italic tracking-tight">Clube de Ciências</h4>
                  <p className="text-sm text-ink-secondary max-w-sm leading-relaxed">
                    Um projeto dedicado à popularização da ciência e educação ambiental através de metodologias lúdicas e interativas.
                  </p>
                </div>
                <div className="space-y-4">
                  <h5 className="label">Recursos</h5>
                  <ul className="space-y-2 text-sm text-ink-secondary">
                    <li><button onClick={() => setShowRules(true)} className="hover:text-ink transition-colors">Manual do Jogador</button></li>
                    <li><a href="#gallery" className="hover:text-ink transition-colors">Guia de Identificação</a></li>
                    <li><a href="#about" className="hover:text-ink transition-colors">Material Didático</a></li>
                  </ul>
                </div>
                <div className="space-y-4">
                  <h5 className="label">Contato</h5>
                  <ul className="space-y-2 text-sm text-ink-secondary">
                    <li><a href="mailto:clubedeciencias@gmail.com" className="hover:text-ink transition-colors">clubedecienciasbona@gmail.com</a></li>
                    <li className="pt-2">
                      <a 
                        href="https://instagram.com/clubebona" 
                        target="_blank" 
                        rel="noreferrer"
                        className="btn btn-primary gap-2 h-10 px-4 text-xs"
                        id="btn-instagram"
                      >
                        <Instagram size={14} />
                        <span>Instagram</span>
                      </a>
                    </li>
                  </ul>
                </div>
              </footer>
            </motion.div>
          )}

          {/* ==================== SETUP PAGE ==================== */}
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

          {/* ==================== PLAYING / ACTION PHASE ==================== */}
          {(phase === 'playing' || phase === 'action') && (
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
                          onClick={drawAction}
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
                          <h3 className="text-3xl md:text-4xl font-bold mb-3 italic font-serif tracking-tight leading-tight">{lastAction.title}</h3>
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
                              onClick={nextTurn}
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
          )}

          {/* ==================== GAME OVER ==================== */}
          {phase === 'gameOver' && (
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
                          <div className="text-xs text-ink-muted uppercase tracking-widest">{p.hand.length} famílias identificadas</div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-center md:items-end gap-1.5 w-full md:w-auto">
                        <div className="text-2xl md:text-3xl font-bold font-mono">{p.score} <span className="text-xs uppercase text-ink-muted">pts</span></div>
                        <div 
                          className="px-3 py-1 text-xs font-bold uppercase tracking-widest text-white rounded-md"
                          style={{ backgroundColor: quality.color }}
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
                  onClick={() => setShowRules(true)}
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
                  onClick={() => setPhase('leaderboard')}
                  className="btn btn-secondary btn-lg"
                  id="btn-view-ranking"
                >
                  <Trophy size={18} /> Ver Ranking
                </button>
                <button
                  onClick={() => setPhase('setup')}
                  className="btn btn-primary btn-lg"
                  id="btn-new-game"
                >
                  Nova Expedição
                </button>
                <button
                  onClick={() => setPhase('home')}
                  className="btn btn-secondary btn-lg"
                  id="btn-go-home"
                >
                  Voltar ao Início
                </button>
              </div>
            </motion.div>
          )}

          {/* ==================== LEADERBOARD ==================== */}
          {phase === 'leaderboard' && (
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
                    onClick={() => setPhase('home')}
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
                    onClick={() => setPhase('setup')}
                    className="btn btn-primary"
                    id="btn-start-from-empty-leaderboard"
                  >
                    <Play size={16} fill="currentColor" /> Começar Expedição
                  </button>
                </div>
              ) : (() => {
                // Find the user's best position in the ranking
                const userEntries = leaderboardData
                  .map((e, i) => ({ entry: e, idx: i }))
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
                  onClick={() => setPhase('setup')}
                  className="btn btn-primary btn-lg"
                  id="btn-play-from-leaderboard"
                >
                  <Play size={18} fill="currentColor" /> Jogar Agora
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ==================== RULES MODAL ==================== */}
      <AnimatePresence>
        {showRules && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6"
            onClick={() => setShowRules(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Regras do Jogo"
          >
            <motion.div
              ref={rulesModalRef}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-surface max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 rounded-xl shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-8 border-b border-border pb-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold italic font-serif tracking-tight">Regras do Jogo</h2>
                  <p className="text-xs font-mono uppercase tracking-widest text-ink-muted mt-1">Clube de Ciências de bona — Bioindicadores</p>
                </div>
                <button
                  ref={rulesCloseButtonRef}
                  onClick={() => setShowRules(false)}
                  className="p-2 hover:bg-surface-alt rounded-lg transition-colors"
                  aria-label="Fechar regras"
                  id="btn-close-rules"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8 text-sm leading-relaxed">
                <section>
                  <h3 className="label font-bold mb-3">Objetivo</h3>
                  <p>Acumular as cartas de <strong>maior pontuação</strong> possível. Ao final da partida, o jogador com mais pontos na mesa vence. Cartas maiores valem mais — quanto mais raro o organismo indicador, maior o valor!</p>
                </section>

                <section>
                  <h3 className="label font-bold mb-3">Preparação</h3>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>Embaralhe bem todas as cartas de organismos e as cartas de ação juntas.</li>
                    <li>Distribua <strong>7 cartas aleatórias</strong> para cada jogador.</li>
                    <li>O restante das cartas forma o <strong>monte</strong>.</li>
                  </ol>
                </section>

                <section>
                  <h3 className="label font-bold mb-3">Duração</h3>
                  <p>A partida tem duração fixa de <strong>5 rodadas</strong>. Uma rodada termina quando todos os jogadores completarem seus turnos.</p>
                </section>

                <section>
                  <h3 className="label font-bold mb-3">Rodada</h3>
                  <p>Cada jogador obrigatoriamente deve puxar uma carta de ação quando for sua vez. Aplique o efeito imediatamente e passe a vez.</p>
                </section>

                <section>
                  <h3 className="label font-bold mb-3">Qualidade da Água (BMWP)</h3>
                  <div className="card overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-border bg-surface-alt">
                          <th className="px-3 py-2 font-bold uppercase">Classe</th>
                          <th className="px-3 py-2 font-bold uppercase">BMWP</th>
                          <th className="px-3 py-2 font-bold uppercase">Categoria</th>
                          <th className="px-3 py-2 font-bold uppercase">Diagnóstico</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {WATER_QUALITY_DATA.map((q, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-mono">{q.class}</td>
                            <td className="px-3 py-2 font-bold">{q.range}</td>
                            <td className="px-3 py-2">
                              <span 
                                className="px-1.5 py-0.5 rounded-md text-white font-bold"
                                style={{ backgroundColor: q.color }}
                              >
                                {q.category}
                              </span>
                            </td>
                            <td className="px-3 py-2 italic font-serif leading-tight">{q.diagnosis}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-ink-muted italic">
                    * O índice BMWP (Biological Monitoring Working Party) avalia a qualidade da água com base na sensibilidade dos macroinvertebrados encontrados.
                  </p>
                </section>

                <section>
                  <h3 className="label font-bold mb-3">Valores das Cartas</h3>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    {[
                      { value: '10', color: '#3b82f6', label: 'Máximo' },
                      { value: '8', color: '#60a5fa', label: 'Alto' },
                      { value: '7', color: '#22c55e', label: 'Médio-Alto' },
                      { value: '6', color: '#86efac', label: 'Médio' },
                      { value: '5', color: '#fde047', label: 'Médio' },
                      { value: '4', color: '#fb923c', label: 'Médio-Baixo' },
                      { value: '3', color: '#f97316', label: 'Baixo' },
                      { value: '2', color: '#ea580c', label: 'Baixo' },
                      { value: '1', color: '#dc2626', label: 'Mínimo' },
                    ].map(({ value, color, label }) => (
                      <div key={value} className="card p-2 flex flex-col items-center gap-1.5">
                        <span
                          className="score-badge w-9 h-9 text-sm"
                          style={{ backgroundColor: color, color: shouldUseDarkText(color) ? '#1C1917' : '#ffffff' }}
                        >
                          {value}
                        </span>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs italic text-ink-muted">Não existe carta com valor 9 no jogo.</p>
                </section>
              </div>

              <button 
                onClick={() => setShowRules(false)}
                className="btn btn-primary btn-lg w-full mt-10"
                id="btn-understood"
              >
                Entendi, vamos jogar!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
