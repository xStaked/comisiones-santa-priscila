export interface TarifaComision {
  tipo: 'porcentaje' | 'fijo_kg';
  valor: number;
}

export interface Comisionista {
  id: string;
  nombre: string;
  tarifas: TarifaComision[];
}

export interface AsignacionComisionista {
  comisionistaId: string;
}

export interface OrdenItem {
  id: string;
  fecha: string;
  numeroOrden: string;
  finca: string;
  producto: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  total: number;
  comisionistas: AsignacionComisionista[];
  sector?: string;
  estado?: string;
}

export interface Liquidacion {
  id: string;
  mes: string;
  items: OrdenItem[];
  fechaCreacion: string;
  nombre: string;
}

export type Unidad = 'kg' | 'unidades' | 'libras' | 'cajas';

// Legacy types para migración
export interface LegacyComisionista {
  id: string;
  nombre: string;
  tipo: 'porcentaje' | 'fijo_kg';
  valor: number;
}

export interface LegacyOrdenItem {
  id: string;
  fecha: string;
  numeroOrden: string;
  finca: string;
  producto: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  total: number;
  comisionistaId: string | null;
  sector?: string;
  estado?: string;
}
