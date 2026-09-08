import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAudioMuted,
  setAudioMuted,
  toggleAudioMuted,
  getAudioVolume,
  setAudioVolume,
  subscribeAudioState,
  playActionCardSound,
} from '../../src/lib/audio';

test('Audio engine: mute state toggling and listeners', () => {
  setAudioMuted(false);
  assert.equal(getAudioMuted(), false);

  let notifiedMuted: boolean | null = null;
  const unsubscribe = subscribeAudioState((muted) => {
    notifiedMuted = muted;
  });

  assert.equal(notifiedMuted, false);

  const toggled = toggleAudioMuted();
  assert.equal(toggled, true);
  assert.equal(getAudioMuted(), true);
  assert.equal(notifiedMuted, true);

  setAudioMuted(false);
  assert.equal(getAudioMuted(), false);
  assert.equal(notifiedMuted, false);

  unsubscribe();
});

test('Audio engine: volume control clamping', () => {
  setAudioVolume(0.5);
  assert.equal(getAudioVolume(), 0.5);

  setAudioVolume(1.8);
  assert.equal(getAudioVolume(), 1.0);

  setAudioVolume(-0.4);
  assert.equal(getAudioVolume(), 0.0);

  setAudioVolume(0.8);
  assert.equal(getAudioVolume(), 0.8);
});

test('Audio engine: safe execution of playActionCardSound', () => {
  // In Node environment without window/Web Audio, it should safely return false without throwing
  assert.doesNotThrow(() => {
    const result = playActionCardSound('Despejo de esgoto');
    assert.equal(typeof result, 'boolean');
  });

  assert.doesNotThrow(() => {
    playActionCardSound('Drift — arrasto');
    playActionCardSound('Peixe exótico');
    playActionCardSound('Replantio de mata ciliar');
    playActionCardSound('Regularização de esgotos');
    playActionCardSound('Educação Ambiental');
  });
});
