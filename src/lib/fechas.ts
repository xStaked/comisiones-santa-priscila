/**
 * Helpers de la fecha de carga de las facturas (created_at de la orden
 * cabecera que expone el backend). Se comparten entre Facturas y Liquidación
 * para que la columna y el filtro muestren siempre lo mismo.
 */

/** dd/mm/aaaa en hora local; '—' si el registro no tiene fecha de carga (legacy). */
export function formatearFechaCarga(iso?: string | null): string {
  if (!iso) return '—';
  // Serializaciones sin 'T' (SQLite) no se parsean en todos los navegadores.
  const fecha = new Date(iso.replace(' ', 'T'));
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-ES');
}

/** Fecha y hora locales, para el tooltip de la columna Carga. */
export function formatearFechaHoraCarga(iso?: string | null): string {
  if (!iso) return '';
  const fecha = new Date(iso.replace(' ', 'T'));
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleString('es-ES');
}

/** YYYY-MM-DD en hora local del navegador, comparable con los <input type="date">.
 *  Al comparar por fecha local se evita el corrimiento de un día por UTC. */
export function fechaLocalISO(iso?: string | null): string {
  if (!iso) return '';
  const fecha = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(fecha.getTime())) return '';
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}
