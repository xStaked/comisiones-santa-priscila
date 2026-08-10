'use client';

import { useState, useMemo } from 'react';
import { FileText, FileSpreadsheet, Save, Calculator, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { useApp } from '@/context/AppContext';
import { exportarPDF, exportarExcel, calcularDetalleComision, getCantidadParaTarifaKg } from '@/lib/export-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Avatar,
  BarraAcciones,
  BotonPrimario,
  BotonSecundario,
  Panel,
  PanelTitulo,
  Vacio,
  money,
  num,
} from '@/components/ui/dc';
import { toast } from 'sonner';

const COLS = 'grid-cols-[34px_130px_92px_minmax(0,1.3fr)_minmax(0,1fr)_90px_108px_132px]';

export function LiquidacionTab() {
  const { comisionistas, ordenItems, saveLiquidacion, tarifasClienteProducto, clientes, retenciones } = useApp();
  const [filterComisionista, setFilterComisionista] = useState('');
  const [filterFactura, setFilterFactura] = useState('');
  const [nombreLiquidacion, setNombreLiquidacion] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  // A quién se le paga en esta liquidación. Vacío = nadie: hay que elegir explícitamente.
  const [comisionistasAPagar, setComisionistasAPagar] = useState<Set<string>>(new Set());
  // La selección es por ORDEN (no por ítem): destildar saca la orden completa con todos sus productos.
  // Por defecto todo está seleccionado; el usuario destilda lo que NO quiere liquidar.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  // Acordeones: default vacío = todas las órdenes cerradas.
  const [expandedOrdenIds, setExpandedOrdenIds] = useState<Set<string>>(new Set());
  const ordenKey = (item: { ordenId?: string | null; fecha: string; numeroOrden: string; clienteId?: string | null }) =>
    item.ordenId || `${item.fecha}-${item.numeroOrden}-${item.clienteId || ''}`;
  const toggleCollapse = (key: string) => setExpandedOrdenIds(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const comisionistaMap = useMemo(() =>
    new Map(comisionistas.map(c => [c.id, c])),
    [comisionistas]
  );
  const nombreComisionistaFiltro = filterComisionista
    ? comisionistaMap.get(filterComisionista)?.nombre || 'Comisionista no encontrado'
    : 'Todos los comisionistas';

  // La liquidación es por persona: solo se muestran las asignaciones aún no liquidadas.
  // Un ítem puede reaparecer aquí si a otro comisionista todavía no se le ha pagado.
  const ordenItemsPagados = useMemo(
    () =>
      ordenItems
        .filter(item => item.estado === 'pagada')
        // Sin asignaciones = liquidable con comisión 0; con asignaciones, al menos una pendiente.
        .filter(item => item.comisionistas.length === 0 || item.comisionistas.some(a => !a.liquidacionId))
        .map(item => ({
          ...item,
          comisionistas: item.comisionistas.filter(a => !a.liquidacionId),
        })),
    [ordenItems]
  );

  const filteredItems = useMemo(() => {
    return ordenItemsPagados
      .filter(i => {
        const matchComisionista = !filterComisionista || i.comisionistas.some(a => a.comisionistaId === filterComisionista);
        const matchFactura = !filterFactura || i.numeroOrden.toLowerCase().includes(filterFactura.toLowerCase());
        return matchComisionista && matchFactura;
      })
      // Con filtro por persona, los totales y el guardado deben cubrir solo a esa persona.
      .map(i =>
        filterComisionista
          ? { ...i, comisionistas: i.comisionistas.filter(a => a.comisionistaId === filterComisionista) }
          : i
      );
  }, [ordenItemsPagados, filterComisionista, filterFactura]);

  const cantidadOrdenes = useMemo(() => {
    const ids = new Set(
      filteredItems.filter(i => !excludedIds.has(ordenKey(i))).map(ordenKey)
    );
    return ids.size;
  }, [filteredItems, excludedIds]);

  const toggleOrden = (key: string) => setExcludedIds(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const ordenesFiltradas = useMemo(
    () => Array.from(new Set(filteredItems.map(ordenKey))),
    [filteredItems]
  );
  const todosSeleccionados = ordenesFiltradas.length > 0 && ordenesFiltradas.every(k => !excludedIds.has(k));

  const toggleTodos = () => setExcludedIds(prev => {
    const next = new Set(prev);
    if (todosSeleccionados) ordenesFiltradas.forEach(k => next.add(k));
    else ordenesFiltradas.forEach(k => next.delete(k));
    return next;
  });

  // Volumen acumulado por comisionista sobre las órdenes SELECCIONADAS
  // (paridad con crear_liquidacion del backend, que acumula sobre los ítems enviados).
  const kgPorComisionista = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems
      .filter(i => !excludedIds.has(ordenKey(i)))
      .forEach(item => {
        item.comisionistas.forEach(a => {
          map.set(a.comisionistaId, (map.get(a.comisionistaId) || 0) + getCantidadParaTarifaKg(item));
        });
      });
    return map;
  }, [filteredItems, excludedIds]);

  const itemsConComision = useMemo(() => {
    return filteredItems.map(item => {
      const comisionesAsignadas = item.comisionistas.flatMap(a => {
        const comisionista = comisionistaMap.get(a.comisionistaId);
        if (!comisionista) return [];
        return [{
          ...comisionista,
          ...calcularDetalleComision(item, comisionista, tarifasClienteProducto, kgPorComisionista.get(a.comisionistaId)),
        }];
      });
      const comisionTotal = comisionesAsignadas.reduce((total, asignacion) => total + asignacion.comision, 0);
      return { ...item, comisionTotal, comisionesAsignadas };
    });
    // retenciones: no se lee directamente, pero calcularDetalleComision consulta el
    // estado de módulo de export-utils que retenciones puebla; sin esta dependencia
    // el memo no se recalcula cuando llegan los periodos de retención.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems, comisionistaMap, tarifasClienteProducto, kgPorComisionista, retenciones]);

  // Ítems marcados por el usuario (base para totales, resumen, exportación y guardado).
  const selectedItemsConComision = useMemo(
    () => itemsConComision.filter(i => !excludedIds.has(ordenKey(i))),
    [itemsConComision, excludedIds]
  );

  // Agrupa los productos por orden (contiguos) para mostrar un solo checkbox por orden.
  const gruposPorOrden = useMemo(() => {
    const map = new Map<string, typeof itemsConComision>();
    itemsConComision.forEach(item => {
      const k = ordenKey(item);
      const arr = map.get(k);
      if (arr) arr.push(item); else map.set(k, [item]);
    });
    return Array.from(map.entries());
  }, [itemsConComision]);

  const resumenPorComisionista = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; tarifasLabel: string; items: number; comision: number }>();
    selectedItemsConComision.forEach(item => {
      item.comisionesAsignadas.forEach(com => {
        const existente = map.get(com.id);
        if (existente) {
          existente.items += 1;
          existente.comision += com.comision;
        } else {
          map.set(com.id, {
            id: com.id,
            nombre: com.nombre,
            tarifasLabel: com.tarifasLabel,
            items: 1,
            comision: com.comision,
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [selectedItemsConComision]);

  /** Base facturada sobre la que se calculó la comisión de cada persona. */
  const basePorComisionista = useMemo(() => {
    const map = new Map<string, number>();
    selectedItemsConComision.forEach(item => {
      item.comisionesAsignadas.forEach(com => {
        map.set(com.id, (map.get(com.id) || 0) + item.total);
      });
    });
    return map;
  }, [selectedItemsConComision]);

  const totalComision = selectedItemsConComision.reduce((s, i) => s + i.comisionTotal, 0);
  const totalCantidad = selectedItemsConComision.reduce((s, i) => s + i.cantidad, 0);
  const totalOrden = selectedItemsConComision.reduce((s, i) => s + i.total, 0);

  const selectedFiltered = useMemo(
    () => filteredItems.filter(i => !excludedIds.has(ordenKey(i))),
    [filteredItems, excludedIds]
  );

  const handleExportPDF = () => {
    if (selectedFiltered.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const com = filterComisionista ? comisionistaMap.get(filterComisionista) : undefined;
    exportarPDF(selectedFiltered, comisionistas, 'Liquidacion', com?.nombre, tarifasClienteProducto, undefined, kgPorComisionista);
    toast.success('PDF generado');
  };

  const handleExportExcel = () => {
    if (selectedFiltered.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const com = filterComisionista ? comisionistaMap.get(filterComisionista) : undefined;
    exportarExcel(selectedFiltered, comisionistas, 'Liquidacion', com?.nombre, tarifasClienteProducto, undefined, kgPorComisionista, clientes);
    toast.success('Excel generado');
  };

  const handleExportTotalesExcel = () => {
    if (resumenPorComisionista.length === 0) {
      toast.error('No hay totales para exportar');
      return;
    }

    const data = [
      ...resumenPorComisionista.map((com) => ({
        Comisionista: com.nombre,
        'Tarifa aplicada': com.tarifasLabel,
        Items: com.items,
        'Comisión total': Number(com.comision.toFixed(2)),
      })),
      {
        Comisionista: 'Total Comisión',
        'Tarifa aplicada': '',
        Items: resumenPorComisionista.reduce((total, com) => total + com.items, 0),
        'Comisión total': Number(totalComision.toFixed(2)),
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Totales');
    XLSX.writeFile(wb, 'Liquidacion_Totales_Comisionistas.xlsx');
    toast.success('Totales exportados');
  };

  const queryClient = useQueryClient();

  const handleSave = async () => {
    if (!nombreLiquidacion.trim()) {
      toast.error('Ingresa un nombre para la liquidación');
      return;
    }
    // Si no hay nadie pendiente, se liquida igual: saca de la lista los ítems sin comisionista.
    if (resumenPorComisionista.length > 0 && comisionistasAPagar.size === 0) {
      toast.error('Selecciona al menos un comisionista a pagar');
      return;
    }
    // Refrescar datos para reducir el riesgo de enviar ítems stale; el backend revalida el estado.
    await queryClient.refetchQueries({ queryKey: ['ordenes'] });
    const ordenesActualizadas = queryClient.getQueryData<typeof ordenItems>(['ordenes']) ?? ordenItems;
    const seleccionados = new Set(selectedFiltered.map(i => i.id));
    const ids = ordenesActualizadas
      .filter(item => item.estado === 'pagada')
      .filter(item => seleccionados.has(item.id))
      .map((i) => i.id);
    if (ids.length === 0) {
      toast.error('No hay órdenes pagadas seleccionadas para guardar');
      return;
    }
    // Si se paga a todos los pendientes y no hay filtro, se omite la lista: así los ítems
    // sin comisionista asignado también quedan liquidados (comisión 0), como antes.
    const todosLosPendientes =
      !filterComisionista && comisionistasAPagar.size === resumenPorComisionista.length;
    saveLiquidacion(
      nombreLiquidacion,
      ids,
      todosLosPendientes ? undefined : Array.from(comisionistasAPagar)
    );
    setNombreLiquidacion('');
    setPreviewOpen(false);
  };

  const handlePreviewSave = () => {
    if (selectedFiltered.length === 0) {
      toast.error('Selecciona al menos una orden pagada para guardar');
      return;
    }
    setNombreLiquidacion(`Liquidación ${new Date().toLocaleDateString('es-ES')}`);
    // El filtro de la barra superior solo preselecciona; la decisión se toma en el modal.
    setComisionistasAPagar(new Set(filterComisionista ? [filterComisionista] : []));
    setPreviewOpen(true);
  };

  const toggleComisionistaAPagar = (id: string) => setComisionistasAPagar(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const resumenAPagar = resumenPorComisionista.filter(c => comisionistasAPagar.has(c.id));
  const totalAPagar = resumenAPagar.reduce((s, c) => s + c.comision, 0);
  const itemsAPagar = resumenAPagar.reduce((s, c) => s + c.items, 0);

  if (ordenItems.length === 0) {
    return (
      <Vacio
        icono={Calculator}
        titulo="Sin facturas cargadas"
        nota="Ve a Facturas para agregar registros y generar una liquidación."
      />
    );
  }

  if (ordenItemsPagados.length === 0) {
    return (
      <Vacio
        icono={Calculator}
        titulo="Sin facturas pagadas"
        nota="Marca una factura como pagada para calcular y guardar su liquidación."
      />
    );
  }

  return (
    <div className="flex max-w-[1360px] flex-col gap-3.5 pb-24">
      <BarraAcciones>
        <div className="flex h-9 items-center gap-2.5 rounded-[9px] border border-[#E0E4E9] bg-white px-3">
          <span className="text-[11.5px] text-[#7A8798]">Comisionista</span>
          <Select value={filterComisionista} onValueChange={(value) => setFilterComisionista(value ?? '')}>
            <SelectTrigger className="h-7 border-0 bg-transparent px-0 text-[12.5px] font-medium text-[#0B1220] shadow-none focus-visible:ring-0">
              <SelectValue placeholder="Todos">{nombreComisionistaFiltro}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los comisionistas</SelectItem>
              {comisionistas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex h-9 items-center gap-2.5 rounded-[9px] border border-[#E0E4E9] bg-white px-3 focus-within:border-primary">
          <span className="text-[11.5px] text-[#7A8798]">Factura</span>
          <input
            value={filterFactura}
            onChange={(e) => setFilterFactura(e.target.value)}
            placeholder="Todas"
            className="w-32 bg-transparent text-[12.5px] text-[#0B1220] outline-none placeholder:text-[#98A2B3]"
          />
        </div>

        <div className="flex-1" />

        <BotonSecundario onClick={handleExportPDF}>
          <FileText className="size-3.5 text-[#B91C1C]" /> PDF
        </BotonSecundario>
        <BotonSecundario onClick={handleExportExcel}>
          <FileSpreadsheet className="size-3.5 text-primary" /> Excel
        </BotonSecundario>
      </BarraAcciones>

      {/* Tabla de facturas pagadas — cabecera oscura del prototipo */}
      <Panel>
        <div className="overflow-x-auto">
          <div className="min-w-[1040px]">
            <div className={`grid ${COLS} items-center gap-2.5 bg-[#0B1220] px-4 py-[11px] text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#8FA0B4]`}>
              <div>
                <input
                  type="checkbox"
                  className="size-[15px] cursor-pointer accent-primary align-middle"
                  checked={todosSeleccionados}
                  onChange={toggleTodos}
                  aria-label="Seleccionar todo"
                />
              </div>
              <div>Factura</div>
              <div>Fecha</div>
              <div>Cliente</div>
              <div>Sector</div>
              <div className="text-right">Cantidad</div>
              <div className="text-right">Total</div>
              <div className="text-right">Comisión</div>
            </div>

            {itemsConComision.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-[#98A2B3]">
                No hay registros con el filtro seleccionado
              </div>
            ) : (
              gruposPorOrden.map(([key, grupo]) => {
                const seleccionado = !excludedIds.has(key);
                const expandida = expandedOrdenIds.has(key);
                const cab = grupo[0];
                const cantOrden = grupo.reduce((s, i) => s + i.cantidad, 0);
                const totOrden = grupo.reduce((s, i) => s + i.total, 0);
                const comOrden = grupo.reduce((s, i) => s + i.comisionTotal, 0);
                const sectores = new Set(grupo.map((i) => i.fincaRel?.nombre || i.finca).filter(Boolean));
                const sector =
                  sectores.size === 0 ? '—' : sectores.size === 1 ? [...sectores][0] : `${sectores.size} sectores`;

                return (
                  <div key={key}>
                    <div
                      onClick={() => toggleOrden(key)}
                      className={`grid ${COLS} cursor-pointer items-center gap-2.5 border-b border-[#F2F4F6] px-4 py-3 transition-colors hover:bg-[#FAFBFC] ${seleccionado ? '' : 'opacity-[0.42]'}`}
                    >
                      <div>
                        <input
                          type="checkbox"
                          className="size-[15px] cursor-pointer accent-primary align-middle"
                          checked={seleccionado}
                          onChange={() => toggleOrden(key)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Seleccionar factura ${cab.numeroOrden}`}
                        />
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCollapse(key);
                          }}
                          aria-expanded={expandida}
                          aria-label={`Ver productos de ${cab.numeroOrden}`}
                          className="flex items-center text-[#98A2B3] hover:text-[#0B1220]"
                        >
                          <ChevronRight
                            className={`size-3.5 shrink-0 transition-transform duration-200 ${expandida ? 'rotate-90' : ''}`}
                          />
                        </button>
                        <span className="cifra truncate text-[12.5px] font-medium text-[#0B1220]">
                          {cab.numeroOrden}
                        </span>
                      </div>
                      <div className="cifra text-[12.5px] text-[#6B7684]">{cab.fecha}</div>
                      <div className="truncate text-[13px] text-[#0B1220]">{cab.cliente?.nombre || '—'}</div>
                      <div className="truncate text-[12.5px] text-[#6B7684]">{sector}</div>
                      <div className="cifra text-right text-[12.5px] text-[#344054]">
                        {num(cantOrden, 0)}
                      </div>
                      <div className="cifra text-right text-[12.5px] text-[#344054]">{money(totOrden)}</div>
                      <div
                        className="cifra text-right text-[13.5px] font-semibold"
                        style={{ color: seleccionado ? '#0F766E' : '#98A2B3' }}
                      >
                        {money(comOrden)}
                      </div>
                    </div>

                    <div
                      className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandida ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                    >
                      <div className="overflow-hidden">
                        <div className="flex flex-col gap-1.5 border-b border-[#F2F4F6] bg-[#FBFCFD] px-4 py-3 pl-[50px]">
                          {grupo.map((item) => (
                            <div
                              key={item.id}
                              className="grid grid-cols-[minmax(0,1.6fr)_100px_110px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[#EDEFF2] bg-white px-3 py-2.5"
                            >
                              <div className="truncate text-[12.5px] text-[#0B1220]">
                                {item.productoRel?.nombre || item.producto}
                              </div>
                              <div className="cifra text-right text-xs text-[#6B7684]">
                                {num(item.cantidad, 0)} {item.unidad}
                              </div>
                              <div className="cifra text-right text-xs text-[#344054]">
                                {money(item.total)}
                              </div>
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {item.comisionesAsignadas.length === 0 ? (
                                  <span className="text-xs text-[#98A2B3]">Sin asignar</span>
                                ) : (
                                  item.comisionesAsignadas.map((com) => (
                                    <span
                                      key={com.id}
                                      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11px] font-medium ${
                                        com.comision > 0
                                          ? 'bg-[#E6F2F0] text-[#0B5E56]'
                                          : 'bg-[#FEF3E2] text-[#9A5B0B]'
                                      }`}
                                      title={com.nombre}
                                    >
                                      {com.nombre.split(' ')[0]}
                                      <span className="opacity-65">{com.tarifasLabel}</span>
                                      <span className="cifra font-semibold">{money(com.comision)}</span>
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            <div className={`grid ${COLS} items-center gap-2.5 bg-[#FAFBFC] px-4 py-3`}>
              <div />
              <div className="text-[12px] font-semibold text-[#475467]">Totales</div>
              <div />
              <div />
              <div />
              <div className="cifra text-right text-[12.5px] font-semibold text-[#0B1220]">
                {num(totalCantidad, 0)}
              </div>
              <div className="cifra text-right text-[12.5px] font-semibold text-[#0B1220]">
                {money(totalOrden)}
              </div>
              <div className="cifra text-right text-[13.5px] font-semibold text-primary">
                {money(totalComision)}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Resumen por comisionista */}
      <Panel>
        <PanelTitulo
          titulo="Resumen por comisionista"
          nota="Solo las facturas seleccionadas"
          accion={
            <BotonSecundario onClick={handleExportTotalesExcel} className="h-8">
              <FileSpreadsheet className="size-3.5 text-primary" /> Exportar totales
            </BotonSecundario>
          }
        />
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="th-tabla grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_80px_110px_130px] gap-3 border-b border-[#EDEFF2] bg-[#FAFBFC] px-5 py-2.5">
              <div>Comisionista</div>
              <div>Tarifa aplicada</div>
              <div className="text-right">Ítems</div>
              <div className="text-right">Base</div>
              <div className="text-right">Comisión</div>
            </div>
            {resumenPorComisionista.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#98A2B3]">
                No hay comisionistas asignados
              </div>
            ) : (
              resumenPorComisionista.map((com) => (
                <div
                  key={com.id}
                  className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_80px_110px_130px] items-center gap-3 border-b border-[#F2F4F6] px-5 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar nombre={com.nombre} id={com.id} />
                    <span className="truncate text-[13px] text-[#0B1220]">{com.nombre}</span>
                  </div>
                  <div className="truncate text-[12.5px] text-[#6B7684]">{com.tarifasLabel}</div>
                  <div className="cifra text-right text-[12.5px] text-[#6B7684]">{com.items}</div>
                  <div className="cifra text-right text-[12.5px] text-[#344054]">
                    {money(basePorComisionista.get(com.id) ?? 0)}
                  </div>
                  <div className="cifra text-right text-[13px] font-semibold text-primary">
                    {money(com.comision)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Panel>

      {/* Barra fija inferior: totales + guardar */}
      <div className="fixed bottom-0 left-16 right-0 z-40 flex flex-wrap items-center gap-x-6 gap-y-3 bg-[#0B1220]/[0.97] px-5 py-3.5 backdrop-blur-md lg:left-[236px] lg:px-[30px]">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8394AA]">
            Total a liquidar
          </span>
          <span className="cifra text-[26px] font-semibold text-white">{money(totalComision)}</span>
        </div>
        <div className="hidden h-6 w-px bg-white/[0.14] sm:block" />
        <div className="flex gap-5">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.06em] text-[#8394AA]">Facturas</div>
            <div className="cifra mt-0.5 text-sm text-[#D6DEE8]">{cantidadOrdenes}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.06em] text-[#8394AA]">Registros</div>
            <div className="cifra mt-0.5 text-sm text-[#D6DEE8]">{selectedItemsConComision.length}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.06em] text-[#8394AA]">
              Comisionistas
            </div>
            <div className="cifra mt-0.5 text-sm text-[#D6DEE8]">{resumenPorComisionista.length}</div>
          </div>
        </div>
        <div className="flex-1" />
        <BotonPrimario onClick={handlePreviewSave} className="h-10 px-[22px] text-sm">
          <Save className="size-4" /> Guardar liquidación
        </BotonPrimario>
      </div>

      {/* Diálogo de confirmación */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Confirmar liquidación</DialogTitle>
            <p className="mt-1 text-[13px] leading-[1.5] text-[#6B7684]">
              Se marcarán como liquidadas las asignaciones de los comisionistas que selecciones. Esta
              acción queda registrada en el historial.
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[12.5px] font-semibold text-[#0B1220]">¿A quién le pagas?</Label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary"
                    onClick={() =>
                      setComisionistasAPagar(new Set(resumenPorComisionista.map((c) => c.id)))
                    }
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-[#7A8798]"
                    onClick={() => setComisionistasAPagar(new Set())}
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                {resumenPorComisionista.length === 0 && (
                  <p className="rounded-[10px] border border-border px-3 py-4 text-center text-xs text-[#7A8798]">
                    Las facturas seleccionadas no tienen comisionistas pendientes. Se liquidarán con
                    comisión $0,00.
                  </p>
                )}
                {resumenPorComisionista.map((com) => {
                  const on = comisionistasAPagar.has(com.id);
                  return (
                    <label
                      key={com.id}
                      className={`grid cursor-pointer grid-cols-[22px_minmax(0,1fr)_130px_70px_110px] items-center gap-3 rounded-[10px] border px-3 py-2.5 transition-colors ${
                        on ? 'border-[#CFE3E0] bg-[#F7FBFA]' : 'border-border bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="size-[17px] cursor-pointer accent-primary"
                        checked={on}
                        onChange={() => toggleComisionistaAPagar(com.id)}
                      />
                      <span className="truncate text-[13px] font-medium text-[#0B1220]">
                        {com.nombre}
                      </span>
                      <span className="truncate text-xs text-[#6B7684]">{com.tarifasLabel}</span>
                      <span className="cifra text-right text-xs text-[#6B7684]">
                        {com.items} ítem{com.items === 1 ? '' : 's'}
                      </span>
                      <span
                        className="cifra text-right text-[13px] font-semibold"
                        style={{ color: on ? '#0F766E' : '#98A2B3' }}
                      >
                        {money(com.comision)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-[#CFE3E0] bg-[#F7FBFA] px-[18px] py-4">
              <div className="grid gap-x-[18px] gap-y-2.5 sm:grid-cols-2">
                {[
                  { label: 'Facturas a liquidar', valor: String(cantidadOrdenes) },
                  { label: 'Registros', valor: String(selectedItemsConComision.length) },
                  {
                    label: 'Comisionistas',
                    valor: `${comisionistasAPagar.size} de ${resumenPorComisionista.length}`,
                  },
                  { label: 'Comisiones a pagar', valor: String(itemsAPagar) },
                ].map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between gap-2.5">
                    <span className="text-[12.5px] text-[#4B6A66]">{r.label}</span>
                    <span className="cifra text-[13px] font-medium text-[#0B1220]">{r.valor}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 flex items-baseline justify-between border-t border-[#CFE3E0] pt-3.5">
                <span className="text-[13px] font-semibold text-[#0B5E56]">Total a pagar</span>
                <span className="cifra text-[28px] font-semibold text-primary">
                  {money(totalAPagar)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[11.5px] font-semibold text-[#475467]">
                Nombre de la liquidación
              </Label>
              <Input
                placeholder="Ej: Liquidación Mayo 2026"
                value={nombreLiquidacion}
                onChange={(e) => setNombreLiquidacion(e.target.value)}
                className="rounded-[9px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-[#EDEFF2] pt-3.5">
            <Button variant="outline" onClick={() => setPreviewOpen(false)} className="rounded-[9px]">
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                (resumenPorComisionista.length > 0 && comisionistasAPagar.size === 0) ||
                !nombreLiquidacion.trim()
              }
              className="rounded-[9px]"
            >
              Confirmar y guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
