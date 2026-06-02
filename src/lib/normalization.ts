/**
 * Funciones de normalización de texto para matching de entidades.
 *
 * ⚠️ DEBEN MANTENERSE SINCRONIZADAS con:
 *    backend/app/services/catalog_normalization.py
 *
 * Cualquier cambio en la lógica de normalización debe replicarse en ambos
 * lados para garantizar que el matching de tarifas específicas funcione
 * consistentemente entre la vista previa (frontend) y el cálculo persistido
 * (backend).
 */

export function normalizarTexto(valor?: string): string | undefined {
  return valor
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-ES')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizarNombreFinca(valor?: string): string | undefined {
  return normalizarTexto(valor)
    ?.split(' ')
    .filter((token) => token !== 'ADM' && token !== 'ADMINISTRACION')
    .map((token) => (token === 'GOLDO' ? 'GOLFO' : token))
    .join(' ');
}

export function normalizarNombreProducto(valor?: string): string | undefined {
  const normalizado = normalizarTexto(valor);
  if (!normalizado) return undefined;

  // Familia ECU-BACILLUS (nombres largos y abreviaturas de PDF)
  const esEcuBacillus =
    normalizado.includes('ECU') &&
    (normalizado.includes('BACILLUS') ||
      normalizado.startsWith('ECU B ') ||
      normalizado.includes('ECU B'));

  if (esEcuBacillus) {
    if (normalizado.includes('PASTILLA') && normalizado.includes('TH')) {
      return 'PAST TH';
    }
    if (normalizado.includes('PASTILLAS') && normalizado.includes('GRANDES')) {
      return 'PAST GRAN';
    }
    if (normalizado.includes('ALIMENTACION') || normalizado.includes('ALIM')) {
      return 'PAST ALIM';
    }
    if (normalizado.includes('AGUA')) {
      return 'AGUA';
    }
    if (normalizado.includes('SALUD')) {
      return 'SALUD';
    }
    if (normalizado.includes('SUELO') || normalizado.includes('POLVO')) {
      return 'SUELO / POLVO';
    }
  }

  // Abreviaturas sueltas que aparecen en PDFs / Excel de tarifas
  if (
    ['PAST TH', 'PAST GRAN', 'PAST ALIM', 'AGUA', 'SALUD', 'SUELO / POLVO'].includes(
      normalizado
    )
  ) {
    return normalizado;
  }

  if (normalizado.includes('NATUXTRACT')) {
    return 'NATUXTRACT';
  }
  if (normalizado.includes('CITRIUS')) {
    return 'CITRIUS';
  }
  if (
    normalizado.includes('CALCINIT') ||
    (normalizado.includes('NITRATO') && normalizado.includes('CALCIO'))
  ) {
    return 'CALCINIT';
  }
  if (normalizado.includes('MORTAL') && normalizado.split(' ').includes('C')) {
    return 'MORTAL C';
  }

  // Fallback legacy
  if (normalizado.includes('PASTILLA') && normalizado.includes('TH')) {
    return 'PAST TH';
  }

  return normalizado;
}
