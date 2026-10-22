import assert from 'node:assert/strict';
import test from 'node:test';

import type { OrdenItem, TarifaClienteProducto } from '@/types';
import { encontrarTarifaEspecifica, unirTarifasLabel } from './export-utils';
import { esCoincidenciaSegura, UMBRAL_FINCA, UMBRAL_PRODUCTO } from './normalization';

const COMISIONISTA = 'com-1';
const CLIENTE = 'cli-1';
const AGUA = 'prod-agua';
const SALUD = 'prod-salud';
const PAST_TH = 'prod-past-th';
const PAST_GRANDES = 'prod-past-grandes';
const AFRICA = 'finca-africa';
const CORVINERO_A = 'finca-corvinero-a';
const CORVINERO_C = 'finca-corvinero-c';

function tarifa(
  overrides: Partial<TarifaClienteProducto> & Pick<TarifaClienteProducto, 'productoId' | 'valor'>
): TarifaClienteProducto {
  return {
    id: `tarifa-${overrides.productoId}-${overrides.fincaId ?? 'sin-finca'}`,
    comisionistaId: COMISIONISTA,
    clienteId: CLIENTE,
    proveedor: '',
    tipo: 'fijo_kg',
    activo: true,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function item(overrides: Partial<OrdenItem> = {}): OrdenItem {
  return {
    id: 'item-1',
    fecha: '2026-08-14',
    numeroOrden: '001-002-000002327',
    finca: 'AFRICA',
    producto: 'ECU-BACILLUS AGUA',
    cantidad: 70,
    unidad: 'kg',
    precioUnitario: 48,
    total: 3360,
    comisionistas: [{ comisionistaId: COMISIONISTA }],
    fechaPago: '2026-09-30',
    clienteId: CLIENTE,
    productoId: AGUA,
    fincaId: AFRICA,
    cliente: { id: CLIENTE, nombre: 'Santa Priscila' },
    productoRel: { id: AGUA, nombre: 'ECU-BACILLUS AGUA', unidadComision: 'kg' },
    fincaRel: { id: AFRICA, nombre: 'AFRICA' },
    ...overrides,
  };
}

const tarifaSaludAfrica = tarifa({
  productoId: SALUD,
  fincaId: AFRICA,
  producto: 'ECU-BACILLUS SALUD',
  finca: 'AFRICA',
  valor: 1,
});

const tarifaAguaAfrica = tarifa({
  productoId: AGUA,
  fincaId: AFRICA,
  producto: 'ECU-BACILLUS AGUA',
  finca: 'AFRICA',
  valor: 0.5,
});

test('la comparación segura rechaza variantes y acepta typos', () => {
  assert.equal(
    esCoincidenciaSegura('ECU-BACILLUS AGUA', 'ECU-BACILLUS SALUD', UMBRAL_PRODUCTO),
    false
  );
  assert.equal(
    esCoincidenciaSegura('ECU-BACILLUS AGUA', 'ECU BACILLUS AGU', UMBRAL_PRODUCTO),
    true
  );
  assert.equal(esCoincidenciaSegura('CORVINERO A', 'CORVINERO C', UMBRAL_FINCA), false);
  assert.equal(esCoincidenciaSegura('CALIFRONIA', 'CALIFORNIA', UMBRAL_FINCA), true);
  // CALCIUM y CALCINIT comparten casi todo el nombre, pero son productos
  // distintos: no deben resolverse por parecido.
  assert.equal(esCoincidenciaSegura('CALCIUM', 'CALCINIT', UMBRAL_PRODUCTO), false);
});

test('con IDs, AGUA no toma la tarifa de SALUD', () => {
  const encontrada = encontrarTarifaEspecifica(item(), COMISIONISTA, [
    tarifaSaludAfrica,
    tarifaAguaAfrica,
  ]);

  assert.equal(encontrada?.id, tarifaAguaAfrica.id);
  assert.equal(encontrada?.valor, 0.5);
});

test('legacy sin IDs: un typo de AGUA no cae en SALUD', () => {
  const encontrada = encontrarTarifaEspecifica(
    item({
      productoId: undefined,
      productoRel: undefined,
      producto: 'ECU BACILLUS AGU',
      fincaId: undefined,
      fincaRel: undefined,
      finca: 'AFRICA',
    }),
    COMISIONISTA,
    [tarifaSaludAfrica, tarifaAguaAfrica]
  );

  assert.equal(encontrada?.id, tarifaAguaAfrica.id);
  assert.equal(encontrada?.valor, 0.5);
});

test('con finca_id, CORVINERO A no toma CORVINERO C', () => {
  const tarifaA = tarifa({
    productoId: AGUA,
    fincaId: CORVINERO_A,
    producto: 'ECU-BACILLUS AGUA',
    finca: 'CORVINERO A',
    valor: 0.5,
  });
  const tarifaC = tarifa({
    productoId: AGUA,
    fincaId: CORVINERO_C,
    producto: 'ECU-BACILLUS AGUA',
    finca: 'CORVINERO C',
    valor: 1,
  });

  const encontrada = encontrarTarifaEspecifica(
    item({
      fincaId: CORVINERO_A,
      finca: 'CORVINERO A',
      fincaRel: { id: CORVINERO_A, nombre: 'CORVINERO A' },
    }),
    COMISIONISTA,
    [tarifaC, tarifaA]
  );

  assert.equal(encontrada?.id, tarifaA.id);
});

test('sin IDs, CORVINERO A no cae en CORVINERO C', () => {
  const tarifaA = tarifa({
    productoId: AGUA,
    fincaId: CORVINERO_A,
    producto: 'ECU-BACILLUS AGUA',
    finca: 'CORVINERO A',
    valor: 0.5,
  });
  const tarifaC = tarifa({
    productoId: AGUA,
    fincaId: CORVINERO_C,
    producto: 'ECU-BACILLUS AGUA',
    finca: 'CORVINERO C',
    valor: 1,
  });

  const encontrada = encontrarTarifaEspecifica(
    item({
      fincaId: undefined,
      fincaRel: undefined,
      finca: 'CORVINERO A',
    }),
    COMISIONISTA,
    [tarifaC, tarifaA]
  );

  assert.equal(encontrada?.id, tarifaA.id);
});

test('PASTILLAS TH no toma PASTILLAS GRANDES', () => {
  const tarifaTh = tarifa({
    productoId: PAST_TH,
    fincaId: AFRICA,
    producto: 'PAST TH',
    finca: 'AFRICA',
    valor: 0.5,
  });
  const tarifaGrandes = tarifa({
    productoId: PAST_GRANDES,
    fincaId: AFRICA,
    producto: 'ECU BACILLUS SUELO PASTILLA',
    finca: 'AFRICA',
    valor: 1,
  });

  const encontrada = encontrarTarifaEspecifica(
    item({
      productoId: undefined,
      productoRel: undefined,
      producto: 'PASTILLAS TH',
    }),
    COMISIONISTA,
    [tarifaGrandes, tarifaTh]
  );

  assert.equal(encontrada?.id, tarifaTh.id);
});

test('el resumen no reduce varias tarifas a la primera', () => {
  assert.equal(unirTarifasLabel(['$0.500/kg']), '$0.500/kg');
  assert.equal(unirTarifasLabel(['$0.500/kg', '$0.500/kg']), '$0.500/kg');
  assert.equal(
    unirTarifasLabel(['$0.500/kg', '$1.000/kg']),
    'Varias ($0.500/kg + $1.000/kg)'
  );
  assert.equal(unirTarifasLabel([]), '—');
});

test('PASTILLAS GRANDES no toma PASTILLAS TH', () => {
  const tarifaTh = tarifa({
    productoId: PAST_TH,
    fincaId: AFRICA,
    producto: 'PAST TH',
    finca: 'AFRICA',
    valor: 0.5,
  });
  const tarifaGrandes = tarifa({
    productoId: PAST_GRANDES,
    fincaId: AFRICA,
    producto: 'ECU BACILLUS SUELO PASTILLA',
    finca: 'AFRICA',
    valor: 1,
  });

  const encontrada = encontrarTarifaEspecifica(
    item({
      productoId: undefined,
      productoRel: undefined,
      producto: 'PASTILLAS GRANDES',
    }),
    COMISIONISTA,
    [tarifaTh, tarifaGrandes]
  );

  assert.equal(encontrada?.id, tarifaGrandes.id);
});
