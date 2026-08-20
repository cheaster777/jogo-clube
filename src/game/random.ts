import type { Seed } from './types';

const UINT32_RANGE = 0x1_0000_0000;
const UINT32_MASK = 0xffff_ffff;

export interface RandomStep {
  value: number;
  state: number;
}

/** Converte uma seed numérica ou textual em um estado uint32 reproduzível. */
export function seedToRngState(seed: Seed): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.trunc(seed) >>> 0;
  }

  const text = String(seed);
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Um passo de Mulberry32 sem mutação externa. O estado retornado deve ser
 * persistido no GameState para que o replay de comandos seja determinístico.
 */
export function nextRandom(state: number): RandomStep {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let value = nextState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  const normalized = ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;

  return { value: normalized, state: nextState };
}

export function randomInt(state: number, exclusiveMax: number): { value: number; state: number } {
  if (!Number.isInteger(exclusiveMax) || exclusiveMax <= 0) {
    throw new Error(`exclusiveMax deve ser um inteiro positivo: ${exclusiveMax}`);
  }

  const step = nextRandom(state);
  return {
    value: Math.floor(step.value * exclusiveMax),
    state: step.state,
  };
}

export function shuffleWithRng<T>(items: readonly T[], initialState: number): { items: T[]; state: number } {
  const shuffled = [...items];
  let state = initialState & UINT32_MASK;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const step = randomInt(state, index + 1);
    state = step.state;
    [shuffled[index], shuffled[step.value]] = [shuffled[step.value], shuffled[index]];
  }

  return { items: shuffled, state };
}
