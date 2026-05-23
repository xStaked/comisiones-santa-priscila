import { test, expect } from '@playwright/test';
import { loginViaUI, TEST_USERNAME, TEST_PASSWORD } from './helpers/auth';

test.describe('Autenticación', () => {
  test('login con credenciales válidas redirige al dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', TEST_USERNAME);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await expect(page.locator('h1', { hasText: 'Dinacuamar' })).toBeVisible();
  });

  test('login con credenciales inválidas muestra error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'usuario_invalido');
    await page.fill('#password', 'clave_incorrecta');
    await page.click('button[type="submit"]');
    await expect(page.getByText('Credenciales inválidas')).toBeVisible();
  });

  test('acceder a ruta protegida sin autenticación redirige a login', async ({ page }) => {
    await page.goto('/comisionistas');
    await page.waitForURL('/login');
    await expect(page.locator('#username')).toBeVisible();
  });

  test('logout elimina el token y redirige a login', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/');

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Salir/i }).click();

    await page.waitForURL('/login');
    await expect(page.locator('#username')).toBeVisible();
  });
});
