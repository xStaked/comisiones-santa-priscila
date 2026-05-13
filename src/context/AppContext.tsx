'use client';

import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { Comisionista, OrdenItem, Liquidacion, LegacyComisionista, LegacyOrdenItem } from '@/types';
import { generarId } from '@/lib/id';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { toast } from 'sonner';
import { demoComisionistas, demoOrdenItems, demoLiquidaciones } from '@/lib/demo-data';

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

function esLegacyComisionista(c: any): c is LegacyComisionista {
  return c && typeof c.tipo === 'string' && typeof c.valor === 'number' && !Array.isArray(c.tarifas);
}

function esLegacyOrdenItem(item: any): item is LegacyOrdenItem {
  return item && (typeof item.comisionistaId === 'string' || item.comisionistaId === null) && !Array.isArray(item.comisionistas);
}

function migrarComisionista(c: LegacyComisionista): Comisionista {
  return {
    id: c.id,
    nombre: c.nombre,
    tarifas: [{ tipo: c.tipo, valor: c.valor }],
  };
}

function migrarOrdenItem(item: LegacyOrdenItem): OrdenItem {
  return {
    id: item.id,
    fecha: item.fecha,
    numeroOrden: item.numeroOrden,
    finca: item.finca,
    producto: item.producto,
    cantidad: item.cantidad,
    unidad: item.unidad,
    precioUnitario: item.precioUnitario,
    total: item.total,
    comisionistas: item.comisionistaId ? [{ comisionistaId: item.comisionistaId }] : [],
    sector: item.sector,
    estado: item.estado,
  };
}

