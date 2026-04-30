import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  LogOut
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

// Helper to get water quality
const getWaterQuality = (score: number) => {
  return WATER_QUALITY_DATA.find(q => score >= q.minScore && score <= q.maxScore) || WATER_QUALITY_DATA[WATER_QUALITY_DATA.length - 1];
};

// Helper: determine if badge text should be dark based on background color brightness
const shouldUseDarkText = (hexColor: string): boolean => {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
};

// Helper to shuffle array
const shuffle = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

type GamePhase = 'home' | 'setup' | 'playing' | 'action' | 'gameOver';

interface Player {
  id: number;
  name: string;
  hand: FamilyCard[];
  score: number;
  isBot: boolean;
}

export default function App() {
  const { user, profile, loading, signOut, saveGameScore } = useAuth();

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
  const [scoreSaved, setScoreSaved] = useState(false);

  const [showRules, setShowRules] = useState(false);

  // Auto-fill player 1 name from Supabase profile
  useEffect(() => {
    if (profile?.full_name) {
      setPlayerNames(prev => {
        const newNames = [...prev];
        newNames[0] = profile.full_name;
        return newNames;
      });
    }
  }, [profile]);

  // Save score when game ends
  useEffect(() => {
    if (phase === 'gameOver' && user && !scoreSaved) {
      const currentPlayer = players.find(p => !p.isBot);
      if (currentPlayer) {
        const quality = getWaterQuality(currentPlayer.score);
        saveGameScore(
          currentPlayer.score,
          quality.category,
          quality.diagnosis,
          currentPlayer.hand.length
        );
        setScoreSaved(true);
      }
    }
  }, [phase, user, scoreSaved, players, saveGameScore]);

  // Update player names and bot flags when number of players changes
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

  if (!user) {
    return <AuthScreen />;
  }

  // Initialize Game
  const initGame = () => {
    // Create Family Deck (multiple copies of each for better gameplay)
    const families: FamilyCard[] = [];
    FAMILY_CARDS_DATA.forEach((f, i) => {
      // Add 2 copies of each family
      for (let k = 0; k < 2; k++) {
        families.push({ ...f, id: `f-${i}-${k}` } as FamilyCard);
      }
    });

    // Create Action Deck
    const actions: ActionCard[] = [];
    ACTION_CARDS_DATA.forEach((a, i) => {
      // Add 4 copies of each action
      for (let k = 0; k < 4; k++) {
        actions.push({ ...a, id: `a-${i}-${k}` } as ActionCard);
      }
    });

    const shuffledFamilies = shuffle(families);
    const shuffledActions = shuffle(actions);

    // Create Players
    const newPlayers: Player[] = Array.from({ length: numPlayers }, (_, i) => ({
      id: i,
      name: botFlags[i] ? `${playerNames[i]} (BOT)` : playerNames[i],
      hand: [],
      score: 0,
      isBot: botFlags[i],
    }));

    // Deal 7 cards to each
    newPlayers.forEach(p => {
      p.hand = shuffledFamilies.splice(0, 7);
      p.score = p.hand.reduce((sum, c) => sum + c.score, 0);
    });

    setPlayers(newPlayers);
    setFamilyDeck(shuffledFamilies);
    setActionDeck(shuffledActions);
    setCurrentPlayerIndex(0);
    setCurrentRound(1);
    setPhase('playing');
    setLastAction(null);
    setActionMessage('');
  };

  const calculateScores = (updatedPlayers: Player[]) => {
    return updatedPlayers.map(p => ({
      ...p,
      score: p.hand.reduce((sum, c) => sum + c.score, 0)
    }));
  };

  const handleActionEffect = (action: ActionCard) => {
    let updatedPlayers = [...players];
    let updatedFamilyDeck = [...familyDeck];
    let message = '';

    const currentPlayer = updatedPlayers[currentPlayerIndex];

    switch (action.title) {
      case 'Despejo de esgoto':
        // Lose 2 families with score 10 or 8
        const highScores = currentPlayer.hand
          .filter((c: FamilyCard) => c.score === 10 || c.score === 8)
          .sort((a, b) => b.score - a.score);
        
        const toRemove = highScores.slice(0, 2);
        if (toRemove.length > 0) {
          currentPlayer.hand = currentPlayer.hand.filter((c: FamilyCard) => !toRemove.find(r => r.id === c.id));
          message = `Você perdeu: ${toRemove.map(c => c.name).join(', ')}`;
        } else {
          message = 'Você não tinha famílias de pontuação 10 ou 8 para perder.';
        }
        break;

      case 'Drift — arrasto':
        // Colleague anterior eliminates 5 cards from your hand
        const removedDrift = shuffle(currentPlayer.hand).slice(0, 5);
        currentPlayer.hand = currentPlayer.hand.filter((c: FamilyCard) => !removedDrift.find((r: FamilyCard) => r.id === c.id));
        message = `O seu colega anterior removeu 5 cartas aleatórias do seu monte.`;
        break;

      case 'Peixe exótico':
        // Next colleague eliminates 5 cards
        const removedExotic = shuffle(currentPlayer.hand).slice(0, 5);
        currentPlayer.hand = currentPlayer.hand.filter((c: FamilyCard) => !removedExotic.find((r: FamilyCard) => r.id === c.id));
        message = `O seu próximo colega removeu 5 cartas aleatórias da sua mão.`;
        break;

      case 'Replantio de mata ciliar':
        // Take 1 highest score card from each opponent
        updatedPlayers.forEach((p, idx) => {
          if (idx !== currentPlayerIndex && p.hand.length > 0) {
            const sortedHand = [...p.hand].sort((a, b) => b.score - a.score);
            const bestCard = sortedHand[0];
            p.hand = p.hand.filter(c => c.id !== bestCard.id);
            currentPlayer.hand.push(bestCard);
          }
        });
        message = 'A biodiversidade melhorou! Você pegou a melhor carta de cada oponente.';
        break;

      case 'Regularização de esgotos':
        // Draw 3
        const drawn3 = updatedFamilyDeck.splice(0, 3);
        currentPlayer.hand.push(...drawn3);
        message = `Redes regularizadas! Você pescou ${drawn3.length} cartas do monte.`;
        break;

      case 'Educação Ambiental':
        // Draw 5
        const drawn5 = updatedFamilyDeck.splice(0, 5);
        currentPlayer.hand.push(...drawn5);
        message = `Conscientização realizada! Você pescou ${drawn5.length} cartas do monte.`;
        break;
    }

    setPlayers(calculateScores(updatedPlayers));
    setFamilyDeck(updatedFamilyDeck);
    setActionMessage(message);
    setPhase('action');
  };

  const drawAction = useCallback(() => {
    if (actionDeck.length === 0) {
      setPhase('gameOver');
      return;
    }

    const newActionDeck = [...actionDeck];
    const drawnAction = newActionDeck.shift()!;
    setActionDeck(newActionDeck);
    setLastAction(drawnAction);
    handleActionEffect(drawnAction);
  }, [actionDeck, players, currentPlayerIndex, familyDeck]);

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
  }, [phase, currentPlayerIndex, players]);

  const nextTurn = useCallback(() => {
    if (familyDeck.length === 0 || actionDeck.length === 0) {
      setPhase('gameOver');
      return;
    }

    if (currentPlayerIndex === players.length - 1) {
      if (currentRound >= MAX_ROUNDS) {
        setPhase('gameOver');
        return;
      }
      setCurrentRound(prev => prev + 1);
      setCurrentPlayerIndex(0);
    } else {
      setCurrentPlayerIndex((prev) => prev + 1);
    }
    
    setPhase('playing');
    setLastAction(null);
    setActionMessage('');
  }, [familyDeck.length, actionDeck.length, currentPlayerIndex, players.length, currentRound]);

  return (
    <div className="min-h-screen bg-bg text-ink font-sans selection:bg-accent selection:text-white">
      {/* ==================== HEADER ==================== */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-md p-4 md:p-6 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setPhase('home')}>
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
              onClick={() => setPhase('setup')}
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
              <div className="text-xs text-ink-muted font-mono truncate max-w-[120px]">{user.email}</div>
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
                    <li><a href="mailto:lucasczarnesky267@gmail.com" className="hover:text-ink transition-colors">lucasczarnesky267@gmail.com</a></li>
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
            <motion.div 
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto mt-12 md:mt-20"
            >
              <div className="card p-6 md:p-8 shadow-lg" id="setup-panel">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-accent-light rounded-lg flex items-center justify-center">
                    <Users size={20} className="text-accent" />
                  </div>
                  <h2 className="text-xl font-bold italic font-serif">Configuração do Jogo</h2>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <label className="label block mb-3">Número de Jogadores</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[2, 3, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => setNumPlayers(n)}
                          className={`py-3 rounded-lg font-mono font-semibold transition-all border ${
                            numPlayers === n 
                              ? 'bg-ink text-white border-ink shadow-sm' 
                              : 'border-border-strong hover:bg-surface-alt text-ink-secondary'
                          }`}
                          id={`btn-players-${n}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label block mb-3">Configurar Jogadores</label>
                    <div className="space-y-3 mb-6">
                      {playerNames.map((name, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center text-xs font-mono font-bold shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-grow flex gap-2">
                            <input
                              type="text"
                              value={name}
                              onChange={(e) => {
                                const newNames = [...playerNames];
                                newNames[i] = e.target.value;
                                setPlayerNames(newNames);
                              }}
                              className="input-field flex-grow font-serif italic"
                              placeholder={`Nome do Jogador ${i + 1}`}
                              id={`input-player-${i}`}
                            />
                            <button
                              onClick={() => {
                                const newFlags = [...botFlags];
                                newFlags[i] = !newFlags[i];
                                setBotFlags(newFlags);
                              }}
                              className={`px-3 rounded-lg text-xs font-mono font-semibold uppercase tracking-tight transition-all border ${
                                botFlags[i] 
                                  ? 'bg-accent text-white border-accent' 
                                  : 'bg-surface text-ink-muted border-border-strong'
                              }`}
                              id={`btn-bot-${i}`}
                            >
                              {botFlags[i] ? 'BOT' : 'Humano'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-accent-light/50 border border-accent/20 rounded-lg text-sm leading-relaxed">
                    <div className="flex gap-2 mb-2 font-bold text-accent uppercase tracking-tight text-xs">
                      <Info size={14} /> Regras Rápidas
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-ink-secondary text-sm">
                      <li>Cada jogador começa com 7 cartas de família.</li>
                      <li>A partida dura exatamente <strong>5 rodadas</strong>.</li>
                      <li>Na sua vez, você DEVE puxar uma carta de ação.</li>
                      <li>O vencedor é quem tiver mais pontos após as 5 rodadas.</li>
                    </ul>
                  </div>

                  <button
                    onClick={initGame}
                    className="btn btn-primary btn-lg w-full gap-2"
                    id="btn-init-game"
                  >
                    <Play size={18} fill="currentColor" /> Iniciar Expedição
                  </button>
                </div>
              </div>
            </motion.div>
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
                      <button
                        onClick={drawAction}
                        className="btn btn-accent btn-lg shadow-md hover:shadow-lg gap-3"
                        id="btn-draw-action"
                      >
                        Puxar Carta de Ação
                      </button>
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
                          </div>

                          <button
                            onClick={nextTurn}
                            className="btn btn-primary btn-lg w-full gap-2"
                            id="btn-next-turn"
                          >
                            Próximo Turno <ChevronRight size={18} />
                          </button>
                        </div>
                      </div>
                    )}
                    </motion.div>
                  )}
                </div>

                {/* Current Player's Hand */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div className="label">Sua Coleção de Bioindicadores</div>
                    <div className="text-sm font-mono">Total: <span className="font-bold">{players[currentPlayerIndex].score} pontos</span></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
                    {players[currentPlayerIndex].hand.map((card) => (
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
                    {players[currentPlayerIndex].hand.length === 0 && (
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

              {/* Water Quality Table */}
              <div className="mb-10 card overflow-hidden shadow-sm">
                <div className="bg-ink text-white px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-center rounded-t-lg">
                  Tabela de Referência: Qualidade da Água (BMWP)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-border bg-surface-alt">
                        <th className="px-4 py-2.5 font-bold uppercase text-ink-secondary">Classe</th>
                        <th className="px-4 py-2.5 font-bold uppercase text-ink-secondary">BMWP</th>
                        <th className="px-4 py-2.5 font-bold uppercase text-ink-secondary">Categoria</th>
                        <th className="px-4 py-2.5 font-bold uppercase text-ink-secondary">Diagnóstico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {WATER_QUALITY_DATA.map((q, i) => (
                        <tr key={i} className="hover:bg-surface-alt transition-colors">
                          <td className="px-4 py-3 font-mono">{q.class}</td>
                          <td className="px-4 py-3 font-bold">{q.range}</td>
                          <td className="px-4 py-3">
                            <span 
                              className="px-2 py-0.5 rounded-md text-white font-bold text-xs"
                              style={{ backgroundColor: q.color }}
                            >
                              {q.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 italic font-serif">{q.diagnosis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {scoreSaved && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-success-light border border-success/20 rounded-lg text-success text-sm font-semibold mb-6"
                >
                  ✓ Resultado salvo no seu perfil
                </motion.div>
              )}

              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  onClick={() => { setScoreSaved(false); setPhase('setup'); }}
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
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-surface max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 rounded-xl shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-8 border-b border-border pb-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold italic font-serif tracking-tight">Regras do Jogo</h2>
                  <p className="text-xs font-mono uppercase tracking-widest text-ink-muted mt-1">Clube de Ciências — Bioindicadores</p>
                </div>
                <button 
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
                    <div className="card p-2 flex flex-col items-center">
                      <span className="text-xl font-bold" style={{ color: '#3b82f6' }}>10</span>
                      <span>Máximo</span>
                    </div>
                    <div className="card p-2 flex flex-col items-center">
                      <span className="text-xl font-bold" style={{ color: '#60a5fa' }}>8</span>
                      <span>Alto</span>
                    </div>
                    <div className="card p-2 flex flex-col items-center">
                      <span className="text-xl font-bold" style={{ color: '#22c55e' }}>7</span>
                      <span>Médio-Alto</span>
                    </div>
                    <div className="card p-2 flex flex-col items-center">
                      <span className="text-xl font-bold" style={{ color: '#86efac' }}>6</span>
                      <span>Médio</span>
                    </div>
                    <div className="card p-2 flex flex-col items-center">
                      <span className="text-xl font-bold" style={{ color: '#fde047' }}>5</span>
                      <span>Médio</span>
                    </div>
                    <div className="card p-2 flex flex-col items-center">
                      <span className="text-xl font-bold" style={{ color: '#fb923c' }}>4</span>
                      <span>Médio-Baixo</span>
                    </div>
                    <div className="card p-2 flex flex-col items-center">
                      <span className="text-xl font-bold" style={{ color: '#f97316' }}>3</span>
                      <span>Baixo</span>
                    </div>
                    <div className="card p-2 flex flex-col items-center">
                      <span className="text-xl font-bold" style={{ color: '#ea580c' }}>2</span>
                      <span>Baixo</span>
                    </div>
                    <div className="card p-2 flex flex-col items-center">
                      <span className="text-xl font-bold" style={{ color: '#dc2626' }}>1</span>
                      <span>Mínimo</span>
                    </div>
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
          <p className="text-xs uppercase tracking-widest text-ink-muted font-mono">Desenvolvido para o projeto de clube bona</p>
        </div>
      </footer>
    </div>
  );
}
