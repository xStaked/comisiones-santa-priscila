import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

test.describe('Comisionistas', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('navegar a comisionistas y crear uno nuevo', async ({ page }) => {
    await page.goto('/comisionistas');

    // Verificar carga de la página
    await expect(page.getByPlaceholder('Buscar comisionista...')).toBeVisible();
    await expect(page.getByRole('button', { name: /Nuevo Comisionista/i })).toBeVisible();

    // Abrir diálogo de creación
    await page.getByRole('button', { name: /Nuevo Comisionista/i }).click();
    await expect(page.locator('text=Nuevo Comisionista').first()).toBeVisible();

    // Llenar formulario
    const nombreUnico = `Comisionista E2E ${Date.now()}`;
    await page.fill('#nombre', nombreUnico);

    // Llenar tarifa (porcentaje por defecto)
    await page.locator('input[type="number"]').first().fill('2.5');

    // Guardar
    await page.getByRole('button', { name: /Crear Comisionista/i }).click();

    // Verificar toast de éxito y presencia en lista
    await expect(page.getByText('Comisionista creado')).toBeVisible();
    await expect(page.getByText(nombreUnico)).toBeVisible();
  });
});
