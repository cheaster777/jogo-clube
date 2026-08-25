import { expect, test } from 'playwright/test';

test('jogador consegue iniciar e executar uma rodada local', async ({ page }) => {
  // O produto exige autenticação mesmo para partidas locais. O smoke test não
  // precisa de uma API real: ele valida somente o fluxo visual do jogo e usa
  // uma sessão estável para atravessar o gate de autenticação.
  await page.route('**/api/v1/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'e2e@example.com',
          email_verified: true,
        },
        profile: {
          id: '00000000-0000-4000-8000-000000000001',
          full_name: 'Jogador E2E',
          created_at: '2026-01-01T00:00:00.000Z',
        },
        session: {
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      }),
    });
  });

  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Começar Expedição' })).toBeVisible();
  await page.getByRole('button', { name: 'Começar Expedição' }).click();
  await expect(page.locator('#setup-panel')).toBeVisible();

  await page.locator('#btn-init-game').click();
  await expect(page.locator('#btn-draw-action')).toBeVisible();
  await page.locator('#btn-draw-action').click();
  await expect(page.locator('#btn-next-turn')).toBeVisible();
  await page.locator('#btn-next-turn').click();

  await expect(page.getByText(/Expedição Atual/)).toBeVisible();
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});
