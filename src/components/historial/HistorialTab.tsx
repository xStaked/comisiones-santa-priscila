'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, FileText, FileSpreadsheet, Trash2, Eye, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { exportarPDF, exportarExcel, getTarifaLabel, calcularComisionTotalItem } from '@/lib/export-utils';
import { fetchLiquidacion } from '@/lib/api';
import { OrdenItem, Comisionista } from '@/types';
import { Aviso, Buscador, Chip, Panel, Vacio, fechaCorta, money } from '@/components/ui/dc';
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

const COLS = 'grid-cols-[minmax(0,1.7fr)_120px_100px_120px_130px_190px]';

export function HistorialTab() {
  const { liquidaciones, comisionistas, deleteLiquidacion, clientes } = useApp();
  const [search, setSearch] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);

  const filtered = liquidaciones.filter(
    (l) => l.nombre.toLowerCase().includes(search.toLowerCase()) || l.mes.includes(search)
  );

  const handleExport = async (liq: (typeof liquidaciones)[0], type: 'pdf' | 'excel') => {
    setExportingId(liq.id);
    try {
      const detail = await fetchLiquidacion(liq.id);
      const items: OrdenItem[] = (detail.items || []).map(snapshotItemToOrdenItem);
      const comisionistasSnap = buildComisionistasFromSnapshot(detail.items || []);

      const comisionesSnapshot = new Map<string, { comision: number; tarifasLabel: string }>();
      for (const rawItem of detail.items || []) {
        for (const t of rawItem.tarifas || []) {
          const key = `${rawItem.id}|${t.comisionistaId}`;
          const label =
            t.tipoSnapshot === 'sin_tarifa'
              ? '—'
              : getTarifaLabel({ tipo: t.tipoSnapshot, valor: Number(t.valorSnapshot) });
          const existing = comisionesSnapshot.get(key);
          if (existing) {
            existing.comision += Number(t.comisionCalculada) || 0;
          } else {
            comisionesSnapshot.set(key, {
              comision: Number(t.comisionCalculada) || 0,
              tarifasLabel: label,
            });
          }
        }
      }

      if (type === 'pdf') {
        exportarPDF(items, comisionistasSnap, liq.nombre, undefined, [], comisionesSnapshot);
        toast.success('PDF generado');
      } else {
        exportarExcel(items, comisionistasSnap, liq.nombre, undefined, [], comisionesSnapshot, undefined, clientes);
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
      <Vacio
        icono={Calendar}
        titulo="Sin liquidaciones guardadas"
        nota="Guarda una liquidación desde el módulo Liquidación para verla aquí."
      />
    );
  }

  return (
    <div className="flex max-w-[1200px] flex-col gap-3.5">
      <Aviso>
        Las liquidaciones guardadas trabajan sobre{' '}
        <strong className="font-semibold">datos congelados</strong> al momento de guardarlas. Editar
        una tarifa hoy no cambia lo que aquí aparece.
      </Aviso>

      <Buscador value={search} onChange={setSearch} placeholder="Buscar liquidación…" />

      <Panel>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className={`th-tabla grid ${COLS} gap-3 border-b border-border bg-[#FAFBFC] px-[18px] py-2.5`}>
              <div>Liquidación</div>
              <div>Periodo</div>
              <div className="text-right">Registros</div>
              <div className="text-right">Comisionistas</div>
              <div className="text-right">Total</div>
              <div className="text-right">Acciones</div>
            </div>

            {filtered.length === 0 && (
              <div className="px-[18px] py-10 text-center text-sm text-[#98A2B3]">
                Ninguna liquidación coincide con «{search}»
              </div>
            )}

            {filtered.map((liq) => {
              const exportando = exportingId === liq.id;
              const total = liq.items.reduce(
                (s, item) => s + calcularComisionTotalItem(item, comisionistas),
                0
              );
              const personas = new Set(
                liq.items.flatMap((i) => i.comisionistas.map((a) => a.comisionistaId))
              ).size;

              return (
                <div
                  key={liq.id}
                  className={`grid ${COLS} items-center gap-3 border-b border-[#F2F4F6] px-[18px] py-3 transition-colors hover:bg-[#FAFBFC]`}
                >
                  <div className="min-w-0">
                    <Link
                      href={`/historial/${liq.id}`}
                      className="block truncate text-[13px] font-medium text-[#0B1220] hover:text-primary"
                    >
                      {liq.nombre}
                    </Link>
                    <div className="cifra mt-0.5 text-[11.5px] text-[#98A2B3]">
                      Congelada el {fechaCorta(liq.fechaCreacion)}
                    </div>
                  </div>
                  <div>
                    <Chip mono>{liq.mes}</Chip>
                  </div>
                  <div className="cifra text-right text-[12.5px] text-[#6B7684]">
                    {liq.items.length}
                  </div>
                  <div className="cifra text-right text-[12.5px] text-[#6B7684]">{personas}</div>
                  <div className="cifra text-right text-[13px] font-semibold text-primary">
                    {money(total)}
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <Link
                      href={`/historial/${liq.id}`}
                      title="Ver detalle"
                      className="inline-flex h-7 items-center justify-center rounded-[7px] border border-[#E0E4E9] bg-white px-2.5 text-[11.5px] text-[#475467] transition hover:border-[#C6CDD6] hover:no-underline hover:text-[#0B1220]"
                    >
                      <Eye className="size-3.5" />
                    </Link>
                    <button
                      type="button"
                      disabled={exportando}
                      onClick={() => handleExport(liq, 'pdf')}
                      className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-[#E0E4E9] bg-white px-2.5 text-[11.5px] text-[#475467] transition hover:border-[#C6CDD6] disabled:opacity-50"
                    >
                      {exportando ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <FileText className="size-3 text-[#B91C1C]" />
                      )}
                      PDF
                    </button>
                    <button
                      type="button"
                      disabled={exportando}
                      onClick={() => handleExport(liq, 'excel')}
                      className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-[#E0E4E9] bg-white px-2.5 text-[11.5px] text-[#475467] transition hover:border-[#C6CDD6] disabled:opacity-50"
                    >
                      {exportando ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="size-3 text-primary" />
                      )}
                      Excel
                    </button>
                    <button
                      type="button"
                      title="Eliminar"
                      onClick={() => {
                        if (confirm('¿Eliminar esta liquidación?')) deleteLiquidacion(liq.id);
                      }}
                      className="inline-flex size-7 items-center justify-center rounded-[7px] border border-[#E0E4E9] bg-white text-[#98A2B3] transition hover:border-[#F5C2C2] hover:text-[#B91C1C]"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
    </div>
  );
}
