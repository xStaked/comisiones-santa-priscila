'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Comisionista, OrdenItem, Liquidacion, Cliente, Producto, Finca, TarifaClienteProducto, EstadoOrden, Retencion } from '@/types';
import { toast } from 'sonner';
import {
  fetchComisionistas,
  createComisionista,
  updateComisionista as apiUpdateComisionista,
  deleteComisionista as apiDeleteComisionista,
  fetchOrdenes,
  createOrdenes,
  updateOrden as apiUpdateOrden,
  updateEstadoOrdenGrupo as apiUpdateEstadoOrdenGrupo,
  updateEstadoOrdenesMasivo as apiUpdateEstadoOrdenesMasivo,
  deleteOrden as apiDeleteOrden,
  asignarComisionista as apiAsignarComisionista,
  desasignarComisionista as apiDesasignarComisionista,
  asignarGlobal as apiAsignarGlobal,
  limpiarOrdenes as apiLimpiarOrdenes,
  recalcularOrden as apiRecalcularOrden,
  recalcularOrdenesMasivo as apiRecalcularOrdenesMasivo,
  fetchLiquidaciones,
  createLiquidacion,
  deleteLiquidacion as apiDeleteLiquidacion,
  seedDemo,
  fetchClientes,
  createCliente,
  updateCliente as apiUpdateCliente,
  deleteCliente as apiDeleteCliente,
  fetchProductos,
  createProducto,
  updateProducto as apiUpdateProducto,
  deleteProducto as apiDeleteProducto,
  createProductoAlias,
  deleteProductoAlias,
  fetchTarifasClienteProducto,
  createTarifaClienteProducto,
  updateTarifaClienteProducto as apiUpdateTarifaClienteProducto,
  deleteTarifaClienteProducto as apiDeleteTarifaClienteProducto,
  updateTarifasClienteProductoMasivo as apiUpdateTarifasMasivo,
  fetchRetenciones,
  type ModoRecalculo,
  type ResultadoRecalculo,
} from '@/lib/api';
import { setPeriodosRetencion } from '@/lib/export-utils';

interface AppContextType {
  /** Primera carga de los catálogos. Hasta que termine, las pantallas no pueden
   *  distinguir "todavía no llegó" de "no hay nada". */
  cargando: boolean;

  comisionistas: Comisionista[];
  addComisionista: (c: Omit<Comisionista, 'id'>) => void;
  updateComisionista: (id: string, c: Partial<Comisionista>) => void;
  deleteComisionista: (id: string) => void;

  ordenItems: OrdenItem[];
  addOrdenItems: (items: OrdenItem[]) => Promise<void>;
  updateOrdenItem: (id: string, item: Partial<OrdenItem>) => Promise<void>;
  updateEstadoOrden: (ordenId: string, estado: EstadoOrden, fechaPago?: string | null) => Promise<void>;
  updateEstadoOrdenesMasivo: (ordenIds: string[], estado: EstadoOrden, fechaPago?: string | null) => Promise<{ actualizadas: number; omitidas: string[] }>;
  deleteOrdenItem: (id: string) => Promise<void>;
  deleteOrdenItems: (ids: string[]) => Promise<void>;
  clearOrdenItems: () => Promise<void>;
  assignComisionistasGlobal: (comisionistaIds: string[]) => Promise<void>;
  addComisionistaToItem: (itemId: string, comisionistaId: string) => void;
  removeComisionistaFromItem: (itemId: string, comisionistaId: string) => void;
  recalcularComisiones: (ordenIds: string[], modo?: ModoRecalculo) => Promise<ResultadoRecalculo>;
  recalculandoComisiones: boolean;

  liquidaciones: Liquidacion[];
  saveLiquidacion: (nombre: string, mes: string, ordenItemIds?: string[], comisionistaIds?: string[]) => Promise<void>;
  deleteLiquidacion: (id: string) => void;
  resetDemoData: () => void;

