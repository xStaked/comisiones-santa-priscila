'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Comisionista, OrdenItem, Liquidacion } from '@/types';
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

  const comisionistas: Comisionista[] = comisionistasQuery.data ?? [];
  const ordenItems: OrdenItem[] = ordenesQuery.data ?? [];
  const liquidaciones: Liquidacion[] = liquidacionesQuery.data ?? [];

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
      toast.success('Datos de demo restaurados');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al restaurar datos de demo');
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
      if (ordenItems.length === 0) {
        toast.error('No hay órdenes para guardar');
        return;
      }
      const ids = ordenItems.map((o) => o.id);
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
