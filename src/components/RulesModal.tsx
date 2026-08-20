import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { WATER_QUALITY_DATA } from '../constants';
import { shouldUseDarkText } from '../lib/cardDisplay';

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

const CARD_VALUE_LEGEND = [
  { value: '10', color: '#3b82f6', label: 'Máximo' },
  { value: '8', color: '#60a5fa', label: 'Alto' },
  { value: '7', color: '#22c55e', label: 'Médio-Alto' },
  { value: '6', color: '#86efac', label: 'Médio' },
  { value: '5', color: '#fde047', label: 'Médio' },
  { value: '4', color: '#fb923c', label: 'Médio-Baixo' },
  { value: '3', color: '#f97316', label: 'Baixo' },
  { value: '2', color: '#ea580c', label: 'Baixo' },
  { value: '1', color: '#dc2626', label: 'Mínimo' },
];

/**
 * Rules/help modal. Encapsulates its own focus management, entirely
 * self-contained: when it opens it remembers whichever element triggered it
 * and focuses the close button; while open, Escape closes it and Tab is
 * trapped inside the dialog; when it closes, focus is restored to the
 * triggering element.
 */
export default function RulesModal({ open, onClose }: RulesModalProps) {
  const rulesModalRef = useRef<HTMLDivElement>(null);
  const rulesCloseButtonRef = useRef<HTMLButtonElement>(null);
  const rulesTriggerElementRef = useRef<HTMLElement | null>(null);

  // Foco/teclado do modal de Regras: guarda quem abriu, foca o botão de
  // fechar ao abrir, restaura o foco ao fechar, Esc fecha, Tab fica preso.
  useEffect(() => {
    if (open) {
      rulesTriggerElementRef.current = document.activeElement as HTMLElement | null;
      rulesCloseButtonRef.current?.focus();
    } else {
      rulesTriggerElementRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6"
          onClick={onClose}
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
                onClick={onClose}
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
                  {CARD_VALUE_LEGEND.map(({ value, color, label }) => (
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
              onClick={onClose}
              className="btn btn-primary btn-lg w-full mt-10"
              id="btn-understood"
            >
              Entendi, vamos jogar!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