  clientes: Cliente[];
  addCliente: (c: Omit<Cliente, 'id' | 'createdAt'>) => Promise<void>;
  updateCliente: (id: string, c: Partial<Cliente>) => Promise<void>;
  deleteCliente: (id: string) => Promise<void>;

  productos: Producto[];
  addProducto: (p: Omit<Producto, 'id' | 'createdAt'>) => void;
  updateProducto: (id: string, p: Partial<Producto>) => void;
  deleteProducto: (id: string) => void;

  tarifasClienteProducto: TarifaClienteProducto[];
  addTarifa: (data: Omit<TarifaClienteProducto, 'id' | 'createdAt'>) => void;
  updateTarifa: (id: string, data: Partial<TarifaClienteProducto>) => void;
  updateTarifasMasivo: (ids: string[], cambios: { tipo?: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor?: number; activo?: boolean; umbralKg?: number | null; valorSobreUmbral?: number | null; vigenteDesde?: string | null; vigenteHasta?: string | null; proveedoresExcluidos?: string[] }) => Promise<{ actualizadas: number }>;
  deleteTarifa: (id: string) => void;

  retenciones: Retencion[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/** Ids compartidos para que el toast de "…" se reemplace por el resultado. */
const TOAST_RECALCULO_ID = 'recalculo-comisiones';
const TOAST_GUARDAR_ORDENES_ID = 'guardar-ordenes';
const TOAST_ACTUALIZAR_ORDEN_ID = 'actualizar-orden';
const TOAST_ESTADO_ORDEN_ID = 'estado-orden';
const TOAST_ASIGNAR_GLOBAL_ID = 'asignar-global';
const TOAST_GUARDAR_LIQUIDACION_ID = 'guardar-liquidacion';
const TOAST_ELIMINAR_LIQUIDACION_ID = 'eliminar-liquidacion';
const TOAST_CARGAR_DATOS_ID = 'cargar-datos';
const TOAST_TARIFAS_MASIVO_ID = 'tarifas-masivo';
const TOAST_COMISIONISTA_ID = 'comisionista';
const TOAST_CLIENTE_ID = 'cliente';
const TOAST_PRODUCTO_ID = 'producto';
const TOAST_TARIFA_ID = 'tarifa';

function ordenItemToCreatePayload(item: OrdenItem) {
  return {
    fecha: item.fecha,
    numeroOrden: item.numeroOrden,
    finca: item.finca,
    producto: item.producto,
    cantidad: item.cantidad,
    unidad: item.unidad,
    precioUnitario: item.precioUnitario,
    total: item.total,
    sector: item.sector,
    estado: item.estado,
    clienteId: item.clienteId,
    productoId: item.productoId,
    fincaId: item.fincaId,
    proveedor: item.proveedor,
    comisionistaIds: item.comisionistas.map((c) => c.comisionistaId),
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // Queries
  const comisionistasQuery = useQuery({
    queryKey: ['comisionistas'],
    queryFn: fetchComisionistas,
  });

  const ordenesQuery = useQuery({
    queryKey: ['ordenes'],
    queryFn: () => fetchOrdenes(),
  });

  const liquidacionesQuery = useQuery({
    queryKey: ['liquidaciones'],
    queryFn: fetchLiquidaciones,
  });

  const clientesQuery = useQuery({
    queryKey: ['clientes'],
    queryFn: fetchClientes,
  });

  const productosQuery = useQuery({
    queryKey: ['productos'],
    queryFn: fetchProductos,
  });

  const tarifasClienteProductoQuery = useQuery({
    queryKey: ['tarifas-cliente-producto'],
    queryFn: () => fetchTarifasClienteProducto(),
  });

  const retencionesQuery = useQuery({
    queryKey: ['retenciones'],
    queryFn: fetchRetenciones,
  });

  // isLoading (no isFetching): un refetch de fondo no debe tapar la pantalla.
  const cargando = [
    comisionistasQuery,
    ordenesQuery,
    liquidacionesQuery,
    clientesQuery,
    productosQuery,
    tarifasClienteProductoQuery,
    retencionesQuery,
  ].some(q => q.isLoading);

  const comisionistas: Comisionista[] = comisionistasQuery.data ?? [];
  const ordenItems: OrdenItem[] = ordenesQuery.data ?? [];
  const liquidaciones: Liquidacion[] = liquidacionesQuery.data ?? [];
  const clientes: Cliente[] = clientesQuery.data ?? [];
  const productos: Producto[] = productosQuery.data ?? [];
  const tarifasClienteProducto: TarifaClienteProducto[] = tarifasClienteProductoQuery.data ?? [];
  const retenciones: Retencion[] = retencionesQuery.data ?? [];

  // Los periodos de retención se inyectan en export-utils, que los usa desde
  // funciones puras sin acceso al contexto de React. Se llama de forma síncrona
  // durante el render (no en un useEffect) para que ya estén disponibles cuando
  // los hijos rendericen en este mismo commit; es solo una asignación de variable
  // de módulo, así que es idempotente y no dispara ningún setState.
  if (retencionesQuery.data) setPeriodosRetencion(retencionesQuery.data);

  // Mutations: Comisionistas
  const createComisionistaMutation = useMutation({
    mutationFn: createComisionista,
    onMutate: () => {
      toast.loading('Creando comisionista…', { id: TOAST_COMISIONISTA_ID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comisionistas'] });
      toast.success('Comisionista creado', { id: TOAST_COMISIONISTA_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al crear comisionista', {
        id: TOAST_COMISIONISTA_ID,
      });
    },
  });

  const updateComisionistaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Comisionista> }) => apiUpdateComisionista(id, data),
    onMutate: () => {
      toast.loading('Guardando comisionista…', { id: TOAST_COMISIONISTA_ID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comisionistas'] });
      toast.success('Comisionista actualizado', { id: TOAST_COMISIONISTA_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar comisionista', {
        id: TOAST_COMISIONISTA_ID,
      });
    },
  });

  const deleteComisionistaMutation = useMutation({
    mutationFn: apiDeleteComisionista,
    onMutate: () => {
      toast.loading('Eliminando comisionista…', { id: TOAST_COMISIONISTA_ID });
      return queryClient.cancelQueries({ queryKey: ['ordenes'] });
    },
    onSuccess: () => {
      toast.success('Comisionista eliminado', { id: TOAST_COMISIONISTA_ID });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['comisionistas'] });
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar comisionista', {
        id: TOAST_COMISIONISTA_ID,
      });
    },
  });

  // Mutations: Ordenes
  const createOrdenesMutation = useMutation({
    mutationFn: (items: OrdenItem[]) => createOrdenes(items.map(ordenItemToCreatePayload)),
    onMutate: () => {
      toast.loading('Guardando órdenes…', { id: TOAST_GUARDAR_ORDENES_ID });
      return queryClient.cancelQueries({ queryKey: ['ordenes'] });
    },
    onSuccess: () => {
      toast.success('Órdenes agregadas', { id: TOAST_GUARDAR_ORDENES_ID });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al agregar órdenes', {
        id: TOAST_GUARDAR_ORDENES_ID,
      });
    },
  });

  const updateOrdenMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<OrdenItem> }) => apiUpdateOrden(id, data),
    onMutate: () => {
      toast.loading('Guardando cambios…', { id: TOAST_ACTUALIZAR_ORDEN_ID });
      return queryClient.cancelQueries({ queryKey: ['ordenes'] });
    },
    onSuccess: () => {
      toast.success('Orden actualizada', { id: TOAST_ACTUALIZAR_ORDEN_ID });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar orden', {
        id: TOAST_ACTUALIZAR_ORDEN_ID,
      });
    },
  });

  const updateEstadoOrdenMutation = useMutation({
    mutationFn: ({ ordenId, estado, fechaPago }: { ordenId: string; estado: EstadoOrden; fechaPago?: string | null }) =>
      apiUpdateEstadoOrdenGrupo(ordenId, estado, fechaPago),
    onMutate: () => {
      toast.loading('Actualizando estado…', { id: TOAST_ESTADO_ORDEN_ID });
      return queryClient.cancelQueries({ queryKey: ['ordenes'] });
    },
    onSuccess: () => {
      toast.success('Estado de orden actualizado', { id: TOAST_ESTADO_ORDEN_ID });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar estado de orden', {
        id: TOAST_ESTADO_ORDEN_ID,
      });
    },
  });

  const updateEstadoOrdenesMasivoMutation = useMutation({
    mutationFn: ({ ordenIds, estado, fechaPago }: { ordenIds: string[]; estado: EstadoOrden; fechaPago?: string | null }) =>
      apiUpdateEstadoOrdenesMasivo(ordenIds, estado, fechaPago),
    onMutate: () => {
      toast.loading('Actualizando órdenes…', { id: TOAST_ESTADO_ORDEN_ID });
      return queryClient.cancelQueries({ queryKey: ['ordenes'] });
    },
    onSuccess: (data) => {
      if (data.omitidas.length > 0) {
        toast.success(`${data.actualizadas} orden(es) actualizadas; ${data.omitidas.length} omitida(s) por tener ítems liquidados`, {
          id: TOAST_ESTADO_ORDEN_ID,
        });
      } else {
        toast.success(`${data.actualizadas} orden(es) actualizadas`, { id: TOAST_ESTADO_ORDEN_ID });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar órdenes', {
        id: TOAST_ESTADO_ORDEN_ID,
      });
    },
  });

  const deleteOrdenMutation = useMutation({
    mutationFn: apiDeleteOrden,
    onMutate: () => queryClient.cancelQueries({ queryKey: ['ordenes'] }),
    onSuccess: () => {
      toast.success('Orden eliminada');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar orden');
    },
  });

  const deleteOrdenesMutation = useMutation({
    // ponytail: secuencial a propósito — el backend borra la Orden padre cuando se
    // queda sin ítems, y dos DELETE en paralelo sobre la misma orden chocan.
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await apiDeleteOrden(id);
    },
    onMutate: () => queryClient.cancelQueries({ queryKey: ['ordenes'] }),
    onSuccess: () => {
      toast.success('Órdenes eliminadas');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar órdenes');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
  });

  const limpiarOrdenesMutation = useMutation({
    mutationFn: apiLimpiarOrdenes,
    onMutate: () => queryClient.cancelQueries({ queryKey: ['ordenes'] }),
    onSuccess: () => {
      toast.success('Órdenes limpiadas');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al limpiar órdenes');
    },
  });

  const asignarGlobalMutation = useMutation({
    mutationFn: ({ ordenIds, comisionistaIds }: { ordenIds: string[]; comisionistaIds: string[] }) =>
      apiAsignarGlobal(ordenIds, comisionistaIds),
    onMutate: () => {
      toast.loading('Asignando comisionistas…', { id: TOAST_ASIGNAR_GLOBAL_ID });
      return queryClient.cancelQueries({ queryKey: ['ordenes'] });
    },
    onSuccess: () => {
      toast.success('Comisionistas asignados globalmente', { id: TOAST_ASIGNAR_GLOBAL_ID });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al asignar comisionistas', {
        id: TOAST_ASIGNAR_GLOBAL_ID,
      });
    },
  });

  const asignarComisionistaMutation = useMutation({
    mutationFn: ({ itemId, comisionistaId }: { itemId: string; comisionistaId: string }) =>
      apiAsignarComisionista(itemId, comisionistaId),
    onMutate: () => queryClient.cancelQueries({ queryKey: ['ordenes'] }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al asignar comisionista');
    },
  });

  const desasignarComisionistaMutation = useMutation({
    mutationFn: ({ itemId, comisionistaId }: { itemId: string; comisionistaId: string }) =>
      apiDesasignarComisionista(itemId, comisionistaId),
    onMutate: () => queryClient.cancelQueries({ queryKey: ['ordenes'] }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al desasignar comisionista');
    },
  });

  // Recálculo de comisiones: reasigna comisionistas con los catálogos actuales
  // sin borrar la factura. Una sola factura usa el endpoint por grupo; varias,
  // el masivo. `agregar` solo inserta faltantes, `sincronizar` además quita
  // pendientes que ya no aplican.
  const recalcularComisionesMutation = useMutation({
    mutationFn: ({ ordenIds, modo }: { ordenIds: string[]; modo?: ModoRecalculo }) =>
      ordenIds.length === 1
        ? apiRecalcularOrden(ordenIds[0], modo)
        : apiRecalcularOrdenesMasivo({ ordenIds, modo }),
    onMutate: () => {
      toast.loading('Recalculando comisiones…', { id: TOAST_RECALCULO_ID });
      return queryClient.cancelQueries({ queryKey: ['ordenes'] });
    },
    onSuccess: (data) => {
      const partes: string[] = [];
      if (data.agregadas > 0) partes.push(`${data.agregadas} asignación(es) agregada(s)`);
      if (data.quitadas > 0) partes.push(`${data.quitadas} asignación(es) quitada(s)`);
      if (data.omitidas.length > 0) partes.push(`${data.omitidas.length} omitida(s) por liquidada`);
      toast.success(partes.length > 0 ? `Recálculo: ${partes.join(' · ')}` : 'Recálculo sin cambios', {
        id: TOAST_RECALCULO_ID,
      });
    },
    onError: (err: unknown) => {
      const detalle = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detalle || 'Error al recalcular comisiones', { id: TOAST_RECALCULO_ID });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      // El recálculo solo reasigna comisionistas; los montos se calculan en el
      // export con las tarifas específicas. Invalidarlas evita que se exporte
      // con una tarifa vieja si se corrigió por SQL/seed sin pasar por la UI.
      queryClient.invalidateQueries({ queryKey: ['tarifas-cliente-producto'] });
      queryClient.invalidateQueries({ queryKey: ['comisionistas'] });
    },
  });

  // Mutations: Liquidaciones
  const createLiquidacionMutation = useMutation({
    mutationFn: ({ nombre, mes, ordenItemIds, comisionistaIds }: { nombre: string; mes: string; ordenItemIds: string[]; comisionistaIds?: string[] }) =>
      createLiquidacion({ nombre, mes, ordenItemIds, comisionistaIds }),
    onMutate: () => {
      toast.loading('Guardando liquidación…', { id: TOAST_GUARDAR_LIQUIDACION_ID });
      return Promise.all([
        queryClient.cancelQueries({ queryKey: ['ordenes'] }),
        queryClient.cancelQueries({ queryKey: ['liquidaciones'] }),
      ]);
    },
    onSuccess: (data: any) => {
      if (data.omitidos && data.omitidos.length > 0) {
        toast.success(`Liquidación guardada. Se omitieron ${data.omitidos.length} ítem(s) que ya no están pagados.`, {
          id: TOAST_GUARDAR_LIQUIDACION_ID,
        });
      } else {
        toast.success('Liquidación guardada', { id: TOAST_GUARDAR_LIQUIDACION_ID });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['liquidaciones'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al guardar liquidación', {
        id: TOAST_GUARDAR_LIQUIDACION_ID,
      });
    },
  });

  const deleteLiquidacionMutation = useMutation({
    mutationFn: apiDeleteLiquidacion,
    onMutate: () => {
      toast.loading('Eliminando liquidación…', { id: TOAST_ELIMINAR_LIQUIDACION_ID });
      return Promise.all([
        queryClient.cancelQueries({ queryKey: ['ordenes'] }),
        queryClient.cancelQueries({ queryKey: ['liquidaciones'] }),
      ]);
    },
    onSuccess: () => {
      toast.success('Liquidación eliminada', { id: TOAST_ELIMINAR_LIQUIDACION_ID });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['liquidaciones'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar liquidación', {
        id: TOAST_ELIMINAR_LIQUIDACION_ID,
      });
    },
  });


  const seedDemoMutation = useMutation({
    mutationFn: seedDemo,
    onMutate: () => {
      toast.loading('Cargando datos reales…', { id: TOAST_CARGAR_DATOS_ID });
      return queryClient.cancelQueries({ queryKey: ['ordenes'] });
    },
    onSuccess: () => {
      toast.success('Datos reales cargados', { id: TOAST_CARGAR_DATOS_ID });
    },
    onSettled: () => {
      queryClient.invalidateQueries();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al cargar datos reales', {
        id: TOAST_CARGAR_DATOS_ID,
      });
    },
  });

  // Mutations: Clientes
  const createClienteMutation = useMutation({
    mutationFn: createCliente,
    onMutate: () => {
      toast.loading('Creando cliente…', { id: TOAST_CLIENTE_ID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success('Cliente creado', { id: TOAST_CLIENTE_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al crear cliente', { id: TOAST_CLIENTE_ID });
    },
  });

  const updateClienteMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Cliente> }) => apiUpdateCliente(id, data),
    onMutate: () => {
      toast.loading('Guardando cliente…', { id: TOAST_CLIENTE_ID });
      return queryClient.cancelQueries({ queryKey: ['ordenes'] });
    },
    onSuccess: () => {
      toast.success('Cliente actualizado', { id: TOAST_CLIENTE_ID });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar cliente', {
        id: TOAST_CLIENTE_ID,
      });
    },
  });

  const deleteClienteMutation = useMutation({
    mutationFn: apiDeleteCliente,
    onMutate: () => {
      toast.loading('Eliminando cliente…', { id: TOAST_CLIENTE_ID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
      toast.success('Cliente eliminado', { id: TOAST_CLIENTE_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar cliente', {
        id: TOAST_CLIENTE_ID,
      });
    },
  });

  // Mutations: Productos
  const createProductoMutation = useMutation({
    mutationFn: createProducto,
    onMutate: () => {
      toast.loading('Creando producto…', { id: TOAST_PRODUCTO_ID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Producto creado', { id: TOAST_PRODUCTO_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al crear producto', {
        id: TOAST_PRODUCTO_ID,
      });
    },
  });

  const updateProductoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Producto> }) => apiUpdateProducto(id, data),
    onMutate: () => {
      toast.loading('Guardando producto…', { id: TOAST_PRODUCTO_ID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Producto actualizado', { id: TOAST_PRODUCTO_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar producto', {
        id: TOAST_PRODUCTO_ID,
      });
    },
  });

  const deleteProductoMutation = useMutation({
    mutationFn: apiDeleteProducto,
    onMutate: () => {
      toast.loading('Eliminando producto…', { id: TOAST_PRODUCTO_ID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Producto eliminado', { id: TOAST_PRODUCTO_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar producto', {
        id: TOAST_PRODUCTO_ID,
      });
    },
  });

  // Mutations: Tarifas Cliente Producto
  const createTarifaMutation = useMutation({
    mutationFn: createTarifaClienteProducto,
    onMutate: () => {
      toast.loading('Creando comisión…', { id: TOAST_TARIFA_ID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarifas-cliente-producto'] });
      toast.success('Comisión creada', { id: TOAST_TARIFA_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al crear comisión', { id: TOAST_TARIFA_ID });
    },
  });

  const updateTarifaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TarifaClienteProducto> }) => apiUpdateTarifaClienteProducto(id, data),
    onMutate: () => {
      toast.loading('Guardando comisión…', { id: TOAST_TARIFA_ID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarifas-cliente-producto'] });
      toast.success('Comisión actualizada', { id: TOAST_TARIFA_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar comisión', {
        id: TOAST_TARIFA_ID,
      });
    },
  });

  const updateTarifasMasivoMutation = useMutation({
    mutationFn: ({ ids, cambios }: { ids: string[]; cambios: { tipo?: string; valor?: number; activo?: boolean; umbralKg?: number | null; valorSobreUmbral?: number | null; vigenteDesde?: string | null; vigenteHasta?: string | null; proveedoresExcluidos?: string[] } }) =>
      apiUpdateTarifasMasivo(ids, cambios),
    onMutate: ({ ids }) => {
      toast.loading(`Actualizando ${ids.length} comisión(es)…`, { id: TOAST_TARIFAS_MASIVO_ID });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tarifas-cliente-producto'] });
      toast.success(`${data.actualizadas} comisiones actualizadas`, { id: TOAST_TARIFAS_MASIVO_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar comisiones', {
        id: TOAST_TARIFAS_MASIVO_ID,
      });
    },
  });

  const deleteTarifaMutation = useMutation({
    mutationFn: apiDeleteTarifaClienteProducto,
    onMutate: () => {
      toast.loading('Eliminando comisión…', { id: TOAST_TARIFA_ID });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarifas-cliente-producto'] });
      toast.success('Comisión eliminada', { id: TOAST_TARIFA_ID });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar comisión', {
        id: TOAST_TARIFA_ID,
      });
    },
  });

  // Callbacks expuestos a los tabs
  const addComisionista = useCallback(
    (c: Omit<Comisionista, 'id'>) => {
      createComisionistaMutation.mutate(c);
    },
    [createComisionistaMutation]
  );

  const updateComisionista = useCallback(
    (id: string, c: Partial<Comisionista>) => {
      updateComisionistaMutation.mutate({ id, data: c });
    },
    [updateComisionistaMutation]
  );

  const deleteComisionista = useCallback(
    (id: string) => {
      deleteComisionistaMutation.mutate(id);
    },
    [deleteComisionistaMutation]
  );

  const addOrdenItems = useCallback(
    (items: OrdenItem[]) => createOrdenesMutation.mutateAsync(items),
    [createOrdenesMutation]
  );

  const updateOrdenItem = useCallback(
    (id: string, item: Partial<OrdenItem>) =>
      updateOrdenMutation.mutateAsync({ id, data: item }),
    [updateOrdenMutation]
  );

  const deleteOrdenItem = useCallback(
    (id: string) => deleteOrdenMutation.mutateAsync(id),
    [deleteOrdenMutation]
  );

  const deleteOrdenItems = useCallback(
    (ids: string[]) => deleteOrdenesMutation.mutateAsync(ids),
    [deleteOrdenesMutation]
  );

  const updateEstadoOrden = useCallback(
    (ordenId: string, estado: EstadoOrden, fechaPago?: string | null) =>
      updateEstadoOrdenMutation.mutateAsync({ ordenId, estado, fechaPago }),
    [updateEstadoOrdenMutation]
  );

  const updateEstadoOrdenesMasivo = useCallback(
    (ordenIds: string[], estado: EstadoOrden, fechaPago?: string | null) =>
      updateEstadoOrdenesMasivoMutation.mutateAsync({ ordenIds, estado, fechaPago }),
    [updateEstadoOrdenesMasivoMutation]
  );

  const clearOrdenItems = useCallback(() => {
    return limpiarOrdenesMutation.mutateAsync();
  }, [limpiarOrdenesMutation]);

  const assignComisionistasGlobal = useCallback(
    (comisionistaIds: string[]) => {
      const ordenIds = ordenItems.map((o) => o.id);
      return asignarGlobalMutation.mutateAsync({ ordenIds, comisionistaIds });
    },
    [asignarGlobalMutation, ordenItems]
  );

  const addComisionistaToItem = useCallback(
    (itemId: string, comisionistaId: string) => {
      asignarComisionistaMutation.mutate({ itemId, comisionistaId });
    },
    [asignarComisionistaMutation]
  );

  const removeComisionistaFromItem = useCallback(
    (itemId: string, comisionistaId: string) => {
      desasignarComisionistaMutation.mutate({ itemId, comisionistaId });
    },
    [desasignarComisionistaMutation]
  );

  const recalcularComisiones = useCallback(
    (ordenIds: string[], modo?: ModoRecalculo) =>
      recalcularComisionesMutation.mutateAsync({ ordenIds, modo }),
    [recalcularComisionesMutation]
  );

  const saveLiquidacion = useCallback(
    async (nombre: string, mes: string, ordenItemIds?: string[], comisionistaIds?: string[]) => {
      const ids = ordenItemIds ?? ordenItems.filter((o) => o.estado === 'pagada').map((o) => o.id);
      if (ids.length === 0) {
        toast.error('No hay órdenes pagadas para guardar');
        return;
      }
      await createLiquidacionMutation.mutateAsync({ nombre, mes, ordenItemIds: ids, comisionistaIds });
    },
    [createLiquidacionMutation, ordenItems]
  );

  const deleteLiquidacion = useCallback(
    (id: string) => {
      deleteLiquidacionMutation.mutate(id);
    },
    [deleteLiquidacionMutation]
  );


  const resetDemoData = useCallback(() => {
    seedDemoMutation.mutate();
  }, [seedDemoMutation]);

  const addCliente = useCallback(
    (c: Omit<Cliente, 'id' | 'createdAt'>) => createClienteMutation.mutateAsync(c),
    [createClienteMutation]
  );

  const updateCliente = useCallback(
    (id: string, c: Partial<Cliente>) =>
      updateClienteMutation.mutateAsync({ id, data: c }),
    [updateClienteMutation]
  );

  const deleteCliente = useCallback(
    (id: string) => deleteClienteMutation.mutateAsync(id),
    [deleteClienteMutation]
  );

  const addProducto = useCallback(
    (p: Omit<Producto, 'id' | 'createdAt'>) => {
      createProductoMutation.mutate(p);
    },
    [createProductoMutation]
  );

  const updateProducto = useCallback(
    (id: string, p: Partial<Producto>) => {
      updateProductoMutation.mutate({ id, data: p });
    },
    [updateProductoMutation]
  );

  const deleteProducto = useCallback(
    (id: string) => {
      deleteProductoMutation.mutate(id);
    },
    [deleteProductoMutation]
  );

  const addTarifa = useCallback(
    (data: Omit<TarifaClienteProducto, 'id' | 'createdAt'>) => {
      createTarifaMutation.mutate(data);
    },
    [createTarifaMutation]
  );

  const updateTarifa = useCallback(
    (id: string, data: Partial<TarifaClienteProducto>) => {
      updateTarifaMutation.mutate({ id, data });
    },
    [updateTarifaMutation]
  );

  const updateTarifasMasivo = useCallback(
    (ids: string[], cambios: { tipo?: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor?: number; activo?: boolean }) =>
      updateTarifasMasivoMutation.mutateAsync({ ids, cambios }),
    [updateTarifasMasivoMutation]
  );

  const deleteTarifa = useCallback(
    (id: string) => {
      deleteTarifaMutation.mutate(id);
    },
    [deleteTarifaMutation]
  );

  return (
    <AppContext.Provider
      value={{
        comisionistas,
        addComisionista,
        updateComisionista,
        deleteComisionista,
        ordenItems,
        addOrdenItems,
        updateOrdenItem,
        updateEstadoOrden,
        updateEstadoOrdenesMasivo,
        cargando,
        deleteOrdenItem,
        deleteOrdenItems,
        clearOrdenItems,
        assignComisionistasGlobal,
        addComisionistaToItem,
        removeComisionistaFromItem,
        recalcularComisiones,
        recalculandoComisiones: recalcularComisionesMutation.isPending,
        liquidaciones,
        saveLiquidacion,
        deleteLiquidacion,
        resetDemoData,
        clientes,
        addCliente,
        updateCliente,
        deleteCliente,
        productos,
        addProducto,
        updateProducto,
        deleteProducto,
        tarifasClienteProducto,
        addTarifa,
        updateTarifa,
        updateTarifasMasivo,
        deleteTarifa,
        retenciones,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
