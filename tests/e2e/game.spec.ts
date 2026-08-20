import { expect, test } from 'playwright/test';

test('jogador consegue iniciar e executar uma rodada local', async ({ page }) => {
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
