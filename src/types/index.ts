export type EstadoOrden = 'pendiente' | 'parcialmente_pagada' | 'pagada' | 'liquidada';

export interface Grupo {
  id: string;
  nombre: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
}

export interface TarifaComision {
  tipo: 'porcentaje' | 'fijo_kg' | 'fijo_unidad';
  valor: number;
  proveedoresExcluidos?: string[];
  umbralKg?: number;
  valorSobreUmbral?: number;
}

export interface Comisionista {
  id: string;
  nombre: string;
  tarifas: TarifaComision[];
}

export interface AsignacionComisionista {
  comisionistaId: string;
  /** null = pendiente de liquidar. La liquidación es por persona, no por orden. */
  liquidacionId?: string | null;
}

export interface OrdenItem {
  id: string;
  ordenId?: string;
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
  estado?: EstadoOrden;
  // Nuevos campos (Fase 3)
  clienteId?: string;
  productoId?: string;
  fincaId?: string;
  proveedor?: string;
  // Relaciones populadas por backend
  cliente?: { id: string; nombre: string; retencionPorcentaje: number };
  productoRel?: { id: string; nombre: string; unidadComision: string; tachoKilos?: number; sacoKilos?: number; pesoPorUnidad?: number };
  fincaRel?: { id: string; nombre: string };
}

export interface Orden {
  id: string;
  fecha: string;
  numeroOrden: string;
  clienteId?: string;
  proveedor?: string;
  semana?: string;
  archivoNombre?: string;
  origen: 'manual' | 'pdf' | 'imagen' | string;
  estado: EstadoOrden;
  total: number;
  cantidadProductos: number;
  items: OrdenItem[];
}

export interface Liquidacion {
  id: string;
  mes: string;
  items: OrdenItem[];
  fechaCreacion: string;
  nombre: string;
}

export type Unidad = 'kg' | 'unidades' | 'libras' | 'cajas' | 'litros' | 'tachos' | 'sacos' | 'canecas' | 'galones';

export interface Cliente {
  id: string;
  nombre: string;
  tipo: 'grupo' | 'individual';
  retencionPorcentaje: number;
  activo: boolean;
  grupoId?: string;
  grupo?: Grupo;
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
  unidadComision: 'kg' | 'litro' | 'tacho' | 'unidad' | 'caneca' | 'galon' | 'saco';
  tachoKilos?: number;
  sacoKilos?: number;
  pesoPorUnidad?: number;
  activo: boolean;
  createdAt: string;
  alias: string[];
}

export interface TarifaClienteProducto {
  id: string;
  comisionistaId: string;
  clienteId: string;
  productoId: string;
  fincaId?: string;
  proveedor: string;
  proveedoresExcluidos?: string[];
  tipo: 'porcentaje' | 'fijo_kg' | 'fijo_unidad';
  valor: number;
  activo: boolean;
  umbralKg?: number;
  valorSobreUmbral?: number;
  createdAt: string;
  // Relaciones opcionales (populadas por el backend)
  comisionista?: string | { id: string; nombre: string };
  cliente?: string | { id: string; nombre: string };
  producto?: string | { id: string; nombre: string };
  finca?: string | { id: string; nombre: string };
}

// Legacy types para migración
export interface LegacyComisionista {
  id: string;
  nombre: string;
  tipo: 'porcentaje' | 'fijo_kg' | 'fijo_unidad';
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
