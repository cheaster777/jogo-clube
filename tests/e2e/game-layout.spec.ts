import { expect, test } from 'playwright/test';
import { createLocalGame, dispatchLocalCommand } from '../../src/game/localAdapter';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/me', route => route.fulfill({ json: {
    user: { id: '00000000-0000-4000-8000-000000000001', email: 'ui@example.com', email_verified: true },
    profile: { id: '00000000-0000-4000-8000-000000000001', full_name: 'Ana' },
    session: { expires_at: '2099-01-01T00:00:00.000Z' },
  } }));
});

for (const kind of ['rules', 'about'] as const) {
  test(`${kind}: teclado fica no diálogo e o fundo preserva posição`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Ver detalhes e descrição científica/ }).first().scrollIntoViewIfNeeded();
    const trigger = page.locator(kind === 'rules' ? '#btn-rules' : '#btn-about-fab');
    await trigger.focus();
    await trigger.press('Enter');
    const dialog = page.getByRole('dialog');
    const first = dialog.getByRole('button').first();
    const last = dialog.getByRole('button').last();
    await expect(first).toBeFocused();
    const position = await page.evaluate(() => scrollY);
    await page.keyboard.press('Shift+Tab');
    await expect(last).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await page.mouse.move(4, 250);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => scrollY)).toBe(position);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(position);
  });
}

test('resultado da ação cabe antes da barra móvel e texto ampliado não cria rolagem lateral', async ({ page }) => {
  const game = dispatchLocalCommand(createLocalGame({
    seed: 'strict-ui',
    players: ['Ana', 'Beatriz', 'Gabriel', 'João Pedro'].map(name => ({ name, isBot: false })),
  }), { type: 'DRAW_ACTION' });
  await page.addInitScript(game => sessionStorage.setItem('clube:partida-local', JSON.stringify(game)), game);
  await page.goto('/');
  const result = page.locator('.action-card .font-bold.text-sm').first();
  await expect(result).toBeVisible();
  const bar = page.locator('#btn-next-turn-bar');
  const resultBox = await result.boundingBox();
  const barBox = await bar.boundingBox();
  expect(resultBox!.y + resultBox!.height).toBeLessThan(barBox!.y);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const buttonBox = await bar.boundingBox();
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(320);
  expect(await bar.evaluate(button => button.scrollWidth <= button.clientWidth)).toBe(true);
});

test('início e catálogo permanecem dentro da tela com texto a 200%', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#btn-start')).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(page.locator('#about')).toHaveCount(1);
  const card = page.getByRole('button', { name: /Ver detalhes e descrição científica/ }).first();
  await card.scrollIntoViewIfNeeded();
  await card.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
