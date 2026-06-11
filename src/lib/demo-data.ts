import { Comisionista, OrdenItem, Liquidacion } from '@/types';
import { generarId } from './id';

export const demoComisionistas: Comisionista[] = [
  { id: 'com-001', nombre: 'Carlos Mendoza', tarifas: [{ tipo: 'porcentaje', valor: 2.5 }] },
  { id: 'com-002', nombre: 'María Fernanda López', tarifas: [{ tipo: 'porcentaje', valor: 3.0 }] },
  { id: 'com-003', nombre: 'José Antonio Vargas', tarifas: [{ tipo: 'fijo_kg', valor: 0.08 }] },
  { id: 'com-004', nombre: 'Ana Patricia Ruiz', tarifas: [{ tipo: 'porcentaje', valor: 1.8 }] },
  { id: 'com-005', nombre: 'Roberto Carlos Sánchez', tarifas: [{ tipo: 'fijo_kg', valor: 0.12 }] },
  { id: 'com-006', nombre: 'Diana Michelle Castro', tarifas: [{ tipo: 'porcentaje', valor: 2.0 }] },
  // Comisionista con tarifa dual (kg + %)
  { id: 'com-007', nombre: 'Luis Fernando Vega', tarifas: [{ tipo: 'fijo_kg', valor: 0.05 }, { tipo: 'porcentaje', valor: 1.5 }] },
];

const productos = [
  { nombre: 'Camarón blanco HOSO 16/20', finca: 'Finca El Coral' },
  { nombre: 'Camarón blanco HOSO 21/25', finca: 'Finca El Coral' },
  { nombre: 'Camarón blanco HLSO 31/35', finca: 'Finca San Rafael' },
  { nombre: 'Camarón organico PDTO 41/50', finca: 'Finca Santa Elena' },
  { nombre: 'Tilapia fresca entera', finca: 'Finca San Rafael' },
  { nombre: 'Tilapia filete IQF', finca: 'Finca Santa Elena' },
  { nombre: 'Camarón precocido P&D 51/60', finca: 'Finca El Coral' },
  { nombre: 'Camarón blanco PDTO 26/30', finca: 'Finca San Rafael' },
];

function makeOrden(
  fecha: string,
  numeroOrden: string,
  productoIdx: number,
  cantidad: number,
  unidad: string,
  precioUnitario: number,
  comisionistaIds: string[]
): OrdenItem {
  const prod = productos[productoIdx % productos.length];
  const total = cantidad * precioUnitario;
  return {
    id: generarId(),
    fecha,
    numeroOrden,
    finca: prod.finca,
    producto: prod.nombre,
    cantidad,
    unidad,
    precioUnitario,
    total,
    comisionistas: comisionistaIds.map(id => ({ comisionistaId: id })),
    sector: prod.finca,
    estado: 'pagada',
  };
}

export const demoOrdenItems: OrdenItem[] = [
  // Marzo 2026
  makeOrden('2026-03-02', 'OC-2026-0451', 0, 2500, 'kg', 8.5, ['com-001']),
  makeOrden('2026-03-02', 'OC-2026-0451', 1, 1800, 'kg', 7.9, ['com-001', 'com-002']),
  makeOrden('2026-03-05', 'OC-2026-0458', 2, 3200, 'kg', 6.75, ['com-002']),
  makeOrden('2026-03-08', 'OC-2026-0462', 3, 1500, 'kg', 9.2, ['com-003']),
  makeOrden('2026-03-10', 'OC-2026-0465', 4, 4200, 'kg', 4.5, ['com-004', 'com-007']),
  makeOrden('2026-03-12', 'OC-2026-0470', 5, 2100, 'kg', 5.8, ['com-002']),
  makeOrden('2026-03-15', 'OC-2026-0475', 6, 2800, 'kg', 7.1, ['com-005']),
  makeOrden('2026-03-18', 'OC-2026-0480', 7, 1900, 'kg', 8.0, ['com-006']),
  makeOrden('2026-03-20', 'OC-2026-0483', 0, 3100, 'kg', 8.6, ['com-001', 'com-003']),
  makeOrden('2026-03-22', 'OC-2026-0488', 2, 2200, 'kg', 6.8, ['com-003']),
  // Abril 2026
  makeOrden('2026-04-03', 'OC-2026-0501', 1, 2600, 'kg', 7.95, ['com-002']),
  makeOrden('2026-04-05', 'OC-2026-0505', 3, 1700, 'kg', 9.15, ['com-004']),
  makeOrden('2026-04-08', 'OC-2026-0510', 4, 4500, 'kg', 4.55, ['com-005', 'com-007']),
  makeOrden('2026-04-10', 'OC-2026-0512', 5, 2300, 'kg', 5.85, ['com-006']),
  makeOrden('2026-04-12', 'OC-2026-0515', 6, 3000, 'kg', 7.2, ['com-001']),
  makeOrden('2026-04-15', 'OC-2026-0520', 7, 2000, 'kg', 8.1, ['com-002', 'com-007']),
  makeOrden('2026-04-18', 'OC-2026-0525', 0, 3300, 'kg', 8.7, ['com-003']),
  makeOrden('2026-04-20', 'OC-2026-0528', 2, 2400, 'kg', 6.9, ['com-004']),
  // Mayo 2026 (actual)
  makeOrden('2026-05-03', 'OC-2026-0550', 1, 2700, 'kg', 8.0, ['com-005']),
  makeOrden('2026-05-05', 'OC-2026-0553', 3, 1600, 'kg', 9.3, ['com-006']),
  makeOrden('2026-05-08', 'OC-2026-0558', 4, 4000, 'kg', 4.6, ['com-001', 'com-007']),
  makeOrden('2026-05-10', 'OC-2026-0560', 5, 2200, 'kg', 5.9, ['com-002']),
];

