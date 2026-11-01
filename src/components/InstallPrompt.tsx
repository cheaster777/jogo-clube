import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Share, SquarePlus } from 'lucide-react';
import {
  dismissInstall,
  dismissUpdate,
  getPwaSnapshot,
  installUpdate,
  promptInstall,
  subscribePwa,
} from '../lib/pwa';

const PRIMARY_BUTTON =
  'min-h-11 rounded-lg bg-accent px-4 font-semibold text-white transition-colors hover:bg-accent-hover';
const SECONDARY_BUTTON =
  'min-h-11 rounded-lg px-4 font-semibold text-ink-secondary transition-colors hover:bg-surface-alt';

interface InstallPromptProps {
  // True during a match: the banner would cover the player's hand.
  paused: boolean;
}

export default function InstallPrompt({ paused }: InstallPromptProps) {
  const { installMode, updateReady } = useSyncExternalStore(subscribePwa, getPwaSnapshot);
  const banner = paused ? null : updateReady ? 'update' : installMode;

  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          key={banner}
          role="dialog"
          aria-labelledby="pwa-banner-title"
          data-testid="pwa-banner"
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[110] mx-auto max-w-md rounded-xl border border-border bg-surface p-4 shadow-xl"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
        >
          {banner === 'update' ? (
            <>
              <p id="pwa-banner-title" className="font-bold text-ink">Nova versão disponível</p>
              <p className="mt-1 text-sm text-ink-secondary">Atualize para jogar com as últimas novidades.</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className={SECONDARY_BUTTON} onClick={dismissUpdate}>Depois</button>
                <button type="button" className={PRIMARY_BUTTON} onClick={installUpdate}>Atualizar</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <img src="/assets/icons/pwa-192.png" alt="" className="h-12 w-12 shrink-0 rounded-lg border border-border" />
                <div>
                  <p id="pwa-banner-title" className="font-bold text-ink">Instalar o Clube de Ciências?</p>
                  <p className="text-sm text-ink-secondary">Abra o jogo direto da tela inicial do celular.</p>
                </div>
              </div>
              {banner === 'ios' ? (
                <>
                  <p className="mt-3 text-sm text-ink">
                    Toque em <Share aria-hidden="true" className="inline h-4 w-4 align-text-bottom text-accent" /> <strong>Compartilhar</strong> e depois em{' '}
                    <SquarePlus aria-hidden="true" className="inline h-4 w-4 align-text-bottom text-accent" /> <strong>Adicionar à Tela de Início</strong>.
                  </p>
                  <div className="mt-3 flex justify-end">
                    <button type="button" className={PRIMARY_BUTTON} onClick={dismissInstall}>Entendi</button>
                  </div>
                </>
              ) : (
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" className={SECONDARY_BUTTON} onClick={dismissInstall}>Agora não</button>
                  <button type="button" className={PRIMARY_BUTTON} onClick={promptInstall}>Instalar</button>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
