// PWA state shared by the install banner: whether the game can be offered for
// installation on this device and whether a new version is waiting.

export type InstallMode = 'native' | 'ios' | null;

export interface PwaSnapshot {
  installMode: InstallMode;
  updateReady: boolean;
}

export interface InstallEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
  nativeApp: boolean;
  hasNativePrompt: boolean;
  dismissedAt: number | null;
  now: number;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export const DISMISS_STORAGE_KEY = 'clube:pwa-install-dismissed-at';
export const DISMISS_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

const IOS_DEVICE = /iPhone|iPad|iPod/i;
const MOBILE_DEVICE = /Android|Mobile/i;
// iOS in-app browsers have no "Add to Home Screen" action.
const IOS_IN_APP_BROWSER = /FBAN|FBAV|Instagram|Line\//i;

function isIos(env: InstallEnvironment) {
  // iPadOS Safari reports itself as a Mac, so touch support tells them apart.
  return IOS_DEVICE.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
}

export function decideInstallMode(env: InstallEnvironment): InstallMode {
  if (env.standalone || env.nativeApp) return null;
  if (env.dismissedAt !== null && env.now - env.dismissedAt < DISMISS_PERIOD_MS) return null;
  if (isIos(env)) return IOS_IN_APP_BROWSER.test(env.userAgent) ? null : 'ios';
  return env.hasNativePrompt && MOBILE_DEVICE.test(env.userAgent) ? 'native' : null;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let applyUpdate: (() => void) | null = null;
let snapshot: PwaSnapshot = { installMode: null, updateReady: false };
const listeners = new Set<() => void>();

export function isNativeApp() {
  const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}

function isStandalone() {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

// Storage can throw in private windows, so a failed read shows the banner and a
// failed write only forgets the dismissal.
function readDismissedAt() {
  try {
    const value = Number(localStorage.getItem(DISMISS_STORAGE_KEY));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveDismissedAt(value: number) {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(value));
  } catch {
    // Nothing to do: the banner returns on the next visit.
  }
}

function readEnvironment(): InstallEnvironment {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: installed || isStandalone(),
    nativeApp: isNativeApp(),
    hasNativePrompt: deferredPrompt !== null,
    dismissedAt: readDismissedAt(),
    now: Date.now(),
  };
}

function publish(updateReady = snapshot.updateReady) {
  const installMode = decideInstallMode(readEnvironment());
  if (installMode === snapshot.installMode && updateReady === snapshot.updateReady) return;
  snapshot = { installMode, updateReady };
  listeners.forEach(listener => listener());
}

// Call before React mounts: the browser can fire beforeinstallprompt right
// after load, and that event is not repeated.
export function initPwa() {
  window.addEventListener('beforeinstallprompt', event => {
    if (!MOBILE_DEVICE.test(navigator.userAgent)) return;
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    publish();
  });
  publish();
}

export function subscribePwa(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPwaSnapshot() {
  return snapshot;
}

export function dismissInstall() {
  saveDismissedAt(Date.now());
  publish();
}

export async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return;
  // The browser allows prompt() only once for each event.
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'dismissed') saveDismissedAt(Date.now());
  publish();
}

export function markUpdateReady(update: () => void) {
  applyUpdate = update;
  publish(true);
}

export function dismissUpdate() {
  publish(false);
}

export function installUpdate() {
  applyUpdate?.();
}
