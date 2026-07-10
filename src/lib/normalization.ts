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

// ponytail: lista corta de sufijos vistos en órdenes reales; ampliar si aparece otro
const SUFIJOS_SOCIETARIOS = new Set(['CIA', 'LTDA', 'SA', 'S', 'A', 'CA', 'SAS']);

/**
 * Clave de matching para razones sociales: ignora tildes, puntuación y
 * sufijos societarios finales (CIA. LTDA., S.A., ...) para unificar variantes
 * de la misma empresa que vienen distintas en cada PDF.
 */
export function normalizarRazonSocial(valor?: string): string {
  const tokens = (normalizarTexto(valor) ?? '').split(' ').filter(Boolean);
  while (tokens.length && SUFIJOS_SOCIETARIOS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
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
    // Las facturas escriben PASTILLAS en plural: sin la S opcional, C1TH y
    // C1PA caían al fallback SUELO, que es otro producto con otra tarifa.
    if (/\bPASTILLAS?\b/.test(normalizado)) {
      if (/\bTH\b/.test(normalizado)) {
        return 'PAST TH';
      }
      if (/\b(ALIMENTADOR|ALIMENTACION|ALIM)\b/.test(normalizado)) {
        return 'PAST ALIM';
      }
      // "PASTILLAS GRANDES" y "SUELO PASTILLA" son el mismo producto: cada
      // cliente lo tiene cargado con un nombre distinto en su sistema.
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
  if (['PAST TH', 'PAST ALIM'].includes(normalizado)) {
    return normalizado;
  }
  if (normalizado === 'PAST GRAN') {
    return 'ECU BACILLUS SUELO PASTILLA';
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
