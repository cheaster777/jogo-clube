import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideInstallMode, DISMISS_PERIOD_MS, type InstallEnvironment } from '../../src/lib/pwa';

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const NOW = 1_800_000_000_000;

function environment(overrides: Partial<InstallEnvironment>): InstallEnvironment {
  return {
    userAgent: ANDROID_CHROME,
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
    standalone: false,
    nativeApp: false,
    hasNativePrompt: true,
    dismissedAt: null,
    now: NOW,
    ...overrides,
  };
}

test('Android com evento do navegador usa o prompt nativo', () => {
  assert.equal(decideInstallMode(environment({})), 'native');
});

test('Android sem evento do navegador não mostra banner', () => {
  assert.equal(decideInstallMode(environment({ hasNativePrompt: false })), null);
});

test('iPhone mostra instruções sem depender do evento', () => {
  const env = environment({ userAgent: IPHONE_SAFARI, platform: 'iPhone', hasNativePrompt: false });
  assert.equal(decideInstallMode(env), 'ios');
});

test('iPad identificado como Mac mostra instruções', () => {
  const env = environment({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    platform: 'MacIntel',
    hasNativePrompt: false,
  });
  assert.equal(decideInstallMode(env), 'ios');
});

test('navegador interno do Instagram no iPhone não mostra banner', () => {
  const env = environment({ userAgent: `${IPHONE_SAFARI} Instagram 350.0`, platform: 'iPhone' });
  assert.equal(decideInstallMode(env), null);
});

test('computador não mostra banner', () => {
  const env = environment({ userAgent: DESKTOP_CHROME, platform: 'Linux x86_64', maxTouchPoints: 0 });
  assert.equal(decideInstallMode(env), null);
});

test('app já instalado ou empacotado não mostra banner', () => {
  assert.equal(decideInstallMode(environment({ standalone: true })), null);
  assert.equal(decideInstallMode(environment({ nativeApp: true })), null);
});

test('recusa esconde o banner até o fim do período', () => {
  const justBeforeEnd = NOW - DISMISS_PERIOD_MS + 1;
  assert.equal(decideInstallMode(environment({ dismissedAt: justBeforeEnd })), null);
  assert.equal(decideInstallMode(environment({ dismissedAt: NOW - DISMISS_PERIOD_MS })), 'native');
});
