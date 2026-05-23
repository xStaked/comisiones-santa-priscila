import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

test.describe('Órdenes', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('carga básica de la página de órdenes', async ({ page }) => {
    await page.goto('/ordenes');
    await expect(page).toHaveURL('/ordenes');

    // Verificar pestaña activa en el header
    await expect(page.getByRole('link', { name: /Cargar Órdenes/i })).toBeVisible();

    // Verificar tarjeta de carga
    await expect(page.getByText('Cargar Orden de Compra')).toBeVisible();

    // Verificar botones de modo de carga
    await expect(page.getByRole('button', { name: /Manual/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cargar archivo/i })).toBeVisible();
  });
});
