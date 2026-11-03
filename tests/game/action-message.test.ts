import assert from 'node:assert/strict';
import test from 'node:test';
import { describeActionMessage } from '../../src/lib/cardDisplay';

test('names the actor for other viewers', () => {
  assert.equal(describeActionMessage('Você perdeu: Perlidae', 'Ana', false), 'Ana perdeu: Perlidae');
});

test('keeps the message for the acting player', () => {
  assert.equal(describeActionMessage('Você perdeu: Perlidae', 'Ana', true), 'Você perdeu: Perlidae');
});

test('writes the correct plural', () => {
  assert.equal(describeActionMessage('Você pescou 1 carta(s) do monte.', 'Ana', true), 'Você pescou 1 carta do monte.');
  assert.equal(describeActionMessage('Bia perdeu 3 carta(s) aleatoriamente.', 'Ana', false), 'Bia perdeu 3 cartas aleatoriamente.');
});
