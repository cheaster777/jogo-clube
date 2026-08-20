import assert from 'node:assert/strict';
import test from 'node:test';
import type { FamilyCard } from '../../src/constants';
import {
  applyAction,
  createGame,
  drawAction,
  endTurn,
  getBotCommand,
  playBotTurn,
  rankPlayers,
  type GameActionCard,
  type GameState,
} from '../../src/game';

const players = [
  { name: 'Ana', isBot: false },
  { name: 'Beto', isBot: true },
  { name: 'Caio', isBot: false },
];

function makeCard(id: string, score: number): FamilyCard {
  return {
    id,
    type: 'family',
    name: id,
    score,
    group: 'Teste',
    description: '',
    color: '#000000',
    image: '',
  };
}

function stateWithHands(hands: FamilyCard[][], currentPlayerIndex = 0): GameState {
  const state = createGame({ seed: 'test-state', players });
  return {
    ...state,
    phase: 'playing',
    currentPlayerIndex,
    players: state.players.map((player, index) => ({
      ...player,
      hand: hands[index] ?? [],
      score: (hands[index] ?? []).reduce((sum, card) => sum + card.score, 0),
    })),
  };
}

function actionWithEffect(state: GameState, effect: GameActionCard['effect']): GameActionCard {
  return { ...state.actionDeck[0], title: 'Título alterado', effect };
}

test('seed gera os mesmos decks, mãos e estado inicial', () => {
  const first = createGame({ seed: 'seed-reproduzivel', players });
  const second = createGame({ seed: 'seed-reproduzivel', players });
  const different = createGame({ seed: 'outra-seed', players });

  assert.deepEqual(first, second);
  assert.notDeepEqual(first.actionDeck.map(card => card.id), different.actionDeck.map(card => card.id));
  assert.equal(first.players.every(player => player.hand.length === 7), true);
  assert.equal(first.familyDeck.length, 116 - players.length * 7);
  assert.equal(first.actionDeck.length, 24);
});

test('efeitos são tipados e não dependem do título da carta', () => {
  const state = stateWithHands([
    [makeCard('p0-high', 10), makeCard('p0-low', 2)],
    [makeCard('p1-high', 8), makeCard('p1-low', 1)],
    [makeCard('p2-high', 7)],
  ]);
  const action = actionWithEffect(state, {
    type: 'REMOVE_HIGH_VALUE',
    count: 1,
    allowedScores: [10, 8],
  });

  const result = applyAction(state, action);

  assert.deepEqual(result.players[0].hand.map(card => card.id), ['p0-low']);
  assert.equal(result.players[0].score, 2);
  assert.equal(result.lastAction?.title, 'Título alterado');
});

test('Drift afeta o jogador anterior e Peixe exótico o próximo', () => {
  const state = stateWithHands([
    [makeCard('p0-a', 1), makeCard('p0-b', 2), makeCard('p0-c', 3), makeCard('p0-d', 4), makeCard('p0-e', 5), makeCard('p0-f', 6)],
    [makeCard('p1-a', 1)],
    [makeCard('p2-a', 1), makeCard('p2-b', 2), makeCard('p2-c', 3), makeCard('p2-d', 4), makeCard('p2-e', 5), makeCard('p2-f', 6)],
  ], 1);

  const drift = actionWithEffect(state, {
    type: 'REMOVE_RANDOM_FROM_PLAYER',
    count: 5,
    target: 'PREVIOUS_PLAYER',
  });
  const afterDrift = applyAction(state, drift);
  assert.equal(afterDrift.players[0].hand.length, 1);
  assert.equal(afterDrift.players[2].hand.length, 6);

  const exotic = actionWithEffect(state, {
    type: 'REMOVE_RANDOM_FROM_PLAYER',
    count: 5,
    target: 'NEXT_PLAYER',
  });
  const afterExotic = applyAction(state, exotic);
  assert.equal(afterExotic.players[2].hand.length, 1);
  assert.equal(afterExotic.players[0].hand.length, 6);
});

test('pesca continua mesmo quando o baralho de famílias não tem cartas suficientes', () => {
  const state = stateWithHands([[], [], []]);
  const card = makeCard('available', 4);
  const action = actionWithEffect({ ...state, familyDeck: [card] }, {
    type: 'DRAW_FROM_FAMILY_DECK',
    count: 5,
  });

  const afterAction = applyAction({ ...state, familyDeck: [card] }, action);
  assert.equal(afterAction.players[0].hand.length, 1);
  assert.equal(afterAction.familyDeck.length, 0);
  assert.equal(endTurn(afterAction).phase, 'playing');
});

test('fim da partida ocorre depois da rodada máxima', () => {
  const state = stateWithHands([[], [], []]);
  const action = actionWithEffect(state, { type: 'DRAW_FROM_FAMILY_DECK', count: 0 });
  const afterAction = applyAction({ ...state, currentRound: 5, currentPlayerIndex: 2 }, action);
  const result = endTurn(afterAction);

  assert.equal(result.phase, 'gameOver');
  assert.equal(result.gameOverReason, 'MAX_ROUNDS');
});

test('ranking usa desempate estável pela ordem dos assentos', () => {
  const state = stateWithHands([[], [], []]);
  const ranking = rankPlayers([
    { ...state.players[0], score: 10 },
    { ...state.players[1], score: 20 },
    { ...state.players[2], score: 20 },
  ]);

  assert.deepEqual(ranking.map(player => [player.rank, player.seat, player.score]), [
    [1, 1, 20],
    [2, 2, 20],
    [3, 0, 10],
  ]);
});

test('bot recebe comandos determinísticos e completa seu turno', () => {
  const state = createGame({ seed: 42, players: [players[0], players[1]] });

  assert.equal(getBotCommand(state), null);
  const afterHumanAction = endTurn(drawAction(state));
  assert.deepEqual(getBotCommand(afterHumanAction), { type: 'DRAW_ACTION' });

  const afterBot = playBotTurn(afterHumanAction);
  assert.equal(afterBot.currentPlayerIndex, 0);
  assert.equal(afterBot.phase, 'playing');
  assert.equal(afterBot.turnNumber, 2);
});
