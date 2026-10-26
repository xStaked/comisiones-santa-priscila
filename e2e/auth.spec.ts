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

  test('no consulta endpoints protegidos antes de iniciar sesión', async ({ page }) => {
    const llamadas: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/')) llamadas.push(request.url());
    });

    await page.goto('/login');
    await page.waitForTimeout(2000);

    expect(llamadas).toEqual([]);
  });

  test('carga los catálogos al primer login en un navegador nuevo', async ({ page }) => {
    // Regresión: antes las consultas corrían en /login sin token, fallaban con
    // 403 y no se repetían al entrar; todo quedaba en cero hasta recargar.
    const catalogo = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/comisionistas/') &&
        response.request().method() === 'GET'
    );

    await loginViaUI(page);

    const respuesta = await catalogo;
    expect(respuesta.status()).toBe(200);
    await expect(page.getByText('Cargando datos…')).toHaveCount(0);
  });
});
