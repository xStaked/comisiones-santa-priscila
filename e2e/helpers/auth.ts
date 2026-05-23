import { Page } from '@playwright/test';

export const TEST_USERNAME = process.env.TEST_USERNAME || 'admin';
export const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin';

/**
 * Inicia sesión a través de la UI de login.
 * Requiere que el backend esté corriendo en localhost:8000.
 */
export async function loginViaUI(
  page: Page,
  username = TEST_USERNAME,
  password = TEST_PASSWORD
) {
  await page.goto('/login');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
}

/**
 * Coloca un token JWT directamente en localStorage y recarga la página.
 * Útil cuando ya se dispone de un token válido y se quiere saltar el flujo de login.
 */
export async function seedAuthState(page: Page, accessToken: string) {
  await page.goto('/login');
  await page.evaluate((token) => {
    localStorage.setItem('access_token', token);
  }, accessToken);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}
