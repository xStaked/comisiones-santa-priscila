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

  test('crea orden pendiente y permite liquidarla solo al marcarla pagada', async ({ page }) => {
    const numeroOrden = `E2E-PAGO-${Date.now()}`;

    await page.goto('/ordenes');

    await page.getByPlaceholder('#001').fill(numeroOrden);
    await page.getByPlaceholder('Finca A').fill('Finca E2E');
    await page.getByPlaceholder('Producto').fill('Producto E2E');
    await page.getByPlaceholder('0').fill('10');
    await page.getByPlaceholder('0.00').fill('5');
    await page.getByRole('button', { name: /Agregar Registro/i }).click();

    const filaOrden = page.getByRole('row').filter({ hasText: numeroOrden }).first();
    await expect(filaOrden).toContainText('Pendiente');

    await page.goto('/liquidacion');
    const filtroFactura = page.getByPlaceholder('Número de factura...');
    if (await filtroFactura.isVisible().catch(() => false)) {
      await filtroFactura.fill(numeroOrden);
      await expect(page.getByText('No hay registros con el filtro seleccionado')).toBeVisible();
    } else {
      await expect(page.getByText('Sin órdenes pagadas')).toBeVisible();
    }

    await page.goto('/ordenes');
    const filaPendiente = page.getByRole('row').filter({ hasText: numeroOrden }).first();
    await filaPendiente.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Pagada' }).click();
    await expect(filaPendiente).toContainText('Pagada');

    await page.goto('/liquidacion');
    await expect(page.getByText('Vista de Liquidación')).toBeVisible();
    await page.getByPlaceholder('Número de factura...').fill(numeroOrden);
    await expect(page.getByText(numeroOrden)).toBeVisible();
    await expect(page.getByText('Sin órdenes pagadas')).toHaveCount(0);
  });
});
