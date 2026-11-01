import { expect, test, type Page } from 'playwright/test';

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

async function stubAnonymousSession(page: Page) {
  await page.route('**/api/v1/me', route =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"unauthorized"}}' }),
  );
}

// Chromium fires this event only for an HTTPS origin that passes its install
// checks, so the test dispatches an equivalent event.
async function fireInstallEvent(page: Page) {
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        (window as unknown as { promptCalled: boolean }).promptCalled = true;
      },
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    window.dispatchEvent(event);
  });
}

test.describe('Android', () => {
  test.use({ userAgent: ANDROID_CHROME, viewport: { width: 390, height: 844 } });

  test('oferece a instalação e abre o prompt do navegador', async ({ page }) => {
    await stubAnonymousSession(page);
    await page.goto('/');

    await fireInstallEvent(page);
    const banner = page.getByTestId('pwa-banner');
    await expect(banner).toContainText('Instalar o Clube de Ciências?');

    await banner.getByRole('button', { name: 'Instalar', exact: true }).click();
    await expect(banner).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { promptCalled?: boolean }).promptCalled)).toBe(true);
  });

  test('não insiste depois de "Agora não"', async ({ page }) => {
    await stubAnonymousSession(page);
    await page.goto('/');
    await fireInstallEvent(page);
    await page.getByRole('button', { name: 'Agora não' }).click();
    await expect(page.getByTestId('pwa-banner')).toBeHidden();

    await page.reload();
    await fireInstallEvent(page);
    await expect(page.getByTestId('pwa-banner')).toBeHidden();
  });
});

test.describe('iPhone', () => {
  test.use({ userAgent: IPHONE_SAFARI, viewport: { width: 390, height: 844 } });

  test('mostra as instruções da Tela de Início', async ({ page }) => {
    await stubAnonymousSession(page);
    await page.goto('/');
    await expect(page.getByTestId('pwa-banner')).toContainText('Adicionar à Tela de Início');
  });
});

test('computador não vê o banner', async ({ page }) => {
  await stubAnonymousSession(page);
  await page.goto('/');
  await fireInstallEvent(page);
  await expect(page.getByTestId('pwa-banner')).toBeHidden();
});
