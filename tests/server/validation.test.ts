import assert from 'node:assert/strict';
import test from 'node:test';
import { waterQualityForScore } from '../../server/game/score';
import { parseMatchCommand, parseMatchCreate } from '../../server/validation';

test('comando aceita somente tipos autoritativos e versão válida', () => {
  assert.deepEqual(parseMatchCommand({
    command_id: 'cmd-1',
    expected_version: 3,
    type: 'DRAW_ACTION',
    score: 9999,
  }), { commandId: 'cmd-1', expectedVersion: 3, type: 'DRAW_ACTION' });
  assert.throws(() => parseMatchCommand({ command_id: 'cmd-2', expected_version: -1, type: 'END_TURN' }));
  assert.throws(() => parseMatchCommand({ command_id: 'cmd-3', expected_version: 0, type: 'SAVE_SCORE' }));
});

test('criação limita partida a dois a quatro lugares', () => {
  assert.deepEqual(parseMatchCreate({ mode: 'local', playerCount: 2, playerNames: ['Ana'] }), {
    mode: 'local',
    playerCount: 2,
    playerNames: ['Ana'],
  });
  assert.throws(() => parseMatchCreate({ mode: 'online', playerCount: 5 }));
});

test('qualidade e diagnóstico são derivados do score do servidor', () => {
  assert.deepEqual(waterQualityForScore(150), { category: 'Bom', diagnosis: 'Limpa ou não alterada significativamente' });
  assert.deepEqual(waterQualityForScore(14), { category: 'Muito crítico', diagnosis: 'Altamente poluída' });
});
