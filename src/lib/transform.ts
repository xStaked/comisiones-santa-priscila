/**
 * Transforma objetos snake_case a camelCase y viceversa.
 * Maneja arrays y objetos anidados recursivamente.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

const NUMERIC_RESPONSE_KEYS = new Set([
  'cantidad',
  'cantidadSnapshot',
  'precioUnitario',
  'precioUnitarioSnapshot',
  'total',
  'totalSnapshot',
  'valor',
  'valorSnapshot',
  'comision',
  'comisionCalculada',
  'totalComision',
  'totalOrden',
  'totalLiquidado',
  'totalVendido',
  'totalComisionadoEsteMes',
  'totalComisionadoHistorico',
  'totalComisionActivas',
  'totalVendidoHistorico',
  'totalVendidoActivas',
  'ventas',
  'retencionPorcentaje',
  'retencionPorcentajeSnapshot',
  'tachoKilos',
]);

function maybeParseNumericField(key: string, value: unknown): unknown {
  if (!NUMERIC_RESPONSE_KEYS.has(key) || typeof value !== 'string') {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

export function toCamelCase<T = any>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (isDate(obj)) return obj as T;
  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item)) as T;
  }
  if (isObject(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = snakeToCamel(key);
      result[camelKey] = maybeParseNumericField(camelKey, toCamelCase(value));
    }
    return result as T;
  }
  return obj as T;
}

export function toSnakeCase<T = any>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (isDate(obj)) return obj as T;
  if (Array.isArray(obj)) {
    return obj.map((item) => toSnakeCase(item)) as T;
  }
  if (isObject(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[camelToSnake(key)] = toSnakeCase(value);
    }
    return result as T;
  }
  return obj as T;
}
