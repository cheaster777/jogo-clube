import { expect, test } from 'playwright/test';

test('detalhes da carta preservam a posição da página e devolvem o foco', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route('**/api/v1/me', route => route.fulfill({
    json: {
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'e2e@example.com', email_verified: true },
      profile: { id: '00000000-0000-4000-8000-000000000001', full_name: 'Jogador E2E' },
      session: { expires_at: '2099-01-01T00:00:00.000Z' },
    },
  }));
  await page.goto('/');
  const card = page.getByRole('button', { name: /Ver detalhes e descrição científica/ }).first();
  await card.scrollIntoViewIfNeeded();
  await card.focus();
  await card.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const closeButton = dialog.getByRole('button', { name: 'Fechar', exact: true }).first();
  await expect(closeButton).toBeFocused();
  const pagePosition = await page.evaluate(() => window.scrollY);
  await page.mouse.move(180, 300);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(pagePosition);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(pagePosition);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(pagePosition);
});
