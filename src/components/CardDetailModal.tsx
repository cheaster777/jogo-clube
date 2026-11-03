import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import type { FamilyCard } from '../constants';
import { shouldUseDarkText } from '../lib/cardDisplay';

interface CardDetailModalProps {
  card: Omit<FamilyCard, 'id'> | null;
  onClose: () => void;
}

/**
 * Scientific detail of a family card, shared by the catalog and the match.
 * Follows the focus contract of RulesModal: it focuses the close button,
 * closes on Esc, traps Tab, and returns focus to the element that opened it.
 */
export default function CardDetailModal({ card, onClose }: CardDetailModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const isOpen = card !== null;

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    triggerRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled])');
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
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {card && (
        <div
          className="fixed inset-0 z-[100] flex overflow-y-auto overscroll-contain p-4 bg-ink/75 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-detail-title"
        >
          <motion.div
            ref={panelRef}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={event => event.stopPropagation()}
            className="m-auto bg-surface rounded-2xl max-w-sm w-full shadow-2xl border border-border overflow-hidden relative flex flex-col"
          >
            <div className="p-4 flex justify-between items-start border-b border-border bg-surface relative z-10">
              <div className="min-w-0 flex-1 mr-3">
                <h3 id="card-detail-title" className="text-xl font-bold font-serif italic leading-tight">{card.name}</h3>
                <div className="text-xs text-ink-muted font-mono mt-0.5">{card.group}</div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="score-badge text-sm w-9 h-9"
                  style={{
                    backgroundColor: card.color,
                    color: shouldUseDarkText(card.color) ? '#1C1917' : '#ffffff',
                  }}
                >
                  {card.score}
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-surface-alt text-ink-muted hover:text-ink transition-colors"
                  aria-label="Fechar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div
              className="h-44 sm:h-60 w-full relative border-b border-border overflow-hidden flex items-center justify-center p-4"
              style={{ background: `radial-gradient(circle at 50% 50%, ${card.color}30 0%, #FAFAF9 80%)` }}
            >
              <img
                src={card.image}
                alt={card.name}
                className="w-full h-full max-h-full object-contain scale-125 drop-shadow-xl z-10"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="p-5 space-y-4 bg-surface">
              <div>
                <div className="label mb-1">Descrição Científica</div>
                <p className="text-sm text-ink-secondary leading-relaxed font-serif italic">{card.description}</p>
              </div>

              <div className="pt-3 border-t border-border flex justify-between items-center text-xs font-mono">
                <span className="text-ink-muted">Sensibilidade à Poluição</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{card.score} / 10 pts</span>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: card.color }} />
                </div>
              </div>

              <button type="button" onClick={onClose} className="btn btn-primary w-full mt-2">
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
