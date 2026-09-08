/**
 * Engine de Áudio Procedural para o Jogo Clube
 * Sintetiza efeitos sonoros temáticos para as cartas de ação usando a Web Audio API nativa.
 * 100% offline, zero dependências externas e sem latência de rede.
 */

let audioCtx: AudioContext | null = null;
const STORAGE_KEY_MUTED = 'jogo_clube_audio_muted';
const STORAGE_KEY_VOLUME = 'jogo_clube_audio_volume';

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignora restrições de sandbox/cookies
  }
  return null;
}

let isMutedState = getSafeLocalStorage()?.getItem(STORAGE_KEY_MUTED) === 'true';
let volumeState = Number(getSafeLocalStorage()?.getItem(STORAGE_KEY_VOLUME) ?? '0.8');
if (Number.isNaN(volumeState) || volumeState < 0 || volumeState > 1) {
  volumeState = 0.8;
}

const listeners: Set<(muted: boolean, volume: number) => void> = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener(isMutedState, volumeState));
}

export function subscribeAudioState(listener: (muted: boolean, volume: number) => void): () => void {
  listeners.add(listener);
  listener(isMutedState, volumeState);
  return () => {
    listeners.delete(listener);
  };
}

export function getAudioMuted(): boolean {
  return isMutedState;
}

export function setAudioMuted(muted: boolean): void {
  isMutedState = muted;
  getSafeLocalStorage()?.setItem(STORAGE_KEY_MUTED, String(muted));
  notifyListeners();
}

export function toggleAudioMuted(): boolean {
  setAudioMuted(!isMutedState);
  return isMutedState;
}

export function getAudioVolume(): number {
  return volumeState;
}

export function setAudioVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  volumeState = clamped;
  getSafeLocalStorage()?.setItem(STORAGE_KEY_VOLUME, String(clamped));
  notifyListeners();
}

