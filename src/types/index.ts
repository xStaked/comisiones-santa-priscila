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
  // Nuevos campos (Fase 3)
  clienteId?: string;
  productoId?: string;
  fincaId?: string;
  // Relaciones populadas por backend
  cliente?: { id: string; nombre: string; retencionPorcentaje: number };
  productoRel?: { id: string; nombre: string; unidadComision: string; tachoKilos?: number };
  fincaRel?: { id: string; nombre: string };
}

export interface Liquidacion {
  id: string;
  mes: string;
  items: OrdenItem[];
  fechaCreacion: string;
  nombre: string;
}

export type Unidad = 'kg' | 'unidades' | 'libras' | 'cajas';

export interface Cliente {
  id: string;
  nombre: string;
  tipo: 'grupo' | 'individual';
  retencionPorcentaje: number;
  activo: boolean;
  createdAt: string;
  fincas?: Finca[];
}

export interface Finca {
  id: string;
  nombre: string;
  clienteId: string;
  activo: boolean;
  createdAt: string;
}

export interface Producto {
  id: string;
  nombre: string;
  unidadComision: 'kg' | 'litro' | 'tacho' | 'unidad';
  tachoKilos?: number;
  activo: boolean;
  createdAt: string;
}

export interface TarifaClienteProducto {
  id: string;
  comisionistaId: string;
  clienteId: string;
  productoId: string;
  fincaId?: string;
  tipo: 'porcentaje' | 'fijo_kg';
  valor: number;
  activo: boolean;
  createdAt: string;
  // Relaciones opcionales (populadas por el backend)
  comisionista?: { id: string; nombre: string };
  cliente?: { id: string; nombre: string };
  producto?: { id: string; nombre: string };
  finca?: { id: string; nombre: string };
}

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
