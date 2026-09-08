import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Medal,
  Leaf,
  Zap,
  BookOpen,
  Instagram,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  X,
  Volume2,
} from 'lucide-react';
import { FAMILY_CARDS_DATA, ACTION_CARDS_DATA, type FamilyCard } from '../constants';
import { shouldUseDarkText } from '../lib/cardDisplay';
import { playActionCardSound } from '../lib/audio';

// Number of family cards shown before the user opts into the full catalog.
// Keeps the initial scroll length reasonable; the rest expand on demand.
const FAMILY_CARDS_PREVIEW_COUNT = 10;

interface HomePageProps {
  /** Start a new expedition (go to the setup screen). */
  onStart: () => void;
  /** Open the "how to play" / rules modal. */
  onShowRules: () => void;
  /** Navigate to the public leaderboard/ranking screen. */
  onGoToLeaderboard: () => void;
}

export default function HomePage({ onStart, onShowRules, onGoToLeaderboard }: HomePageProps) {
  const [showAllFamilyCards, setShowAllFamilyCards] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Omit<FamilyCard, 'id'> | null>(null);

  const visibleFamilyCards = showAllFamilyCards
    ? FAMILY_CARDS_DATA
    : FAMILY_CARDS_DATA.slice(0, FAMILY_CARDS_PREVIEW_COUNT);

  return (
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
              onClick={onStart}
              className="btn btn-primary btn-lg gap-3 shadow-md hover:shadow-lg"
              id="btn-start"
            >
              Começar Expedição <Play size={18} fill="currentColor" />
            </button>
            <button
              onClick={onShowRules}
              className="btn btn-secondary btn-lg"
              id="btn-how-to-play"
            >
              Como Jogar
            </button>
            <button
              onClick={onGoToLeaderboard}
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
              alt="Paisagem de um riacho cercado por vegetação"
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
              {visibleFamilyCards.map((card, idx) => (
                <div
                  key={`gallery-f-${idx}`}
                  onClick={() => setSelectedCard(card)}
                  className="family-card flex flex-col group cursor-pointer relative min-h-[320px] sm:min-h-[350px] md:min-h-[370px]"
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
                  <div className="p-2.5 sm:p-3 flex justify-between items-start border-b border-border bg-surface relative z-10 rounded-t-lg">
                    <div className="min-w-0 flex-1 mr-2">
                      <div className="text-sm font-bold font-serif italic leading-tight truncate">{card.name}</div>
                      <div className="text-[11px] sm:text-xs text-ink-muted font-mono mt-0.5 truncate">{card.group.split(' - ')[1] || card.group}</div>
                    </div>
                    <div
                      className="score-badge"
                      style={{ backgroundColor: card.color, color: shouldUseDarkText(card.color) ? '#1C1917' : '#ffffff' }}
                    >
                      {card.score}
                    </div>
                  </div>
                  <div
                    className="h-36 sm:h-44 md:flex-grow w-full relative border-b border-border overflow-hidden flex items-center justify-center p-3"
                    style={{
                      background: `radial-gradient(circle at 50% 50%, ${card.color}25 0%, #FAFAF9 75%)`
                    }}
                  >
                    <img
                      src={card.image}
                      alt={card.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full max-h-full object-contain scale-125 sm:scale-115 drop-shadow-md group-hover:drop-shadow-xl group-hover:scale-140 sm:group-hover:scale-125 transition-all duration-500 ease-out z-10"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[90px] sm:text-[110px] font-serif italic font-bold opacity-[0.04] pointer-events-none select-none z-0" style={{ color: card.color }}>
                      {card.score}
                    </div>
                  </div>
                  <div className="p-2.5 sm:p-3 flex flex-col justify-between flex-grow bg-surface rounded-b-lg">
                    <div>
                      <div className="text-[11px] sm:text-xs text-ink-muted font-mono mb-1 truncate">{card.group}</div>
                      <div className="text-[9px] uppercase tracking-wider font-mono text-ink-muted mb-0.5 sm:hidden">Descrição Científica</div>
                      <div className="text-xs leading-snug text-ink-secondary line-clamp-2 sm:line-clamp-3">{card.description}</div>
                    </div>
                    <div className="mt-2 pt-1.5 sm:pt-2 border-t border-border flex justify-between items-center text-[11px] sm:text-xs">
                      <span className="font-mono text-ink-muted">Bioindicador</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-accent font-medium sm:hidden">Ver detalhes</span>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: card.color }} />
                      </div>
                    </div>
                  </div>
                  {/* Hover overlay with glassmorphism for desktop */}
                  <div className="hidden md:flex absolute inset-0 bg-ink/85 backdrop-blur-sm text-white p-4 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 flex-col justify-center text-center pointer-events-none z-20">
                    <div className="text-xs uppercase tracking-widest mb-2 text-white/60 font-mono">Descrição Científica</div>
                    <div className="text-sm leading-relaxed italic font-serif">{card.description}</div>
                  </div>
                </div>
              ))}
            </div>
            {FAMILY_CARDS_DATA.length > FAMILY_CARDS_PREVIEW_COUNT && (
              <div className="flex justify-center">
                <button
                  onClick={() => setShowAllFamilyCards(prev => !prev)}
                  className="btn btn-secondary gap-2"
                  id="btn-toggle-family-catalog"
                >
                  {showAllFamilyCards ? (
                    <>
                      Mostrar menos <ChevronUp size={16} />
                    </>
                  ) : (
                    <>
                      Ver catálogo completo ({FAMILY_CARDS_DATA.length}) <ChevronDown size={16} />
                    </>
                  )}
                </button>
              </div>
            )}
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
                  className={`action-card flex flex-col group overflow-hidden ${card.category === 'impact' ? 'action-card-impact' : 'action-card-mitigation'
                    }`}
                >
                  {/* Top Tag */}
                  <div className={`w-full px-4 py-2 text-xs font-mono uppercase tracking-widest text-white flex justify-between items-center ${card.category === 'impact' ? 'tag-impact' : 'tag-mitigation'
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
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h5 className="text-xl font-bold font-serif italic leading-tight tracking-tight">{card.title}</h5>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playActionCardSound(card.title);
                        }}
                        className="p-1.5 rounded-full border border-border hover:border-accent hover:text-accent text-ink-muted transition-colors shrink-0"
                        title={`Ouvir efeito sonoro de ${card.title}`}
                        aria-label={`Ouvir efeito sonoro de ${card.title}`}
                      >
                        <Volume2 size={16} />
                      </button>
                    </div>
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
            <li><button onClick={onShowRules} className="hover:text-ink transition-colors">Manual do Jogador</button></li>
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

      {/* --- Card Detail Modal for Mobile / Inspection --- */}
      <AnimatePresence>
        {selectedCard && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/75 backdrop-blur-sm"
            onClick={() => setSelectedCard(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface rounded-2xl max-w-sm w-full shadow-2xl border border-border overflow-hidden relative flex flex-col"
            >
              <div className="p-4 flex justify-between items-start border-b border-border bg-surface relative z-10">
                <div className="min-w-0 flex-1 mr-3">
                  <h3 className="text-xl font-bold font-serif italic leading-tight">{selectedCard.name}</h3>
                  <div className="text-xs text-ink-muted font-mono mt-0.5">{selectedCard.group}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="score-badge text-sm w-9 h-9"
                    style={{
                      backgroundColor: selectedCard.color,
                      color: shouldUseDarkText(selectedCard.color) ? '#1C1917' : '#ffffff',
                    }}
                  >
                    {selectedCard.score}
                  </div>
                  <button
                    onClick={() => setSelectedCard(null)}
                    className="p-1.5 rounded-full hover:bg-surface-alt text-ink-muted hover:text-ink transition-colors"
                    aria-label="Fechar"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div
                className="h-56 sm:h-64 w-full relative border-b border-border overflow-hidden flex items-center justify-center p-4"
                style={{
                  background: `radial-gradient(circle at 50% 50%, ${selectedCard.color}30 0%, #FAFAF9 80%)`,
                }}
              >
                <img
                  src={selectedCard.image}
                  alt={selectedCard.name}
                  className="w-full h-full max-h-full object-contain scale-125 drop-shadow-xl z-10"
                  referrerPolicy="no-referrer"
                />
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[140px] font-serif italic font-bold opacity-[0.05] pointer-events-none select-none z-0"
                  style={{ color: selectedCard.color }}
                >
                  {selectedCard.score}
                </div>
              </div>

              <div className="p-5 space-y-4 bg-surface">
                <div>
                  <div className="text-xs uppercase tracking-widest font-mono text-ink-muted mb-1">
                    Descrição Científica
                  </div>
                  <p className="text-sm text-ink-secondary leading-relaxed font-serif italic">
                    {selectedCard.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-border flex justify-between items-center text-xs font-mono">
                  <span className="text-ink-muted">Sensibilidade à Poluição</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{selectedCard.score} / 10 pts</span>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedCard.color }} />
                  </div>
                </div>

                <button
                  onClick={() => setSelectedCard(null)}
                  className="btn btn-primary w-full mt-2"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
