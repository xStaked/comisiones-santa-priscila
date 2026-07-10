'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, FileText, FileSpreadsheet, Trash2, Search, Eye, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { exportarPDF, exportarExcel, getTarifaLabel } from '@/lib/export-utils';
import { fetchLiquidacion } from '@/lib/api';
import { OrdenItem, Comisionista } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

function snapshotItemToOrdenItem(item: any): OrdenItem {
  return {
    id: item.id,
    fecha: item.fechaSnapshot,
    numeroOrden: item.numeroOrdenSnapshot,
    finca: item.fincaSnapshot,
    producto: item.productoSnapshot,
    cantidad: item.cantidadSnapshot,
    unidad: item.unidadSnapshot,
    precioUnitario: item.precioUnitarioSnapshot,
    total: item.totalSnapshot,
    sector: item.sectorSnapshot,
    estado: item.estadoSnapshot,
    comisionistas: (item.tarifas || []).map((t: any) => ({ comisionistaId: t.comisionistaId })),
  };
}

function buildComisionistasFromSnapshot(items: any[]): Comisionista[] {
  const map = new Map<string, Comisionista>();
  for (const item of items) {
    for (const t of item.tarifas || []) {
      if (!map.has(t.comisionistaId)) {
        map.set(t.comisionistaId, {
          id: t.comisionistaId,
          nombre: t.comisionistaNombreSnapshot,
          // ponytail: el snapshot no guarda tipo y el cálculo no lo usa
          tipo: 'externo',
          tarifas: [],
        });
      }
      const com = map.get(t.comisionistaId)!;
      if (!com.tarifas.some((ta) => ta.tipo === t.tipoSnapshot && ta.valor === t.valorSnapshot)) {
        com.tarifas.push({ tipo: t.tipoSnapshot, valor: t.valorSnapshot });
      }
    }
  }
  return Array.from(map.values());
}

export function HistorialTab() {
  const { liquidaciones, deleteLiquidacion } = useApp();
  const [search, setSearch] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);

  const filtered = liquidaciones.filter(l =>
    l.nombre.toLowerCase().includes(search.toLowerCase()) ||
    l.mes.includes(search)
  );

  const handleExport = async (liq: typeof liquidaciones[0], type: 'pdf' | 'excel') => {
    setExportingId(liq.id);
    try {
      const detail = await fetchLiquidacion(liq.id);
      const items: OrdenItem[] = (detail.items || []).map(snapshotItemToOrdenItem);
      const comisionistas = buildComisionistasFromSnapshot(detail.items || []);

      const comisionesSnapshot = new Map<string, { comision: number; tarifasLabel: string }>();
      for (const rawItem of detail.items || []) {
        for (const t of rawItem.tarifas || []) {
          const key = `${rawItem.id}|${t.comisionistaId}`;
          const label = t.tipoSnapshot === 'sin_tarifa'
            ? '—'
            : getTarifaLabel({ tipo: t.tipoSnapshot, valor: Number(t.valorSnapshot) });
          const existing = comisionesSnapshot.get(key);
          if (existing) {
            existing.comision += Number(t.comisionCalculada) || 0;
          } else {
            comisionesSnapshot.set(key, { comision: Number(t.comisionCalculada) || 0, tarifasLabel: label });
          }
        }
      }

      if (type === 'pdf') {
        exportarPDF(items, comisionistas, liq.nombre, undefined, [], comisionesSnapshot);
        toast.success('PDF generado');
      } else {
        exportarExcel(items, comisionistas, liq.nombre, undefined, [], comisionesSnapshot);
        toast.success('Excel generado');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al cargar detalle');
    } finally {
      setExportingId(null);
    }
  };

  if (liquidaciones.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
        <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700">Sin liquidaciones guardadas</h3>
        <p className="text-sm text-slate-500 mt-1">Guarda una liquidación desde la pestaña "Liquidación"</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar liquidación..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 bg-white border-slate-200 rounded-xl"
        />
      </div>

      <div className="space-y-4">
        {filtered.map(liq => {
          const isExporting = exportingId === liq.id;

          return (
            <Card key={liq.id} className="card-elevated rounded-2xl overflow-hidden">
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base text-slate-900">{liq.nombre}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700 border-0">{liq.mes}</Badge>
                      <span className="text-xs text-slate-500">
                        {new Date(liq.fechaCreacion).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/historial/${liq.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Eye className="h-4 w-4 mr-2 text-slate-600" />
                      Ver detalle
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isExporting}
                      onClick={() => handleExport(liq, 'pdf')}
                      className="rounded-lg border-slate-200"
                    >
                      {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 mr-2 text-red-500" />}
                      PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isExporting}
                      onClick={() => handleExport(liq, 'excel')}
                      className="rounded-lg border-slate-200"
                    >
                      {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />}
                      Excel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border-slate-200"
                      onClick={() => {
                        if (confirm('¿Eliminar esta liquidación?')) deleteLiquidacion(liq.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
