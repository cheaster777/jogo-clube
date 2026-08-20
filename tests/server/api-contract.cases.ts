import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cookieFromSetCookie,
  jsonRequest,
  withHarness,
} from './api-harness';

const userOneCookie = '__Host-session=token-one';
const userTwoCookie = '__Host-session=token-two';

async function createMatch(harness: Parameters<typeof jsonRequest>[0], cookie = userOneCookie, mode: 'local' | 'online' = 'local') {
  const response = await jsonRequest(harness, '/api/v1/matches', {
    method: 'POST',
    cookie,
    body: { mode, playerCount: 2, playerNames: ['Ana', 'Beto'] },
  });
  assert.equal(response.status, 201);
  return response.body as { id: string; version: number };
}

test('contrato de autenticação usa sessão em cookie e rejeita acesso anônimo', async () => {
  await withHarness(async harness => {
    const anonymous = await jsonRequest(harness, '/api/v1/me');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error.code, 'UNAUTHORIZED');

    const login = await jsonRequest(harness, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: ' ANA@EXAMPLE.COM ', password: 'Senha-forte-123' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.email, 'ana@example.com');
    assert.equal(login.body.session.expires_at !== null, true);
    assert.equal(login.body.session.token, undefined);
    assert.match(login.setCookie, /__Host-session=/);
    assert.match(login.setCookie, /Path=\//);
    assert.match(login.setCookie, /HttpOnly/);
    assert.match(login.setCookie, /Secure/);
    assert.match(login.setCookie, /SameSite=Lax/);

    const sessionCookie = cookieFromSetCookie(login.setCookie);
    const me = await jsonRequest(harness, '/api/v1/me', { cookie: sessionCookie });
    assert.equal(me.status, 200);
    assert.deepEqual(me.body.user, {
      id: 'user-1',
      email: 'ana@example.com',
      email_verified: true,
    });

    const logout = await jsonRequest(harness, '/api/v1/auth/logout', {
      method: 'POST',
      cookie: sessionCookie,
    });
    assert.equal(logout.status, 204);
    const afterLogout = await jsonRequest(harness, '/api/v1/me', { cookie: sessionCookie });
    assert.equal(afterLogout.status, 401);
  });
});

test('autorização limita partidas ao participante e oculta mãos alheias', async () => {
  await withHarness(async harness => {
    const match = await createMatch(harness);
    const forbidden = await jsonRequest(harness, `/api/v1/matches/${match.id}`, { cookie: userTwoCookie });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, 'FORBIDDEN');

    const ownView = await jsonRequest(harness, `/api/v1/matches/${match.id}`, { cookie: userOneCookie });
    assert.equal(ownView.status, 200);
    assert.equal(ownView.body.state.viewerSeat, 0);
    assert.equal(ownView.body.state.players[0].hand.length, 7);
    assert.equal(ownView.body.state.players[1].hand.length, 0);
    assert.equal(ownView.body.state.players[1].handCount, 7);
    assert.equal('seed' in ownView.body.state, false);
  });
});

test('payload de score adulterado não é aceito nem persistido no evento', async () => {
  await withHarness(async harness => {
    const match = await createMatch(harness);
    const command = await jsonRequest(harness, `/api/v1/matches/${match.id}/commands`, {
      method: 'POST',
      cookie: userOneCookie,
      body: {
        command_id: 'tamper-score-1',
        expected_version: 0,
        type: 'DRAW_ACTION',
        score: 999999,
        families_count: 999,
        quality_diagnosis: 'falsificado',
      },
    });
    assert.equal(command.status, 200);
    assert.equal(JSON.stringify(harness.database.events).includes('999999'), false);
    assert.equal(JSON.stringify(command.body).includes('999999'), false);
    assert.equal(command.body.state.players.every((player: any) => player.score < 999999), true);

    const legacyScoreCommand = await jsonRequest(harness, `/api/v1/matches/${match.id}/commands`, {
      method: 'POST',
      cookie: userOneCookie,
      body: {
        command_id: 'tamper-score-2',
        expected_version: command.body.version,
        type: 'SAVE_SCORE',
        score: 999999,
      },
    });
    assert.equal(legacyScoreCommand.status, 400);
    assert.equal(legacyScoreCommand.body.error.code, 'VALIDATION_ERROR');
  });
});