export function ensureAudioUnlocked(): AudioContext | null {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

if (typeof window !== 'undefined') {
  const handleUserGesture = () => {
    ensureAudioUnlocked();
  };
  window.addEventListener('click', handleUserGesture, { passive: true });
  window.addEventListener('touchstart', handleUserGesture, { passive: true });
  window.addEventListener('pointerdown', handleUserGesture, { passive: true });
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const AudioContextClass =
      window.AudioContext ||
      // @ts-expect-error compatibilidade com navegadores legados WebKit
      window.webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Cria um buffer de ruído branco para modelagem de água, chuva, vento ou estalos
 */
function createNoiseBuffer(ctx: AudioContext, durationSeconds: number): AudioBuffer {
  const bufferSize = Math.floor(ctx.sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Normaliza o título da carta para uma chave padrão sem acentos/símbolos
 */
function normalizeCardKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * 1. Despejo de esgoto: Borbulhamento viscoso, líquido turvo e tom sombrio de contaminação
 */
function playSewageDischargeSound(ctx: AudioContext, masterGain: GainNode) {
  const now = ctx.currentTime;

  // Drone sombrio grave de poluição
  const droneOsc = ctx.createOscillator();
  const droneGain = ctx.createGain();
  droneOsc.type = 'sawtooth';
  droneOsc.frequency.setValueAtTime(65, now);
  droneOsc.frequency.exponentialRampToValueAtTime(45, now + 1.2);

  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.setValueAtTime(140, now);

  droneGain.gain.setValueAtTime(0.18, now);
  droneGain.gain.linearRampToValueAtTime(0.25, now + 0.3);
  droneGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

  droneOsc.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(masterGain);
  droneOsc.start(now);
  droneOsc.stop(now + 1.25);

  // Várias bolhas tóxicas viscosas estourando em tempos e tons irregulares
  const bubbleDelays = [0.05, 0.22, 0.38, 0.55, 0.72, 0.9];
  const bubblePitches = [320, 240, 380, 280, 340, 210];

  bubbleDelays.forEach((delay, idx) => {
    const t = now + delay;
    const osc = ctx.createOscillator();
    const bGain = ctx.createGain();

    osc.type = 'sine';
    const pitch = bubblePitches[idx];
    osc.frequency.setValueAtTime(pitch * 0.7, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.4, t + 0.04);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.5, t + 0.12);

    bGain.gain.setValueAtTime(0.001, t);
    bGain.gain.linearRampToValueAtTime(0.22, t + 0.03);
    bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(bGain);
    bGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  });
}

/**
 * 2. Drift — arrasto: Enxurrada forte, correnteza turbulenta de enchente e torrente de água
 */
function playWaterDriftSound(ctx: AudioContext, masterGain: GainNode) {
  const now = ctx.currentTime;
  const duration = 1.4;

  // Ruído de correnteza com filtro passa-banda varrendo intensidade
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, duration);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(260, now);
  filter.frequency.exponentialRampToValueAtTime(900, now + 0.4);
  filter.frequency.exponentialRampToValueAtTime(320, now + duration);
  filter.Q.setValueAtTime(2.5, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.01, now);
  noiseGain.gain.linearRampToValueAtTime(0.35, now + 0.35);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);

  // Subgrave de massa d'água turbulenta
  const surgeOsc = ctx.createOscillator();
  const surgeGain = ctx.createGain();
  surgeOsc.type = 'sine';
  surgeOsc.frequency.setValueAtTime(80, now);
  surgeOsc.frequency.linearRampToValueAtTime(55, now + duration);

  surgeGain.gain.setValueAtTime(0.01, now);
  surgeGain.gain.linearRampToValueAtTime(0.28, now + 0.3);
  surgeGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  surgeOsc.connect(surgeGain);
  surgeGain.connect(masterGain);
  surgeOsc.start(now);
  surgeOsc.stop(now + duration);
}

/**
 * 3. Peixe exótico: Chapinhar aquático ágil seguido por mordida/bocada voraz de predador
 */
function playExoticFishBiteSound(ctx: AudioContext, masterGain: GainNode) {
  const now = ctx.currentTime;

  // Respingada/movimento rápido na água
  const splash = ctx.createBufferSource();
  splash.buffer = createNoiseBuffer(ctx, 0.45);
  const splashFilter = ctx.createBiquadFilter();
  splashFilter.type = 'bandpass';
  splashFilter.frequency.setValueAtTime(1400, now);
  splashFilter.frequency.exponentialRampToValueAtTime(600, now + 0.3);
  splashFilter.Q.setValueAtTime(3, now);

  const splashGain = ctx.createGain();
  splashGain.gain.setValueAtTime(0.25, now);
  splashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  splash.connect(splashFilter);
  splashFilter.connect(splashGain);
  splashGain.connect(masterGain);
  splash.start(now);
  splash.stop(now + 0.45);

  // Mordida predatória rápida ("snap/chomp")
  const biteTime = now + 0.12;
  const biteOsc = ctx.createOscillator();
  const biteGain = ctx.createGain();
  biteOsc.type = 'triangle';
  biteOsc.frequency.setValueAtTime(360, biteTime);
  biteOsc.frequency.exponentialRampToValueAtTime(70, biteTime + 0.08);

  biteGain.gain.setValueAtTime(0.01, biteTime);
  biteGain.gain.linearRampToValueAtTime(0.45, biteTime + 0.015);
  biteGain.gain.exponentialRampToValueAtTime(0.001, biteTime + 0.14);

  biteOsc.connect(biteGain);
  biteGain.connect(masterGain);
  biteOsc.start(biteTime);
  biteOsc.stop(biteTime + 0.15);

  // Gole de sucção d'água ("glup")
  const gulpTime = now + 0.16;
  const gulpOsc = ctx.createOscillator();
  const gulpGain = ctx.createGain();
  gulpOsc.type = 'sine';
  gulpOsc.frequency.setValueAtTime(240, gulpTime);
  gulpOsc.frequency.exponentialRampToValueAtTime(130, gulpTime + 0.12);

  gulpGain.gain.setValueAtTime(0.3, gulpTime);
  gulpGain.gain.exponentialRampToValueAtTime(0.001, gulpTime + 0.15);

  gulpOsc.connect(gulpGain);
  gulpGain.connect(masterGain);
  gulpOsc.start(gulpTime);
  gulpOsc.stop(gulpTime + 0.16);
}

/**
 * 4. Replantio de mata ciliar: Brisa suave na copa das árvores, folhas e canto harmônico de pássaros nativos
 */
function playRiparianForestSound(ctx: AudioContext, masterGain: GainNode) {
  const now = ctx.currentTime;
  const duration = 1.6;

  // Brisa suave entre as árvores
  const breeze = ctx.createBufferSource();
  breeze.buffer = createNoiseBuffer(ctx, duration);
  const breezeFilter = ctx.createBiquadFilter();
  breezeFilter.type = 'lowpass';
  breezeFilter.frequency.setValueAtTime(650, now);
  breezeFilter.frequency.linearRampToValueAtTime(950, now + 0.8);
  breezeFilter.frequency.linearRampToValueAtTime(550, now + duration);

  const breezeGain = ctx.createGain();
  breezeGain.gain.setValueAtTime(0.01, now);
  breezeGain.gain.linearRampToValueAtTime(0.12, now + 0.5);
  breezeGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  breeze.connect(breezeFilter);
  breezeFilter.connect(breezeGain);
  breezeGain.connect(masterGain);
  breeze.start(now);
  breeze.stop(now + duration);

  // Melodia de canto de pássaro (trinados alegres e límpidos)
  const birdCalls = [
    { start: 0.15, baseFreq: 2400, endFreq: 2900, dur: 0.14 },
    { start: 0.35, baseFreq: 2900, endFreq: 3300, dur: 0.12 },
    { start: 0.52, baseFreq: 3300, endFreq: 2600, dur: 0.18 },
    { start: 0.85, baseFreq: 2500, endFreq: 3100, dur: 0.15 },
    { start: 1.05, baseFreq: 3100, endFreq: 3600, dur: 0.22 },
  ];

  birdCalls.forEach((call) => {
    const t = now + call.start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(call.baseFreq, t);
    osc.frequency.linearRampToValueAtTime(call.endFreq, t + call.dur * 0.6);
    osc.frequency.linearRampToValueAtTime(call.endFreq * 0.95, t + call.dur);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + call.dur);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + call.dur + 0.02);
  });
}

