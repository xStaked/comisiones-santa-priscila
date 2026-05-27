'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Comisionista, OrdenItem, Liquidacion, Cliente, Producto, Finca, TarifaClienteProducto } from '@/types';
import { toast } from 'sonner';
import {
  fetchComisionistas,
  createComisionista,
  updateComisionista as apiUpdateComisionista,
  deleteComisionista as apiDeleteComisionista,
  fetchOrdenes,
  createOrdenes,
  updateOrden as apiUpdateOrden,
  deleteOrden as apiDeleteOrden,
  asignarComisionista as apiAsignarComisionista,
  desasignarComisionista as apiDesasignarComisionista,
  asignarGlobal as apiAsignarGlobal,
  limpiarOrdenes as apiLimpiarOrdenes,
  fetchLiquidaciones,
  createLiquidacion,
  deleteLiquidacion as apiDeleteLiquidacion,
  restaurarLiquidacion as apiRestaurarLiquidacion,
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
} from '@/lib/api';

interface AppContextType {
  comisionistas: Comisionista[];
  addComisionista: (c: Omit<Comisionista, 'id'>) => void;
  updateComisionista: (id: string, c: Partial<Comisionista>) => void;
  deleteComisionista: (id: string) => void;

  ordenItems: OrdenItem[];
  addOrdenItems: (items: OrdenItem[]) => void;
  updateOrdenItem: (id: string, item: Partial<OrdenItem>) => void;
  deleteOrdenItem: (id: string) => void;
  clearOrdenItems: () => void;
  assignComisionistasGlobal: (comisionistaIds: string[]) => void;
  addComisionistaToItem: (itemId: string, comisionistaId: string) => void;
  removeComisionistaFromItem: (itemId: string, comisionistaId: string) => void;

  liquidaciones: Liquidacion[];
  saveLiquidacion: (nombre: string) => void;
  deleteLiquidacion: (id: string) => void;
  restoreLiquidacion: (id: string) => void;
  resetDemoData: () => void;

  clientes: Cliente[];
  addCliente: (c: Omit<Cliente, 'id' | 'createdAt'>) => void;
  updateCliente: (id: string, c: Partial<Cliente>) => void;
  deleteCliente: (id: string) => void;

  productos: Producto[];
  addProducto: (p: Omit<Producto, 'id' | 'createdAt'>) => void;
  updateProducto: (id: string, p: Partial<Producto>) => void;
  deleteProducto: (id: string) => void;

  tarifasClienteProducto: TarifaClienteProducto[];
  addTarifa: (data: Omit<TarifaClienteProducto, 'id' | 'createdAt'>) => void;
  updateTarifa: (id: string, data: Partial<TarifaClienteProducto>) => void;
  deleteTarifa: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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

  const comisionistas: Comisionista[] = comisionistasQuery.data ?? [];
  const ordenItems: OrdenItem[] = ordenesQuery.data ?? [];
  const liquidaciones: Liquidacion[] = liquidacionesQuery.data ?? [];
  const clientes: Cliente[] = clientesQuery.data ?? [];
  const productos: Producto[] = productosQuery.data ?? [];
  const tarifasClienteProducto: TarifaClienteProducto[] = tarifasClienteProductoQuery.data ?? [];

