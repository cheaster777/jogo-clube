import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

const CLUB_PHOTOS = [
  {
    src: '/assets/images/clube-foto-1.jpg',
    alt: 'Membros do Clube de Ciências Bona no Setor de Ciências Biológicas',
    caption: 'Visita ao Setor de Ciências Biológicas',
  },
  {
    src: '/assets/images/clube-foto-2.jpg',
    alt: 'Alunos do Clube de Ciências Bona em encontro na escola',
    caption: 'Encontro do Clube no Colégio Theodoro de Bona',
  },
];

/**
 * "Quem Somos Nós" modal, aberto pelo botão flutuante de coração. Mesmo
 * contrato de foco/teclado do RulesModal: guarda quem abriu, foca o botão de
 * fechar, Esc fecha, Tab fica preso e o foco volta ao gatilho ao fechar.
 */
export default function AboutModal({ open, onClose }: AboutModalProps) {
  const aboutModalRef = useRef<HTMLDivElement>(null);
  const aboutCloseButtonRef = useRef<HTMLButtonElement>(null);
  const aboutTriggerElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      aboutTriggerElementRef.current = document.activeElement as HTMLElement | null;
      aboutCloseButtonRef.current?.focus();
    } else {
      aboutTriggerElementRef.current?.focus();
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
      if (event.key !== 'Tab' || !aboutModalRef.current) return;

      const focusable = aboutModalRef.current.querySelectorAll<HTMLElement>(
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
          aria-label="Quem Somos Nós"
        >
          <motion.div
            ref={aboutModalRef}
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-surface max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 rounded-xl shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6 border-b border-border pb-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold italic font-serif tracking-tight">Quem Somos Nós</h2>
                <p className="text-xs font-mono uppercase tracking-widest text-ink-muted mt-1">Clube de Ciências Bona</p>
              </div>
              <button
                ref={aboutCloseButtonRef}
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] p-2 hover:bg-surface-alt rounded-lg transition-colors"
                aria-label="Fechar"
                id="btn-close-about"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm md:text-base leading-relaxed text-ink-secondary mb-8">
              O Clube de Ciências Bona foi fundado em setembro de 2024 no colégio estadual Theodoro de Bona (Almirante Tamandaré) e tem como objetivo promover a alfabetização científica e protagonismo juvenil a partir de pesquisas voltadas para a qualidade ambiental dos corpos aquáticos do parque ambiental Aníbal Khury (Almirante Tamandaré). Atualmente o Clube é formado por 13 alunos do ensino médio e os encontros do clube ocorrem às quintas-feiras.
            </p>

            <div className="space-y-4">
              {CLUB_PHOTOS.map(photo => (
                <div key={photo.src} className="rounded-xl overflow-hidden shadow-lg border border-border">
                  <img src={photo.src} alt={photo.alt} className="w-full h-auto object-cover" loading="lazy" />
                  <div className="p-3 bg-surface-alt">
                    <p className="text-xs text-ink-muted font-mono text-center">{photo.caption}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={onClose}
              className="btn btn-primary btn-lg w-full mt-8"
              id="btn-close-about-bottom"
            >
              Fechar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
