'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { Comisionista, OrdenItem, Liquidacion } from '@/types';
import { generarId } from '@/lib/id';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { toast } from 'sonner';

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
  assignComisionistaGlobal: (comisionistaId: string | null) => void;

  liquidaciones: Liquidacion[];
  saveLiquidacion: (nombre: string) => void;
  deleteLiquidacion: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [comisionistas, setComisionistas] = useLocalStorage<Comisionista[]>('comisionistas', []);
  const [ordenItems, setOrdenItems] = useLocalStorage<OrdenItem[]>('ordenItems', []);
  const [liquidaciones, setLiquidaciones] = useLocalStorage<Liquidacion[]>('liquidaciones', []);

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
    setOrdenItems(prev => prev.map(item => item.comisionistaId === id ? { ...item, comisionistaId: null } : item));
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

  const assignComisionistaGlobal = useCallback((comisionistaId: string | null) => {
    setOrdenItems(prev => prev.map(item => ({ ...item, comisionistaId })));
    toast.success('Comisionista asignado globalmente');
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
      assignComisionistaGlobal,
      liquidaciones,
      saveLiquidacion,
      deleteLiquidacion,
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
