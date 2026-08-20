import type { ActionCard, FamilyCard } from '../constants';
import {
  applyCommand,
  createGame,
  type CreateGameOptions,
  type GameCommand,
  type GameActionCard,
  type GameState,
} from './index';

/**
 * Adaptador fino entre o motor puro e o estado que a UI já renderiza.
 * A tela continua responsável apenas pela apresentação; regras e efeitos
 * permanecem no mesmo caminho determinístico usado pelo backend futuro.
 */
export type LocalGameState = GameState;

export function createLocalGame(options: CreateGameOptions): LocalGameState {
  return createGame(options);
}

export function dispatchLocalCommand(
  state: LocalGameState,
  command: GameCommand,
): LocalGameState {
  return applyCommand(state, command);
}

function toUiActionCard(action: GameActionCard): ActionCard {
  const { effect: _engineEffect, ...card } = action;

  // O campo é exigido pelo tipo histórico de ActionCard, mas a UI apenas
  // renderiza a carta. Efeitos nunca são executados neste adaptador.
  return { ...card, effect: () => undefined };
}

export function getLocalUiState(state: LocalGameState): {
  players: LocalGameState['players'];
  familyDeck: FamilyCard[];
  actionDeck: ActionCard[];
  currentPlayerIndex: number;
  currentRound: number;
  phase: LocalGameState['phase'];
  lastAction: ActionCard | null;
  actionMessage: string;
} {
  return {
    players: state.players,
    familyDeck: state.familyDeck,
    actionDeck: state.actionDeck.map(toUiActionCard),
    currentPlayerIndex: state.currentPlayerIndex,
    currentRound: state.currentRound,
    phase: state.phase,
    lastAction: state.lastAction ? toUiActionCard(state.lastAction) : null,
    actionMessage: state.actionMessage,
  };
}