export const demoLiquidaciones: Liquidacion[] = [
  {
    id: 'liq-001',
    mes: '2026-03',
    nombre: 'Liquidación Marzo 2026',
    fechaCreacion: '2026-03-25T10:30:00.000Z',
    items: [
      makeOrden('2026-03-02', 'OC-2026-0451', 0, 2500, 'kg', 8.5, ['com-001']),
      makeOrden('2026-03-02', 'OC-2026-0451', 1, 1800, 'kg', 7.9, ['com-001', 'com-002']),
      makeOrden('2026-03-05', 'OC-2026-0458', 2, 3200, 'kg', 6.75, ['com-002']),
      makeOrden('2026-03-08', 'OC-2026-0462', 3, 1500, 'kg', 9.2, ['com-003']),
      makeOrden('2026-03-10', 'OC-2026-0465', 4, 4200, 'kg', 4.5, ['com-004', 'com-007']),
      makeOrden('2026-03-12', 'OC-2026-0470', 5, 2100, 'kg', 5.8, ['com-002']),
      makeOrden('2026-03-15', 'OC-2026-0475', 6, 2800, 'kg', 7.1, ['com-005']),
      makeOrden('2026-03-18', 'OC-2026-0480', 7, 1900, 'kg', 8.0, ['com-006']),
    ],
  },
  {
    id: 'liq-002',
    mes: '2026-03',
    nombre: 'Liquidación 2da Quincena Marzo',
    fechaCreacion: '2026-03-31T14:15:00.000Z',
    items: [
      makeOrden('2026-03-20', 'OC-2026-0483', 0, 3100, 'kg', 8.6, ['com-001', 'com-003']),
      makeOrden('2026-03-22', 'OC-2026-0488', 2, 2200, 'kg', 6.8, ['com-003']),
    ],
  },
  {
    id: 'liq-003',
    mes: '2026-04',
    nombre: 'Liquidación Abril 2026',
    fechaCreacion: '2026-04-28T09:00:00.000Z',
    items: [
      makeOrden('2026-04-03', 'OC-2026-0501', 1, 2600, 'kg', 7.95, ['com-002']),
      makeOrden('2026-04-05', 'OC-2026-0505', 3, 1700, 'kg', 9.15, ['com-004']),
      makeOrden('2026-04-08', 'OC-2026-0510', 4, 4500, 'kg', 4.55, ['com-005', 'com-007']),
      makeOrden('2026-04-10', 'OC-2026-0512', 5, 2300, 'kg', 5.85, ['com-006']),
      makeOrden('2026-04-12', 'OC-2026-0515', 6, 3000, 'kg', 7.2, ['com-001']),
      makeOrden('2026-04-15', 'OC-2026-0520', 7, 2000, 'kg', 8.1, ['com-002', 'com-007']),
      makeOrden('2026-04-18', 'OC-2026-0525', 0, 3300, 'kg', 8.7, ['com-003']),
      makeOrden('2026-04-20', 'OC-2026-0528', 2, 2400, 'kg', 6.9, ['com-004']),
    ],
  },
];
