import assert from 'node:assert/strict';
import test from 'node:test';
import { mapUsers, placeholderPasswordHash } from '../../scripts/import-supabase-users.mjs';

test('importador de usuários normaliza email e exige reset quando não há confirmação', () => {
  const [user] = mapUsers([{
    id: '11111111-1111-4111-8111-111111111111',
    email: ' Pessoa@EXAMPLE.COM ',
    created_at: '2026-01-01T00:00:00Z',
    email_confirmed_at: null,
  }]);

  assert.equal(user.email, 'pessoa@example.com');
  assert.equal(user.status, 'pending');
  assert.equal(user.emailVerifiedAt, null);
  assert.match(user.passwordHash, /^scrypt\$16384\$8\$1\$/);
  assert.equal(user.passwordMigrated, false);
});

test('importador preserva confirmação e hash scrypt compatível', () => {
  const sourceHash = placeholderPasswordHash();
  const [user] = mapUsers([{
    id: '22222222-2222-4222-8222-222222222222',
    email: 'confirmado@example.com',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    email_confirmed_at: '2026-01-01T12:00:00Z',
    password_hash: sourceHash,
  }]);

  assert.equal(user.status, 'active');
  assert.equal(user.emailVerifiedAt, '2026-01-01T12:00:00.000Z');
  assert.equal(user.passwordHash, sourceHash);
  assert.equal(user.passwordMigrated, true);
});

test('importador rejeita UUID e email duplicados', () => {
  assert.throws(() => mapUsers([{
    id: '33333333-3333-4333-8333-333333333333',
    email: 'duplicado@example.com',
    created_at: '2026-01-01T00:00:00Z',
  }, {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'outro@example.com',
    created_at: '2026-01-01T00:00:00Z',
  }]));
  assert.throws(() => mapUsers([{
    id: '44444444-4444-4444-8444-444444444444',
    email: 'duplicado@example.com',
    created_at: '2026-01-01T00:00:00Z',
  }, {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'DUPLICADO@example.com',
    created_at: '2026-01-01T00:00:00Z',
  }]));
});