test('replay do mesmo command_id é idempotente e não duplica versão ou evento', async () => {
  await withHarness(async harness => {
    const match = await createMatch(harness);
    const payload = { command_id: 'replay-1', expected_version: 0, type: 'DRAW_ACTION' };
    const first = await jsonRequest(harness, `/api/v1/matches/${match.id}/commands`, {
      method: 'POST', cookie: userOneCookie, body: payload,
    });
    const replay = await jsonRequest(harness, `/api/v1/matches/${match.id}/commands`, {
      method: 'POST', cookie: userOneCookie, body: payload,
    });

    assert.equal(first.status, 200);
    assert.equal(first.body.duplicate, false);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.duplicate, true);
    assert.equal(replay.body.version, first.body.version);
    assert.deepEqual(replay.body.state, first.body.state);
    assert.equal(harness.database.events.length, 1);
    assert.equal(harness.database.snapshots.length, 2);
    assert.equal(harness.database.matches[0].stateVersion, 1);
  });
});

test('expected_version rejeita concorrência obsoleta com conflito determinístico', async () => {
  await withHarness(async harness => {
    const match = await createMatch(harness);
    const requests = ['race-a', 'race-b'].map(command_id => jsonRequest(
      harness,
      `/api/v1/matches/${match.id}/commands`,
      {
        method: 'POST',
        cookie: userOneCookie,
        body: { command_id, expected_version: 0, type: 'DRAW_ACTION' },
      },
    ));
    const results = await Promise.all(requests);
    assert.deepEqual(results.map(result => result.status).sort((a, b) => a - b), [200, 409]);
    const stale = results.find(result => result.status === 409)!;
    assert.equal(stale.body.error.code, 'CONFLICT');
    assert.equal(stale.body.error.details.currentVersion, 1);
    assert.equal(harness.database.events.length, 1);
    assert.equal(harness.database.matches[0].stateVersion, 1);
  });
});

test('eventos permitem recuperar a partida após reconexão e mantêm os clientes consistentes', async () => {
  await withHarness(async harness => {
    const match = await createMatch(harness, userOneCookie, 'online');
    const joined = await jsonRequest(harness, `/api/v1/matches/${match.id}/join`, {
      method: 'POST',
      cookie: userTwoCookie,
      body: { displayName: 'Beto conectado' },
    });
    assert.equal(joined.status, 200);

    const beforeOne = await jsonRequest(harness, `/api/v1/matches/${match.id}`, { cookie: userOneCookie });
    const beforeTwo = await jsonRequest(harness, `/api/v1/matches/${match.id}`, { cookie: userTwoCookie });
    assert.equal(beforeOne.body.version, 0);
    assert.equal(beforeTwo.body.version, 0);
    assert.deepEqual(
      [beforeOne.body.state.currentPlayerIndex, beforeOne.body.state.actionDeckCount],
      [beforeTwo.body.state.currentPlayerIndex, beforeTwo.body.state.actionDeckCount],
    );
    assert.equal(beforeTwo.body.state.viewerSeat, 1);

    const command = await jsonRequest(harness, `/api/v1/matches/${match.id}/commands`, {
      method: 'POST', cookie: userOneCookie,
      body: { command_id: 'reconnect-1', expected_version: 0, type: 'DRAW_ACTION' },
    });
    assert.equal(command.status, 200);

    const catchUp = await jsonRequest(harness, `/api/v1/matches/${match.id}/events?afterVersion=0`, {
      cookie: userTwoCookie,
    });
    assert.equal(catchUp.status, 200);
    assert.equal(catchUp.body.currentVersion, 1);
    assert.equal(catchUp.body.events.length, 1);
    assert.equal(catchUp.body.events[0].version, 1);
    assert.equal(catchUp.body.events[0].payload.commandType, 'DRAW_ACTION');
    assert.equal('email' in catchUp.body.events[0], false);

    const reconnected = await jsonRequest(harness, `/api/v1/matches/${match.id}`, { cookie: userTwoCookie });
    assert.equal(reconnected.status, 200);
    assert.equal(reconnected.body.version, command.body.version);
    assert.deepEqual(
      [reconnected.body.state.currentPlayerIndex, reconnected.body.state.actionDeckCount],
      [command.body.state.currentPlayerIndex, command.body.state.actionDeckCount],
    );
    const noGap = await jsonRequest(harness, `/api/v1/matches/${match.id}/events?afterVersion=1`, {
      cookie: userTwoCookie,
    });
    assert.deepEqual(noGap.body.events, []);
  });
});

test('ranking usa paginação e não expõe email ou campos internos', async () => {
  await withHarness(async harness => {
    const ranking = await jsonRequest(harness, '/api/v1/leaderboard?limit=1&offset=0');
    assert.equal(ranking.status, 200);
    assert.equal(Array.isArray(ranking.body), true);
    assert.deepEqual(Object.keys(ranking.body[0]).sort(), [
      'full_name', 'played_at', 'quality_category', 'score',
    ].sort());
    assert.equal(JSON.stringify(ranking.body).includes('@'), false);
    const query = harness.database.queryLog.find(item => item.sql.startsWith('SELECT gs.score'))!;
    assert.deepEqual(query.params, [1, 0]);
  });
});