  // Mutations: Comisionistas
  const createComisionistaMutation = useMutation({
    mutationFn: createComisionista,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comisionistas'] });
      toast.success('Comisionista creado');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al crear comisionista');
    },
  });

  const updateComisionistaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Comisionista> }) => apiUpdateComisionista(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comisionistas'] });
      toast.success('Comisionista actualizado');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar comisionista');
    },
  });

  const deleteComisionistaMutation = useMutation({
    mutationFn: apiDeleteComisionista,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comisionistas'] });
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      toast.success('Comisionista eliminado');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar comisionista');
    },
  });

  // Mutations: Ordenes
  const createOrdenesMutation = useMutation({
    mutationFn: (items: OrdenItem[]) => createOrdenes(items.map(ordenItemToCreatePayload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      toast.success('Órdenes agregadas');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al agregar órdenes');
    },
  });

  const updateOrdenMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<OrdenItem> }) => apiUpdateOrden(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      toast.success('Orden actualizada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar orden');
    },
  });

  const deleteOrdenMutation = useMutation({
    mutationFn: apiDeleteOrden,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      toast.success('Orden eliminada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar orden');
    },
  });

  const limpiarOrdenesMutation = useMutation({
    mutationFn: apiLimpiarOrdenes,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      toast.success('Órdenes limpiadas');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al limpiar órdenes');
    },
  });

  const asignarGlobalMutation = useMutation({
    mutationFn: ({ ordenIds, comisionistaIds }: { ordenIds: string[]; comisionistaIds: string[] }) =>
      apiAsignarGlobal(ordenIds, comisionistaIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      toast.success('Comisionistas asignados globalmente');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al asignar comisionistas');
    },
  });

  const asignarComisionistaMutation = useMutation({
    mutationFn: ({ itemId, comisionistaId }: { itemId: string; comisionistaId: string }) =>
      apiAsignarComisionista(itemId, comisionistaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al asignar comisionista');
    },
  });

  const desasignarComisionistaMutation = useMutation({
    mutationFn: ({ itemId, comisionistaId }: { itemId: string; comisionistaId: string }) =>
      apiDesasignarComisionista(itemId, comisionistaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al desasignar comisionista');
    },
  });

  // Mutations: Liquidaciones
  const createLiquidacionMutation = useMutation({
    mutationFn: ({ nombre, ordenItemIds }: { nombre: string; ordenItemIds: string[] }) =>
      createLiquidacion({ nombre, ordenItemIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['liquidaciones'] });
      toast.success('Liquidación guardada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al guardar liquidación');
    },
  });

  const deleteLiquidacionMutation = useMutation({
    mutationFn: apiDeleteLiquidacion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['liquidaciones'] });
      toast.success('Liquidación eliminada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar liquidación');
    },
  });

  const restaurarLiquidacionMutation = useMutation({
    mutationFn: apiRestaurarLiquidacion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['liquidaciones'] });
      toast.success('Liquidación restaurada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al restaurar liquidación');
    },
  });

  const seedDemoMutation = useMutation({
    mutationFn: seedDemo,
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success('Datos reales cargados');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al cargar datos reales');
    },
  });

  // Mutations: Clientes
  const createClienteMutation = useMutation({
    mutationFn: createCliente,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success('Cliente creado');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al crear cliente');
    },
  });

  const updateClienteMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Cliente> }) => apiUpdateCliente(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success('Cliente actualizado');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar cliente');
    },
  });

  const deleteClienteMutation = useMutation({
    mutationFn: apiDeleteCliente,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
      toast.success('Cliente eliminado');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar cliente');
    },
  });

  // Mutations: Productos
  const createProductoMutation = useMutation({
    mutationFn: createProducto,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Producto creado');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al crear producto');
    },
  });

  const updateProductoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Producto> }) => apiUpdateProducto(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Producto actualizado');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar producto');
    },
  });

  const deleteProductoMutation = useMutation({
    mutationFn: apiDeleteProducto,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Producto eliminado');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar producto');
    },
  });

  // Mutations: Tarifas Cliente Producto
  const createTarifaMutation = useMutation({
    mutationFn: createTarifaClienteProducto,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarifas-cliente-producto'] });
      toast.success('Tarifa creada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al crear tarifa');
    },
  });

  const updateTarifaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TarifaClienteProducto> }) => apiUpdateTarifaClienteProducto(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarifas-cliente-producto'] });
      toast.success('Tarifa actualizada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar tarifa');
    },
  });

  const deleteTarifaMutation = useMutation({
    mutationFn: apiDeleteTarifaClienteProducto,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarifas-cliente-producto'] });
      toast.success('Tarifa eliminada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar tarifa');
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
    (items: OrdenItem[]) => {
      createOrdenesMutation.mutate(items);
    },
    [createOrdenesMutation]
  );

  const updateOrdenItem = useCallback(
    (id: string, item: Partial<OrdenItem>) => {
      updateOrdenMutation.mutate({ id, data: item });
    },
    [updateOrdenMutation]
  );

  const deleteOrdenItem = useCallback(
    (id: string) => {
      deleteOrdenMutation.mutate(id);
    },
    [deleteOrdenMutation]
  );

  const clearOrdenItems = useCallback(() => {
    limpiarOrdenesMutation.mutate();
  }, [limpiarOrdenesMutation]);

  const assignComisionistasGlobal = useCallback(
    (comisionistaIds: string[]) => {
      const ordenIds = ordenItems.map((o) => o.id);
      asignarGlobalMutation.mutate({ ordenIds, comisionistaIds });
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

  const saveLiquidacion = useCallback(
    (nombre: string) => {
      const itemsActivos = ordenItems.filter((o) => o.estado !== 'liquidado' && o.estado !== 'anulado');
      if (itemsActivos.length === 0) {
        toast.error('No hay órdenes para guardar');
        return;
      }
      const ids = itemsActivos.map((o) => o.id);
      createLiquidacionMutation.mutate({ nombre, ordenItemIds: ids });
    },
    [createLiquidacionMutation, ordenItems]
  );

  const deleteLiquidacion = useCallback(
    (id: string) => {
      deleteLiquidacionMutation.mutate(id);
    },
    [deleteLiquidacionMutation]
  );

  const restoreLiquidacion = useCallback(
    (id: string) => {
      restaurarLiquidacionMutation.mutate(id);
    },
    [restaurarLiquidacionMutation]
  );

  const resetDemoData = useCallback(() => {
    seedDemoMutation.mutate();
  }, [seedDemoMutation]);

  const addCliente = useCallback(
    (c: Omit<Cliente, 'id' | 'createdAt'>) => {
      createClienteMutation.mutate(c);
    },
    [createClienteMutation]
  );

  const updateCliente = useCallback(
    (id: string, c: Partial<Cliente>) => {
      updateClienteMutation.mutate({ id, data: c });
    },
    [updateClienteMutation]
  );

  const deleteCliente = useCallback(
    (id: string) => {
      deleteClienteMutation.mutate(id);
    },
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
        deleteOrdenItem,
        clearOrdenItems,
        assignComisionistasGlobal,
        addComisionistaToItem,
        removeComisionistaFromItem,
        liquidaciones,
        saveLiquidacion,
        deleteLiquidacion,
        restoreLiquidacion,
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
        deleteTarifa,
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
