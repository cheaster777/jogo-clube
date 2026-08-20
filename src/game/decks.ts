import {
  ACTION_CARDS_DATA,
  FAMILY_CARDS_DATA,
} from '../constants';
import type { ActionEffect, GameActionCard, Seed } from './types';
import { seedToRngState, shuffleWithRng } from './random';

export const DEFAULT_MAX_ROUNDS = 5;
export const DEFAULT_INITIAL_HAND_SIZE = 7;
export const DEFAULT_FAMILY_COPIES = 2;
export const DEFAULT_ACTION_COPIES = 4;

/**
 * O índice é o identificador estável da definição atual em constants.ts.
 * A regra não depende do título exibido e falha explicitamente se a fonte
 * ganhar uma carta sem uma definição correspondente.
 */
export const ACTION_EFFECTS_BY_SOURCE_INDEX: readonly ActionEffect[] = [
  { type: 'REMOVE_HIGH_VALUE', count: 2, allowedScores: [10, 8] },
  { type: 'REMOVE_RANDOM_FROM_PLAYER', count: 5, target: 'PREVIOUS_PLAYER' },
  { type: 'REMOVE_RANDOM_FROM_PLAYER', count: 5, target: 'NEXT_PLAYER' },
  { type: 'TAKE_HIGHEST_FROM_OPPONENTS' },
  { type: 'DRAW_FROM_FAMILY_DECK', count: 3 },
  { type: 'DRAW_FROM_FAMILY_DECK', count: 5 },
];

export function createFamilyDeck(copies = DEFAULT_FAMILY_COPIES) {
  if (!Number.isInteger(copies) || copies < 1) {
    throw new Error(`copies deve ser um inteiro positivo: ${copies}`);
  }

  return Array.from({ length: copies }, (_, copyIndex) =>
    FAMILY_CARDS_DATA.map((card, sourceIndex) => ({
      ...card,
      id: `f-${sourceIndex}-${copyIndex}`,
    }))
  ).flat();
}

export function createActionDeck(copies = DEFAULT_ACTION_COPIES): GameActionCard[] {
  if (!Number.isInteger(copies) || copies < 1) {
    throw new Error(`copies deve ser um inteiro positivo: ${copies}`);
  }

  return Array.from({ length: copies }, (_, copyIndex) =>
    ACTION_CARDS_DATA.map((card, sourceIndex) => {
      const effect = ACTION_EFFECTS_BY_SOURCE_INDEX[sourceIndex];
      if (!effect) {
        throw new Error(`Carta de ação sem efeito tipado no índice ${sourceIndex}`);
      }

      return {
        ...card,
        id: `a-${sourceIndex}-${copyIndex}`,
        effect,
        sourceIndex,
        copyIndex,
      };
    })
  ).flat();
}

export function createShuffledDecks(
  seed: Seed,
  familyCopies = DEFAULT_FAMILY_COPIES,
  actionCopies = DEFAULT_ACTION_COPIES
) {
  const initialState = seedToRngState(seed);
  const family = shuffleWithRng(createFamilyDeck(familyCopies), initialState);
  const actions = shuffleWithRng(createActionDeck(actionCopies), family.state);

  return {
    familyDeck: family.items,
    actionDeck: actions.items,
    rngState: actions.state,
  };
}
