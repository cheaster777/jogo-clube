import { expect, test } from 'playwright/test';

const userId = '00000000-0000-4000-8000-000000000001';
const matchId = '00000000-0000-4000-8000-000000000010';
const savedKey = `clube:partida-online:${userId}`;
const identity = {
  user: { id: userId, email: 'online@example.com', email_verified: true },
  profile: { id: userId, full_name: 'Ana', created_at: '2026-01-01T00:00:00Z' },
  session: { expires_at: '2099-01-01T00:00:00Z' },
};
const snapshot = {
  version: 7,
  state: {
    viewerSeat: 1,
    players: [
      { id: 0, name: 'Outro jogador', hand: [], handCount: 5, score: 30, isBot: false },
      { id: 1, name: 'Ana', hand: [], handCount: 0, score: 0, isBot: false },
    ],
    familyDeckCount: 90, actionDeckCount: 20, currentPlayerIndex: 1,
    currentRound: 2, phase: 'playing', lastAction: null, actionMessage: '',
  },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/me', route => route.fulfill({ json: identity }));
});

test('retoma a sala pelo servidor e usa a versão atual para a próxima jogada', async ({ page }) => {
  await page.addInitScript(({ key, id }) => sessionStorage.setItem(key, id), { key: savedKey, id: matchId });
  await page.route(`**/api/v1/matches/${matchId}`, route => route.fulfill({ json: snapshot }));
  let command: Record<string, unknown>;
  await page.route(`**/api/v1/matches/${matchId}/commands`, async route => {
    command = route.request().postDataJSON();
    await route.fulfill({ json: { version: 8, state: { ...snapshot.state, phase: 'action', lastAction: { id: 'action-1', type: 'action', title: 'Pesca científica', category: 'mitigation', description: 'Uma carta foi pescada.', image: '/assets/images/logo-clube.webp' }, actionMessage: 'Ana pescou 1 carta.' } } });
  });
  await page.goto('/');
  await expect(page.locator('#btn-draw-action')).toBeVisible();
  await page.locator('#btn-draw-action').click();
  await expect.poll(() => command?.expected_version).toBe(7);
  expect(command.type).toBe('DRAW_ACTION');
  await expect(page.locator('#btn-next-turn')).toBeVisible();
});

test('remove sala inacessível da retomada e permite iniciar outra', async ({ page }) => {
  await page.addInitScript(({ key, id }) => sessionStorage.setItem(key, id), { key: savedKey, id: matchId });
  await page.route(`**/api/v1/matches/${matchId}`, route => route.fulfill({ status: 403, json: { message: 'Você não participa desta sala.' } }));
  await page.goto('/');
  await expect(page.locator('#setup-panel')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Você não participa desta sala.');
  expect(await page.evaluate(key => sessionStorage.getItem(key), savedKey)).toBeNull();
  await expect(page.locator('#btn-init-game')).toBeEnabled();
});

test('não retoma sala salva por outra conta', async ({ page }) => {
  await page.addInitScript(id => sessionStorage.setItem('clube:partida-online:outra-conta', id), matchId);
  let matchRequests = 0;
  await page.route('**/api/v1/matches/**', route => { matchRequests++; return route.abort(); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Começar Expedição' })).toBeVisible();
  expect(matchRequests).toBe(0);
});

for (const action of ['verify', 'reset']) {
  test(`abre link ${action} com sessão ativa e conclui o fluxo`, async ({ page }) => {
    const endpoint = action === 'verify' ? 'email-verification' : 'password-reset';
    await page.route(`**/api/v1/auth/${endpoint}/confirm`, route => route.fulfill({ json: action === 'verify' ? identity : {} }));
    await page.goto(`/#${action}=token-de-teste-com-mais-de-16-caracteres`);
    await expect(page.getByRole('heading', { name: action === 'verify' ? 'Confirmar Email' : 'Nova Senha' })).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    if (action === 'reset') {
      await page.locator('#new-password').fill('SenhaNova123!');
      await page.locator('#new-password-confirm').fill('SenhaNova123!');
    }
    await page.getByRole('button', { name: action === 'verify' ? 'Confirmar email' : 'Atualizar senha', exact: true }).click();
    await page.getByRole('button', { name: 'Voltar ao jogo' }).click();
    await expect(page.getByRole('button', { name: 'Começar Expedição' })).toBeVisible();
  });
}

test('recuperar senha com sessão revogada permite entrar novamente', async ({ page }) => {
  let revoked = false;
  await page.route('**/api/v1/me', route => route.fulfill(revoked
    ? { status: 401, json: { message: 'Sua sessão expirou.' } }
    : { json: identity }));
  await page.route('**/api/v1/auth/password-reset/confirm', route => {
    revoked = true;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/v1/auth/login', route => route.fulfill({ json: identity }));
  await page.goto('/#reset=token-de-recuperacao-com-16-caracteres');
  await page.locator('#new-password').fill('SenhaNova123!');
  await page.locator('#new-password-confirm').fill('SenhaNova123!');
  await page.getByRole('button', { name: 'Atualizar senha', exact: true }).click();
  await page.getByRole('button', { name: 'Ir para Login' }).click();
  await page.locator('#login-email').fill('online@example.com');
  await page.locator('#login-password').fill('SenhaNova123!');
  await page.locator('#btn-login').click();
  await expect(page.getByRole('button', { name: 'Começar Expedição' })).toBeVisible();
});
