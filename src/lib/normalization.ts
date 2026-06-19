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
    if (/\bPASTILLA\b/.test(normalizado) && /\bTH\b/.test(normalizado)) {
      return 'PAST TH';
    }
    if (/\bPASTILLAS\b/.test(normalizado) && /\bGRANDES\b/.test(normalizado)) {
      return 'PAST GRAN';
    }
    if (/\bPASTILLA\b/.test(normalizado)) {
      return 'ECU BACILLUS SUELO PASTILLA';
    }
    if (normalizado.includes('ALIMENTACION') || normalizado.includes('ALIM')) {
      return 'PAST ALIM';
    }
    if (normalizado.includes('AGUA')) {
      return 'ECU-BACILLUS AGUA';
    }
    if (normalizado.includes('SALUD')) {
      return 'ECU-BACILLUS SALUD';
    }
    if (normalizado.includes('SUELO') || normalizado.includes('POLVO')) {
      return 'ECU-BACILLUS SUELO';
    }
  }

  // Abreviaturas sueltas que aparecen en PDFs / Excel de tarifas
  if (
    ['PAST TH', 'PAST GRAN', 'PAST ALIM'].includes(normalizado)
  ) {
    return normalizado;
  }
  if (normalizado === 'AGUA' || normalizado === 'ECU BACILLUS AGUA') {
    return 'ECU-BACILLUS AGUA';
  }
  if (normalizado === 'SALUD' || normalizado === 'ECU BACILLUS SALUD') {
    return 'ECU-BACILLUS SALUD';
  }
  if (
    normalizado === 'SUELO' ||
    normalizado === 'POLVO' ||
    normalizado === 'SUELO POLVO' ||
    normalizado === 'SUELO / POLVO' ||
    normalizado === 'ECU BACILLUS SUELO' ||
    normalizado === 'ECU BACILLUS SUELO POLVO'
  ) {
    return 'ECU-BACILLUS SUELO';
  }

  if (/\bNATUXTRACT\b/.test(normalizado)) {
    return 'NATUXTRACT';
  }
  if (/\bCITRIUS\b/.test(normalizado)) {
    return 'CITRIUS';
  }
  if (
    /\bCALCINIT\b/.test(normalizado) ||
    (/\bNITRATO\b/.test(normalizado) && /\bCALCIO\b/.test(normalizado))
  ) {
    return 'CALCINIT';
  }
  if (/\bMORTAL\b/.test(normalizado) && normalizado.split(' ').includes('C')) {
    return 'MORTAL C';
  }

  // Fallback legacy
  if (normalizado.includes('PASTILLA') && normalizado.includes('TH')) {
    return 'PAST TH';
  }

  return normalizado;
}