/**
 * 5. Regularização de esgotos: Toque mecânico de ajuste/válvula de encanamento seguido por fluxo límpido de água limpa
 */
function playSewageRegularizationSound(ctx: AudioContext, masterGain: GainNode) {
  const now = ctx.currentTime;

  // Cliques mecânicos metálicos (chave de tubulação ajustando válvula)
  const clicks = [0.0, 0.12, 0.26];
  clicks.forEach((delay, idx) => {
    const t = now + delay;
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'square';
    const clickFreq = 1600 + idx * 300;
    clickOsc.frequency.setValueAtTime(clickFreq, t);
    clickOsc.frequency.exponentialRampToValueAtTime(400, t + 0.04);

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(1800, t);
    clickFilter.Q.setValueAtTime(6, t);

    clickGain.gain.setValueAtTime(0.28, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    clickOsc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(masterGain);
    clickOsc.start(t);
    clickOsc.stop(t + 0.06);
  });

  // Gotejamento e fluxo de água limpa e cristalina se restabelecendo
  const waterDrops = [
    { delay: 0.38, freq: 880 },
    { delay: 0.52, freq: 1100 },
    { delay: 0.68, freq: 1320 },
    { delay: 0.86, freq: 1650 },
  ];

  waterDrops.forEach(({ delay, freq }) => {
    const t = now + delay;
    const dropOsc = ctx.createOscillator();
    const dropGain = ctx.createGain();

    dropOsc.type = 'sine';
    dropOsc.frequency.setValueAtTime(freq * 0.85, t);
    dropOsc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.03);
    dropOsc.frequency.exponentialRampToValueAtTime(freq, t + 0.16);

    dropGain.gain.setValueAtTime(0.001, t);
    dropGain.gain.linearRampToValueAtTime(0.22, t + 0.02);
    dropGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    dropOsc.connect(dropGain);
    dropGain.connect(masterGain);
    dropOsc.start(t);
    dropOsc.stop(t + 0.2);
  });
}