function migrarLiquidacion(liq: any): Liquidacion {
  return {
    id: liq.id,
    mes: liq.mes,
    nombre: liq.nombre,
    fechaCreacion: liq.fechaCreacion,
    items: Array.isArray(liq.items) ? liq.items.map((item: any) =>
      esLegacyOrdenItem(item) ? migrarOrdenItem(item) : item
    ) : [],
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [comisionistas, setComisionistas] = useLocalStorage<Comisionista[]>('comisionistas', []);
  const [ordenItems, setOrdenItems] = useLocalStorage<OrdenItem[]>('ordenItems', []);
  const [liquidaciones, setLiquidaciones] = useLocalStorage<Liquidacion[]>('liquidaciones', []);
  const [dataMigrated, setDataMigrated] = useLocalStorage<boolean>('dataMigrated_v2', false);

  // Precargar datos de demo si no hay nada guardado + migración automática
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Migración de datos legacy (solo una vez)
    if (!dataMigrated) {
      try {
        const rawComisionistas = window.localStorage.getItem('comisionistas');
        const rawOrdenes = window.localStorage.getItem('ordenItems');
        const rawLiquidaciones = window.localStorage.getItem('liquidaciones');

        let migratedComisionistas: Comisionista[] | null = null;
        let migratedOrdenes: OrdenItem[] | null = null;
        let migratedLiquidaciones: Liquidacion[] | null = null;

        if (rawComisionistas) {
          const parsed = JSON.parse(rawComisionistas);
          if (Array.isArray(parsed) && parsed.length > 0 && esLegacyComisionista(parsed[0])) {
            migratedComisionistas = parsed.map(migrarComisionista);
          }
        }

        if (rawOrdenes) {
          const parsed = JSON.parse(rawOrdenes);
          if (Array.isArray(parsed) && parsed.length > 0 && esLegacyOrdenItem(parsed[0])) {
            migratedOrdenes = parsed.map(migrarOrdenItem);
          }
        }

        if (rawLiquidaciones) {
          const parsed = JSON.parse(rawLiquidaciones);
          if (Array.isArray(parsed) && parsed.length > 0) {
            migratedLiquidaciones = parsed.map(migrarLiquidacion);
          }
        }

        if (migratedComisionistas) setComisionistas(migratedComisionistas);
        if (migratedOrdenes) setOrdenItems(migratedOrdenes);
        if (migratedLiquidaciones) setLiquidaciones(migratedLiquidaciones);

        setDataMigrated(true);
      } catch (e) {
        console.error('Error en migración de datos:', e);
      }
    }

    // Precargar demo si no hay datos
    const hasData =
      window.localStorage.getItem('comisionistas') ||
      window.localStorage.getItem('ordenItems') ||
      window.localStorage.getItem('liquidaciones');
    if (!hasData) {
      setComisionistas(demoComisionistas);
      setOrdenItems(demoOrdenItems);
      setLiquidaciones(demoLiquidaciones);
    }
  }, [setComisionistas, setOrdenItems, setLiquidaciones, dataMigrated, setDataMigrated]);

  const addComisionista = useCallback((c: Omit<Comisionista, 'id'>) => {
    const newComisionista: Comisionista = { ...c, id: generarId() };
    setComisionistas(prev => [...prev, newComisionista]);
    toast.success('Comisionista creado');
  }, [setComisionistas]);

  const updateComisionista = useCallback((id: string, c: Partial<Comisionista>) => {
    setComisionistas(prev => prev.map(item => item.id === id ? { ...item, ...c } : item));
    toast.success('Comisionista actualizado');
  }, [setComisionistas]);

  const deleteComisionista = useCallback((id: string) => {
    setComisionistas(prev => prev.filter(item => item.id !== id));
    setOrdenItems(prev => prev.map(item => ({
      ...item,
      comisionistas: item.comisionistas.filter(a => a.comisionistaId !== id),
    })));
    toast.success('Comisionista eliminado');
  }, [setComisionistas, setOrdenItems]);

  const addOrdenItems = useCallback((items: OrdenItem[]) => {
    setOrdenItems(prev => [...prev, ...items]);
    toast.success(`${items.length} registro(s) agregado(s)`);
  }, [setOrdenItems]);

  const updateOrdenItem = useCallback((id: string, item: Partial<OrdenItem>) => {
    setOrdenItems(prev => prev.map(i => i.id === id ? { ...i, ...item } : i));
  }, [setOrdenItems]);

  const deleteOrdenItem = useCallback((id: string) => {
    setOrdenItems(prev => prev.filter(i => i.id !== id));
    toast.success('Registro eliminado');
  }, [setOrdenItems]);

  const clearOrdenItems = useCallback(() => {
    setOrdenItems([]);
    toast.success('Órdenes limpiadas');
  }, [setOrdenItems]);

  const assignComisionistasGlobal = useCallback((comisionistaIds: string[]) => {
    setOrdenItems(prev => prev.map(item => ({
      ...item,
      comisionistas: comisionistaIds.map(id => ({ comisionistaId: id })),
    })));
    toast.success('Comisionistas asignados globalmente');
  }, [setOrdenItems]);

  const addComisionistaToItem = useCallback((itemId: string, comisionistaId: string) => {
    setOrdenItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      if (item.comisionistas.some(a => a.comisionistaId === comisionistaId)) return item;
      return { ...item, comisionistas: [...item.comisionistas, { comisionistaId }] };
    }));
  }, [setOrdenItems]);

  const removeComisionistaFromItem = useCallback((itemId: string, comisionistaId: string) => {
    setOrdenItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return { ...item, comisionistas: item.comisionistas.filter(a => a.comisionistaId !== comisionistaId) };
    }));
  }, [setOrdenItems]);

  const saveLiquidacion = useCallback((nombre: string) => {
    if (ordenItems.length === 0) {
      toast.error('No hay órdenes para guardar');
      return;
    }
    const now = new Date();
    const newLiquidacion: Liquidacion = {
      id: generarId(),
      mes: now.toISOString().slice(0, 7),
      items: [...ordenItems],
      fechaCreacion: now.toISOString(),
      nombre: nombre || `Liquidación ${now.toLocaleDateString('es-ES')}`,
    };
    setLiquidaciones(prev => [newLiquidacion, ...prev]);
    setOrdenItems([]);
    toast.success('Liquidación guardada');
  }, [ordenItems, setLiquidaciones, setOrdenItems]);

  const deleteLiquidacion = useCallback((id: string) => {
    setLiquidaciones(prev => prev.filter(l => l.id !== id));
    toast.success('Liquidación eliminada');
  }, [setLiquidaciones]);

  const restoreLiquidacion = useCallback((id: string) => {
    const liq = liquidaciones.find(l => l.id === id);
    if (!liq) {
      toast.error('Liquidación no encontrada');
      return;
    }
    // Restaurar items con nuevos IDs para evitar conflictos
    const restoredItems: OrdenItem[] = liq.items.map(item => ({
      ...item,
      id: generarId(),
    }));
    setOrdenItems(prev => [...prev, ...restoredItems]);
    setLiquidaciones(prev => prev.filter(l => l.id !== id));
    toast.success(`${restoredItems.length} órdenes restauradas a activas`);
  }, [liquidaciones, setOrdenItems, setLiquidaciones]);

  const resetDemoData = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem('comisionistas');
    window.localStorage.removeItem('ordenItems');
    window.localStorage.removeItem('liquidaciones');
    window.localStorage.removeItem('dataMigrated_v2');
    setComisionistas(demoComisionistas);
    setOrdenItems(demoOrdenItems);
    setLiquidaciones(demoLiquidaciones);
    toast.success('Datos de demo restaurados');
  }, [setComisionistas, setOrdenItems, setLiquidaciones]);

  return (
    <AppContext.Provider value={{
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
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
