import { Info, Play, Users } from 'lucide-react';
import { motion } from 'motion/react';

export type SetupGameMode = 'local' | 'server';

interface SetupPanelProps {
  gameMode: SetupGameMode;
  apiConfigured: boolean;
  onGameModeChange: (mode: SetupGameMode) => void;
  playerCount: number;
  onPlayerCountChange: (count: number) => void;
  playerNames: string[];
  onPlayerNameChange: (index: number, name: string) => void;
  botFlags: boolean[];
  onBotToggle: (index: number) => void;
  serverError: string | null;
  serverLoading: boolean;
  joinMatchId: string;
  onJoinMatchIdChange: (value: string) => void;
  onJoin: () => void;
  onStart: () => void;
}

export default function SetupPanel({
  gameMode,
  apiConfigured,
  onGameModeChange,
  playerCount,
  onPlayerCountChange,
  playerNames,
  onPlayerNameChange,
  botFlags,
  onBotToggle,
  serverError,
  serverLoading,
  joinMatchId,
  onJoinMatchIdChange,
  onJoin,
  onStart,
}: SetupPanelProps) {
  return (
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
            <label className="label block mb-3">Modo da partida</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onGameModeChange('local')}
                className={`py-3 rounded-lg font-mono text-xs font-semibold uppercase transition-all border ${
                  gameMode === 'local' ? 'bg-ink text-white border-ink shadow-sm' : 'border-border-strong hover:bg-surface-alt text-ink-secondary'
                }`}
              >
                Local contra bots
              </button>
              <button
                type="button"
                onClick={() => onGameModeChange('server')}
                disabled={!apiConfigured}
                className={`py-3 rounded-lg font-mono text-xs font-semibold uppercase transition-all border disabled:cursor-not-allowed disabled:opacity-40 ${
                  gameMode === 'server' ? 'bg-accent text-white border-accent shadow-sm' : 'border-border-strong hover:bg-surface-alt text-ink-secondary'
                }`}
              >
                API validada
              </button>
            </div>
            {!apiConfigured && <p className="text-xs text-ink-muted mt-2">Configure VITE_API_BASE_URL para ativar partidas validadas.</p>}
          </div>

          <div>
            <label className="label block mb-3">Número de Jogadores</label>
            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map(count => (
                <button
                  key={count}
                  onClick={() => onPlayerCountChange(count)}
                  className={`py-3 rounded-lg font-mono font-semibold transition-all border ${
                    playerCount === count ? 'bg-ink text-white border-ink shadow-sm' : 'border-border-strong hover:bg-surface-alt text-ink-secondary'
                  }`}
                  id={`btn-players-${count}`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label block mb-3">Configurar Jogadores</label>
            <div className="space-y-3 mb-6">
              {playerNames.map((name, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center text-xs font-mono font-bold shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-grow flex gap-2">
                    <input
                      type="text"
                      value={name}
                      onChange={event => onPlayerNameChange(index, event.target.value)}
                      className="input-field flex-grow font-serif italic"
                      placeholder={`Nome do Jogador ${index + 1}`}
                      id={`input-player-${index}`}
                    />
                    <button
                      onClick={() => onBotToggle(index)}
                      disabled={gameMode === 'server'}
                      className={`px-3 rounded-lg text-xs font-mono font-semibold uppercase tracking-tight transition-all border ${
                        gameMode === 'server'
                          ? 'bg-surface-alt text-ink-muted border-border-strong cursor-not-allowed'
                          : botFlags[index] ? 'bg-accent text-white border-accent' : 'bg-surface text-ink-muted border-border-strong'
                      }`}
                      id={`btn-bot-${index}`}
                    >
                      {gameMode === 'server' ? 'Humano' : botFlags[index] ? 'BOT' : 'Humano'}
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

          {serverError && (
            <div className="p-3 rounded-lg bg-danger-light border border-danger/20 text-danger text-sm" role="alert">
              {serverError}
            </div>
          )}

          {gameMode === 'server' && (
            <div className="p-4 rounded-lg border border-border bg-surface-alt space-y-3">
              <label className="label block">Entrar em sala existente</label>
              <input
                value={joinMatchId}
                onChange={event => onJoinMatchIdChange(event.target.value)}
                className="input-field w-full font-mono text-xs"
                placeholder="Cole o código da sala"
                aria-label="Código da sala"
              />
              <button type="button" onClick={onJoin} disabled={serverLoading} className="btn btn-secondary w-full">
                Entrar na sala
              </button>
            </div>
          )}

          <button
            onClick={onStart}
            disabled={serverLoading}
            className="btn btn-primary btn-lg w-full gap-2"
            id="btn-init-game"
          >
            <Play size={18} fill="currentColor" /> {serverLoading ? 'Conectando...' : 'Iniciar Expedição'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
