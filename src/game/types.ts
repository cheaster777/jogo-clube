import type { ActionCard, FamilyCard } from '../constants';

export type Seed = string | number;

export type GamePhase = 'playing' | 'action' | 'gameOver';

export type ActionEffect =
  | {
      type: 'REMOVE_HIGH_VALUE';
      count: number;
      allowedScores: readonly number[];
    }
  | {
      type: 'REMOVE_RANDOM_FROM_PLAYER';
      count: number;
      target: 'PREVIOUS_PLAYER' | 'NEXT_PLAYER';
    }
  | {
      type: 'TAKE_HIGHEST_FROM_OPPONENTS';
    }
  | {
      type: 'DRAW_FROM_FAMILY_DECK';
      count: number;
    };

export type GameActionCard = Omit<ActionCard, 'effect'> & {
  effect: ActionEffect;
  sourceIndex: number;
  copyIndex: number;
};

export interface PlayerSetup {
  name: string;
  isBot: boolean;
}

export interface GamePlayer {
  id: number;
  name: string;
  hand: FamilyCard[];
  score: number;
  isBot: boolean;
}

export interface CreateGameOptions {
  seed: Seed;
  players: readonly PlayerSetup[];
  maxRounds?: number;
  initialHandSize?: number;
  familyCopies?: number;
  actionCopies?: number;
}

export type GameOverReason = 'MAX_ROUNDS' | 'ACTION_DECK_EMPTY';

export interface GameState {
  seed: Seed;
  rngState: number;
  players: GamePlayer[];
  familyDeck: FamilyCard[];
  actionDeck: GameActionCard[];
  currentPlayerIndex: number;
  currentRound: number;
  maxRounds: number;
  initialHandSize: number;
  phase: GamePhase;
  lastAction: GameActionCard | null;
  actionMessage: string;
  turnNumber: number;
  gameOverReason: GameOverReason | null;
}

export type GameCommand =
  | { type: 'DRAW_ACTION' }
  | { type: 'END_TURN' };

export interface RankedPlayer extends GamePlayer {
  rank: number;
  seat: number;
}

/**
 * Decisões explícitas para pontos que eram ambíguos nos textos originais.
 * Elas fazem parte do contrato do motor e podem ser versionadas no backend.
 */
export const RULE_DECISIONS = {
  driftTarget: 'PREVIOUS_PLAYER',
  exoticFishTarget: 'NEXT_PLAYER',
  gameEnds: 'AFTER_MAX_ROUNDS_OR_ACTION_DECK_EXHAUSTION',
  emptyFamilyDeck: 'DRAW_AVAILABLE_CARDS_AND_CONTINUE',
  rankingTieBreak: 'LOWER_SEAT_ID_FIRST',
} as const;
