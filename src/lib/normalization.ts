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
    .filter((token) => !['ADM', 'ADMINISTRACION', 'SECTOR', 'SECTORES'].includes(token))
    .map((token) => (token === 'GOLDO' ? 'GOLFO' : token))
    .join(' ');
}

// Umbrales difusos — mantener sincronizados con backend/app/services/fuzzy_matching.py
export const UMBRAL_FINCA = 0.80;
export const UMBRAL_PRODUCTO = 0.85;
export const UMBRAL_CLIENTE = 0.85;
export const UMBRAL_TOKEN = 0.85;
const MARGEN_AMBIGUEDAD = 0.02;

// Ratio difflib SequenceMatcher (paridad con Python). 2*M / T donde M = chars coincidentes en bloques contiguos.
export function ratioDifflib(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const getMatchingBlocks = (s1: string, s2: string): number => {
    // DP para longest common substring entre s1 y s2
    const m = s1.length;
    const n = s2.length;
    // encontrar el bloque más largo
    let maxLen = 0;
    let aStart = 0;
    let bStart = 0;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
          if (dp[i][j] > maxLen) {
            maxLen = dp[i][j];
            aStart = i - maxLen;
            bStart = j - maxLen;
          }
        }
      }
    }
    if (maxLen === 0) return 0;
    // recursivo en prefijo y sufijo
    const left = getMatchingBlocks(s1.slice(0, aStart), s2.slice(0, bStart));
    const right = getMatchingBlocks(s1.slice(aStart + maxLen), s2.slice(bStart + maxLen));
    return maxLen + left + right;
  };
  const matched = getMatchingBlocks(a, b);
  return (2 * matched) / (a.length + b.length);
}

/**
 * Coincidencia difusa SEGURA.
 *
 * Solo acepta diferencias que parezcan un typo dentro de una misma palabra.
 * Nunca acepta que una palabra completa se sustituya por otra: AGUA no es
 * SALUD, PAST TH no es PASTILLAS GRANDES, CORVINERO A no es CORVINERO C.
 * Esas variantes se resuelven por ID o por nombre normalizado exacto.
 *
 * Paridad obligatoria con backend/app/services/fuzzy_matching.py.
 */
export function esCoincidenciaSegura(
  a: string,
  b: string,
  umbralGlobal: number,
  umbralToken = UMBRAL_TOKEN
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (ratioDifflib(a, b) < umbralGlobal) return false;

  const tokensA = a.replace(/[-/]/g, ' ').split(' ').filter(Boolean);
  const tokensB = b.replace(/[-/]/g, ' ').split(' ').filter(Boolean);
  if (tokensA.length !== tokensB.length) return false;

  for (let i = 0; i < tokensA.length; i++) {
    const ta = tokensA[i];
    const tb = tokensB[i];
    if (ta === tb) continue;
    const maxLen = Math.max(ta.length, tb.length);
    const minLen = Math.min(ta.length, tb.length);
    // Un typo no cambia drásticamente el largo de la palabra.
    if (minLen < maxLen * 0.6) return false;
    if (ratioDifflib(ta, tb) < umbralToken) return false;
  }
  return true;
}

export function similitudFinca(a: string, b: string): number {
  const na = normalizarNombreFinca(a) || '';
  const nb = normalizarNombreFinca(b) || '';
  return ratioDifflib(na, nb);
}

function mejorCoincidenciaSegura(
  objetivo: string,
  candidatos: { original: string; normalizado: string }[],
  umbral: number
): { nombre: string; ratio: number } | null {
  let mejor: { nombre: string; ratio: number } | null = null;
  let empatados = 0;

  for (const candidato of candidatos) {
    if (!candidato.normalizado) continue;
    if (!esCoincidenciaSegura(objetivo, candidato.normalizado, umbral)) continue;

    const ratio = ratioDifflib(objetivo, candidato.normalizado);
    if (!mejor || ratio > mejor.ratio + 1e-9) {
      mejor = { nombre: candidato.original, ratio };
      empatados = 1;
    } else if (Math.abs(ratio - mejor.ratio) <= MARGEN_AMBIGUEDAD) {
      empatados++;
    }
  }

  return mejor && empatados === 1 ? mejor : null;
}

export function buscarFincaCercana(
  nombre: string,
  candidatos: string[],
  umbral = UMBRAL_FINCA
): { nombre: string; ratio: number } | null {
  const objetivo = normalizarNombreFinca(nombre) || '';
  if (!objetivo) return null;
  // exacto primero
  for (const c of candidatos) {
    if ((normalizarNombreFinca(c) || '') === objetivo) return { nombre: c, ratio: 1 };
  }
  return mejorCoincidenciaSegura(
    objetivo,
    candidatos.map((c) => ({ original: c, normalizado: normalizarNombreFinca(c) || '' })),
    umbral
  );
}

export function buscarProductoCercano(
  nombre: string,
  candidatos: string[],
  umbral = UMBRAL_PRODUCTO
): { nombre: string; ratio: number } | null {
  const objetivo = normalizarNombreProducto(nombre) || '';
  if (!objetivo) return null;
  for (const c of candidatos) {
    if ((normalizarNombreProducto(c) || '') === objetivo) return { nombre: c, ratio: 1 };
  }
  return mejorCoincidenciaSegura(
    objetivo,
    candidatos.map((c) => ({ original: c, normalizado: normalizarNombreProducto(c) || '' })),
    umbral
  );
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

  const tokens = normalizado.split(' ');
  const tienePastillas = /\bPASTILLAS?\b/.test(normalizado);
  if (tienePastillas) {
    // Las facturas pueden omitir el prefijo ECU-BACILLUS y escribir solo
    // "PASTILLAS TH" / "PASTILLAS GRANDES". La variante manda.
    if (tokens.includes('TH')) {
      return 'PAST TH';
    }
    if (tokens.includes('ALIMENTADOR') || tokens.includes('ALIMENTACION') || tokens.includes('ALIM')) {
      return 'PAST ALIM';
    }
    if (/\bGRANDES?\b/.test(normalizado)) {
      return 'ECU BACILLUS SUELO PASTILLA';
    }
  }

  if (esEcuBacillus) {
    if (tienePastillas) {
      // "ECU-BACILLUS PASTILLAS" sin variante: el catálogo lo llama
      // PASTILLAS GRANDES.
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
  if (normalizado === 'PAST GRAN' || normalizado === 'PAST GRANDES') {
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