/**
 * 6. Educação Ambiental: Arpejo cristalino ascendente inspirador (acorde harmônico de conscientização e esperança)
 */
function playEnvironmentalEducationSound(ctx: AudioContext, masterGain: GainNode) {
  const now = ctx.currentTime;

  // Notas da escala pentatônica maior brilhante: C5, E5, G5, B5, D6, G6
  const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];

  notes.forEach((freq, idx) => {
    const t = now + idx * 0.11;
    const noteOsc = ctx.createOscillator();
    const noteGain = ctx.createGain();

    noteOsc.type = 'sine';
    noteOsc.frequency.setValueAtTime(freq, t);

    // Harmônico sutil com leve vibração
    const overtoneOsc = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    overtoneOsc.type = 'triangle';
    overtoneOsc.frequency.setValueAtTime(freq * 2, t);

    const noteDuration = 0.9;
    noteGain.gain.setValueAtTime(0.001, t);
    noteGain.gain.linearRampToValueAtTime(0.24, t + 0.03);
    noteGain.gain.exponentialRampToValueAtTime(0.001, t + noteDuration);

    overtoneGain.gain.setValueAtTime(0.001, t);
    overtoneGain.gain.linearRampToValueAtTime(0.06, t + 0.03);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, t + noteDuration * 0.7);

    noteOsc.connect(noteGain);
    noteGain.connect(masterGain);

    overtoneOsc.connect(overtoneGain);
    overtoneGain.connect(masterGain);

    noteOsc.start(t);
    noteOsc.stop(t + noteDuration + 0.05);

    overtoneOsc.start(t);
    overtoneOsc.stop(t + noteDuration + 0.05);
  });
}

/**
 * Mapeamento e reprodução do som da carta de ação correspondente
 */
export function playActionCardSound(cardTitle: string): boolean {
  if (isMutedState || volumeState <= 0) {
    return false;
  }

  const ctx = getAudioContext();
  if (!ctx) return false;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  try {
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volumeState, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const key = normalizeCardKey(cardTitle);

    if (key.includes('esgoto') && (key.includes('despejo') || key.includes('clandestino'))) {
      playSewageDischargeSound(ctx, masterGain);
      return true;
    }

    if (key.includes('drift') || key.includes('arrasto')) {
      playWaterDriftSound(ctx, masterGain);
      return true;
    }

    if (key.includes('peixe') || key.includes('exotico')) {
      playExoticFishBiteSound(ctx, masterGain);
      return true;
    }

    if (key.includes('replantio') || key.includes('mataciliar') || key.includes('reflorestamento')) {
      playRiparianForestSound(ctx, masterGain);
      return true;
    }

    if (key.includes('regularizacao') || key.includes('saneamento')) {
      playSewageRegularizationSound(ctx, masterGain);
      return true;
    }

    if (key.includes('educacao') || key.includes('ambiental') || key.includes('conscientizacao')) {
      playEnvironmentalEducationSound(ctx, masterGain);
      return true;
    }

    // Se não corresponder exatamente a uma das 6, toca o arpejo inspirador como som padrão
    playEnvironmentalEducationSound(ctx, masterGain);
    return true;
  } catch (err) {
    console.warn('Erro ao reproduzir áudio da carta de ação:', err);
    return false;
  }
}
