import type { FamilyCard } from '../constants';
import {
  createShuffledDecks,
  DEFAULT_ACTION_COPIES,
  DEFAULT_FAMILY_COPIES,
  DEFAULT_INITIAL_HAND_SIZE,
  DEFAULT_MAX_ROUNDS,
} from './decks';
import { randomInt } from './random';
import type {
  ActionEffect,
  CreateGameOptions,
  GameActionCard,
  GameCommand,
  GamePlayer,
  GameState,
  PlayerSetup,
  RankedPlayer,
} from './types';

function assertPlayers(players: readonly PlayerSetup[]): void {
  if (players.length < 2 || players.length > 4) {
    throw new Error(`O jogo exige entre 2 e 4 jogadores; recebido: ${players.length}`);
  }
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} deve ser um inteiro positivo: ${value}`);
  }
}

export function calculateScore(hand: readonly FamilyCard[]): number {
  return hand.reduce((total, card) => total + card.score, 0);
}

export function createPlayers(players: readonly PlayerSetup[]): GamePlayer[] {
  assertPlayers(players);

  return players.map((setup, id) => ({
    id,
    name: setup.name.trim() || `Jogador ${id + 1}`,
    hand: [],
    score: 0,
    isBot: setup.isBot,
  }));
}

export function createGame(options: CreateGameOptions): GameState {
  assertPlayers(options.players);

  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const initialHandSize = options.initialHandSize ?? DEFAULT_INITIAL_HAND_SIZE;
  const familyCopies = options.familyCopies ?? DEFAULT_FAMILY_COPIES;
  const actionCopies = options.actionCopies ?? DEFAULT_ACTION_COPIES;

  assertPositiveInteger('maxRounds', maxRounds);
  assertPositiveInteger('initialHandSize', initialHandSize);
  assertPositiveInteger('familyCopies', familyCopies);
  assertPositiveInteger('actionCopies', actionCopies);

  const decks = createShuffledDecks(options.seed, familyCopies, actionCopies);
  const players = createPlayers(options.players);
  const minimumCards = players.length * initialHandSize;
  if (decks.familyDeck.length < minimumCards) {
    throw new Error(`Baralho insuficiente para distribuir ${minimumCards} cartas`);
  }

  let familyDeck = [...decks.familyDeck];
  const dealtPlayers = players.map(player => {
    const hand = familyDeck.slice(0, initialHandSize);
    familyDeck = familyDeck.slice(initialHandSize);
    return { ...player, hand, score: calculateScore(hand) };
  });

  return {
    seed: options.seed,
    rngState: decks.rngState,
    players: dealtPlayers,
    familyDeck,
    actionDeck: decks.actionDeck,
    currentPlayerIndex: 0,
    currentRound: 1,
    maxRounds,
    initialHandSize,
    phase: 'playing',
    lastAction: null,
    actionMessage: '',
    turnNumber: 0,
    gameOverReason: null,
  };
}

function clonePlayers(players: readonly GamePlayer[]): GamePlayer[] {
  return players.map(player => ({ ...player, hand: [...player.hand] }));
}

function recalculatePlayers(players: readonly GamePlayer[]): GamePlayer[] {
  return players.map(player => ({
    ...player,
    score: calculateScore(player.hand),
  }));
}

function compareCards(left: FamilyCard, right: FamilyCard): number {
  return right.score - left.score || left.id.localeCompare(right.id);
}

function previousPlayerIndex(currentPlayerIndex: number, playerCount: number): number {
  return (currentPlayerIndex - 1 + playerCount) % playerCount;
}

function nextPlayerIndex(currentPlayerIndex: number, playerCount: number): number {
  return (currentPlayerIndex + 1) % playerCount;
}

function removeCardsById(hand: readonly FamilyCard[], removed: readonly FamilyCard[]): FamilyCard[] {
  const removedIds = new Set(removed.map(card => card.id));
  return hand.filter(card => !removedIds.has(card.id));
}

function removeRandomCards(
  hand: readonly FamilyCard[],
  count: number,
  initialRngState: number
): { remaining: FamilyCard[]; removed: FamilyCard[]; rngState: number } {
  const available = [...hand];
  const removed: FamilyCard[] = [];
  let rngState = initialRngState;
  const removalCount = Math.min(count, available.length);

  for (let index = 0; index < removalCount; index += 1) {
    const step = randomInt(rngState, available.length);
    rngState = step.state;
    removed.push(available.splice(step.value, 1)[0]);
  }

  return { remaining: available, removed, rngState };
}

function finishGame(state: GameState, reason: GameState['gameOverReason']): GameState {
  return {
    ...state,
    phase: 'gameOver',
    lastAction: null,
    actionMessage: '',
    gameOverReason: reason,
  };
}

/** Aplica uma carta já tipada, sem consultar o título exibido. */
export function applyAction(state: GameState, action: GameActionCard): GameState {
  if (state.phase !== 'playing') {
    throw new Error(`A ação só pode ser aplicada na fase playing; fase atual: ${state.phase}`);
  }

  const players = clonePlayers(state.players);
  let familyDeck = [...state.familyDeck];
  let rngState = state.rngState;
  let message = '';
  const currentPlayer = players[state.currentPlayerIndex];

  if (!currentPlayer) {
    throw new Error(`Jogador atual inválido: ${state.currentPlayerIndex}`);
  }

  const effect: ActionEffect = action.effect;
  switch (effect.type) {
    case 'REMOVE_HIGH_VALUE': {
      const eligible = currentPlayer.hand
        .filter(card => effect.allowedScores.includes(card.score))
        .sort(compareCards)
        .slice(0, effect.count);
      currentPlayer.hand = removeCardsById(currentPlayer.hand, eligible);
      message = eligible.length
        ? `Você perdeu: ${eligible.map(card => card.name).join(', ')}`
        : 'Você não tinha famílias elegíveis para perder.';
      break;
    }

    case 'REMOVE_RANDOM_FROM_PLAYER': {
      const targetIndex = effect.target === 'PREVIOUS_PLAYER'
        ? previousPlayerIndex(state.currentPlayerIndex, players.length)
        : nextPlayerIndex(state.currentPlayerIndex, players.length);
      const target = players[targetIndex];
      const result = removeRandomCards(target.hand, effect.count, rngState);
      target.hand = result.remaining;
      rngState = result.rngState;
      message = result.removed.length
        ? `${target.name} perdeu ${result.removed.length} carta(s) aleatoriamente.`
        : `${target.name} não tinha cartas para perder.`;
      break;
    }

    case 'TAKE_HIGHEST_FROM_OPPONENTS': {
      const taken: FamilyCard[] = [];
      players.forEach((player, index) => {
        if (index === state.currentPlayerIndex || player.hand.length === 0) return;
        const bestCard = [...player.hand].sort(compareCards)[0];
        player.hand = removeCardsById(player.hand, [bestCard]);
        taken.push(bestCard);
      });
      currentPlayer.hand = [...currentPlayer.hand, ...taken];
      message = taken.length
        ? `Você pegou ${taken.length} carta(s) de maior pontuação dos oponentes.`
        : 'Os oponentes não tinham cartas disponíveis.';
      break;
    }

    case 'DRAW_FROM_FAMILY_DECK': {
      const drawn = familyDeck.slice(0, effect.count);
      familyDeck = familyDeck.slice(drawn.length);
      currentPlayer.hand = [...currentPlayer.hand, ...drawn];
      message = `Você pescou ${drawn.length} carta(s) do monte.`;
      break;
    }

    default: {
      const exhaustive: never = effect;
      throw new Error(`Efeito não suportado: ${String(exhaustive)}`);
    }
  }

  return {
    ...state,
    players: recalculatePlayers(players),
    familyDeck,
    rngState,
    phase: 'action',
    lastAction: action,
    actionMessage: message,
    gameOverReason: null,
  };
}

export function drawAction(state: GameState): GameState {
  if (state.phase !== 'playing') {
    throw new Error(`A carta só pode ser comprada na fase playing; fase atual: ${state.phase}`);
  }

  const action = state.actionDeck[0];
  if (!action) {
    return finishGame(state, 'ACTION_DECK_EMPTY');
  }

  return applyAction(
    {
      ...state,
      actionDeck: state.actionDeck.slice(1),
    },
    action
  );
}

export function endTurn(state: GameState): GameState {
  if (state.phase !== 'action') {
    throw new Error(`O turno só pode terminar na fase action; fase atual: ${state.phase}`);
  }

  const completedLastSeat = state.currentPlayerIndex === state.players.length - 1;
  const nextTurnNumber = state.turnNumber + 1;

  if (state.actionDeck.length === 0) {
    return finishGame({ ...state, turnNumber: nextTurnNumber }, 'ACTION_DECK_EMPTY');
  }

  if (completedLastSeat && state.currentRound >= state.maxRounds) {
    return finishGame({ ...state, turnNumber: nextTurnNumber }, 'MAX_ROUNDS');
  }

  return {
    ...state,
    currentPlayerIndex: completedLastSeat ? 0 : state.currentPlayerIndex + 1,
    currentRound: completedLastSeat ? state.currentRound + 1 : state.currentRound,
    phase: 'playing',
    lastAction: null,
    actionMessage: '',
    turnNumber: nextTurnNumber,
    gameOverReason: null,
  };
}

export function applyCommand(state: GameState, command: GameCommand): GameState {
  switch (command.type) {
    case 'DRAW_ACTION':
      return drawAction(state);
    case 'END_TURN':
      return endTurn(state);
    default: {
      const exhaustive: never = command;
      throw new Error(`Comando não suportado: ${String(exhaustive)}`);
    }
  }
}

export function rankPlayers(players: readonly GamePlayer[]): RankedPlayer[] {
  return players
    .map((player, seat) => ({ player, seat }))
    .sort((left, right) => right.player.score - left.player.score || left.seat - right.seat)
    .map((entry, index) => ({
      ...entry.player,
      rank: index + 1,
      seat: entry.seat,
    }));
}

export function isGameOver(state: GameState): boolean {
  return state.phase === 'gameOver';
}

export function getBotCommand(state: GameState): GameCommand | null {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer?.isBot || state.phase === 'gameOver') return null;
  if (state.phase === 'playing') return { type: 'DRAW_ACTION' };
  if (state.phase === 'action') return { type: 'END_TURN' };
  return null;
}

/** Executa o ciclo determinístico de um bot sem timers ou Math.random. */
export function playBotTurn(state: GameState): GameState {
  const drawCommand = getBotCommand(state);
  if (!drawCommand || drawCommand.type !== 'DRAW_ACTION') return state;

  const afterAction = applyCommand(state, drawCommand);
  const endCommand = getBotCommand(afterAction);
  if (!endCommand || endCommand.type !== 'END_TURN') return afterAction;
  return applyCommand(afterAction, endCommand);
}
