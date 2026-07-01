'use client';

import { useState, useMemo } from 'react';
import { FileText, FileSpreadsheet, Save, Calculator, Filter } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { useApp } from '@/context/AppContext';
import { exportarPDF, exportarExcel, calcularDetalleComision } from '@/lib/export-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export function LiquidacionTab() {
  const { comisionistas, ordenItems, saveLiquidacion, tarifasClienteProducto } = useApp();
  const [filterComisionista, setFilterComisionista] = useState('');
  const [filterFactura, setFilterFactura] = useState('');
  const [nombreLiquidacion, setNombreLiquidacion] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  // Por defecto todo lo filtrado está seleccionado; el usuario destilda lo que NO quiere liquidar.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const comisionistaMap = useMemo(() =>
    new Map(comisionistas.map(c => [c.id, c])),
    [comisionistas]
  );
  const nombreComisionistaFiltro = filterComisionista
    ? comisionistaMap.get(filterComisionista)?.nombre || 'Comisionista no encontrado'
    : 'Todos los comisionistas';

  const ordenItemsPagados = useMemo(
    () => ordenItems.filter(item => item.estado === 'pagada'),
    [ordenItems]
  );

  const filteredItems = useMemo(() => {
    return ordenItemsPagados.filter(i => {
      const matchComisionista = !filterComisionista || i.comisionistas.some(a => a.comisionistaId === filterComisionista);
      const matchFactura = !filterFactura || i.numeroOrden.toLowerCase().includes(filterFactura.toLowerCase());
      return matchComisionista && matchFactura;
    });
  }, [ordenItemsPagados, filterComisionista, filterFactura]);

  const cantidadOrdenes = useMemo(() => {
    const ids = new Set(
      filteredItems
        .filter(i => !excludedIds.has(i.id))
        .map(item => item.ordenId || `${item.fecha}-${item.numeroOrden}-${item.clienteId || ''}`)
    );
    return ids.size;
  }, [filteredItems, excludedIds]);

  const toggleItem = (id: string) => setExcludedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const todosSeleccionados = filteredItems.length > 0 && filteredItems.every(i => !excludedIds.has(i.id));

  const toggleTodos = () => setExcludedIds(prev => {
    const next = new Set(prev);
    if (todosSeleccionados) filteredItems.forEach(i => next.add(i.id));
    else filteredItems.forEach(i => next.delete(i.id));
    return next;
  });



  const itemsConComision = useMemo(() => {
    return filteredItems.map(item => {
      const comisionesAsignadas = item.comisionistas.flatMap(a => {
        const comisionista = comisionistaMap.get(a.comisionistaId);
        if (!comisionista) return [];
        return [{
          ...comisionista,
          ...calcularDetalleComision(item, comisionista, tarifasClienteProducto),
        }];
      });
      const comisionTotal = comisionesAsignadas.reduce((total, asignacion) => total + asignacion.comision, 0);
      return { ...item, comisionTotal, comisionesAsignadas };
    });
  }, [filteredItems, comisionistaMap, tarifasClienteProducto]);

  // Ítems marcados por el usuario (base para totales, resumen, exportación y guardado).
  const selectedItemsConComision = useMemo(
    () => itemsConComision.filter(i => !excludedIds.has(i.id)),
    [itemsConComision, excludedIds]
  );

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
    return Array.from(map.values()).sort((a, b) => b.comision - a.comision);
  }, [selectedItemsConComision]);

  const totalComision = selectedItemsConComision.reduce((s, i) => s + i.comisionTotal, 0);
  const totalCantidad = selectedItemsConComision.reduce((s, i) => s + i.cantidad, 0);
  const totalOrden = selectedItemsConComision.reduce((s, i) => s + i.total, 0);

  const selectedFiltered = useMemo(
    () => filteredItems.filter(i => !excludedIds.has(i.id)),
    [filteredItems, excludedIds]
  );

  const handleExportPDF = () => {
    if (selectedFiltered.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const com = filterComisionista ? comisionistaMap.get(filterComisionista) : undefined;
    exportarPDF(selectedFiltered, comisionistas, 'Liquidacion', com?.nombre, tarifasClienteProducto);
    toast.success('PDF generado');
  };

  const handleExportExcel = () => {
    if (selectedFiltered.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const com = filterComisionista ? comisionistaMap.get(filterComisionista) : undefined;
    exportarExcel(selectedFiltered, comisionistas, 'Liquidacion', com?.nombre, tarifasClienteProducto);
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
    saveLiquidacion(nombreLiquidacion, ids);
    setNombreLiquidacion('');
    setPreviewOpen(false);
  };

  const handlePreviewSave = () => {
    if (selectedFiltered.length === 0) {
      toast.error('Selecciona al menos una orden pagada para guardar');
      return;
    }
    setNombreLiquidacion(`Liquidación ${new Date().toLocaleDateString('es-ES')}`);
    setPreviewOpen(true);
  };

  if (ordenItems.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
        <Calculator className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700">Sin órdenes cargadas</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Ve a &quot;Cargar Órdenes&quot; para agregar registros y generar una liquidación.</p>
      </div>
    );
  }

  if (ordenItemsPagados.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
        <Calculator className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700">Sin órdenes pagadas</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Marca una orden como pagada para calcular y guardar su liquidación.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Filter className="h-5 w-5 text-slate-400" />
            <div>
              <Label className="text-xs text-slate-500">Filtrar por comisionista</Label>
              <Select value={filterComisionista} onValueChange={(value) => setFilterComisionista(value ?? '')}>
                <SelectTrigger className="mt-1 h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900 w-64">
                  <SelectValue placeholder="Todos los comisionistas">
                    {nombreComisionistaFiltro}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los comisionistas</SelectItem>
                  {comisionistas.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Filtrar por factura</Label>
            <Input
              placeholder="Número de factura..."
              value={filterFactura}
              onChange={e => setFilterFactura(e.target.value)}
              className="mt-1 h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900 w-64"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF} className="rounded-xl border-slate-200">
            <FileText className="h-4 w-4 mr-2 text-red-500" />
            Exportar PDF
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="rounded-xl border-slate-200">
            <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />
            Exportar Excel
          </Button>
          <Button onClick={handlePreviewSave} className="btn-primary-dark rounded-xl">
            <Save className="h-4 w-4 mr-2" />
            Guardar Liquidación
          </Button>

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="bg-white border-slate-200 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Confirmar Liquidación</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Órdenes pagadas a liquidar</span>
                    <span className="text-sm font-semibold text-slate-900">{cantidadOrdenes}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Productos a liquidar</span>
                    <span className="text-sm font-semibold text-slate-900">{filteredItems.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Total vendido</span>
                    <span className="text-sm font-semibold text-slate-900">${totalOrden.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Cantidad total</span>
                    <span className="text-sm font-semibold text-slate-900">{totalCantidad.toLocaleString('es-ES')} kg</span>
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">Comisión total</span>
                    <span className="text-lg font-bold text-emerald-700">${totalComision.toFixed(2)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Nombre de la liquidación</Label>
                  <Input
                    placeholder="Ej: Liquidación Enero 2024"
                    value={nombreLiquidacion}
                    onChange={e => setNombreLiquidacion(e.target.value)}
                    className="bg-white border-slate-200 rounded-xl"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setPreviewOpen(false)} className="rounded-xl border-slate-200">Cancelar</Button>
                  <Button onClick={handleSave} className="btn-primary-dark rounded-xl">Confirmar y Guardar</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="card-elevated rounded-2xl overflow-hidden">
        <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900">Vista de Liquidación: {cantidadOrdenes} orden{cantidadOrdenes === 1 ? '' : 'es'} pagada{cantidadOrdenes === 1 ? '' : 's'} / {selectedItemsConComision.length} de {itemsConComision.length} producto{itemsConComision.length === 1 ? '' : 's'} seleccionado{selectedItemsConComision.length === 1 ? '' : 's'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-emerald-600 align-middle"
                      checked={todosSeleccionados}
                      onChange={toggleTodos}
                      aria-label="Seleccionar todo"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Factura</th>
                  <th className="text-left px-4 py-3 font-medium">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium">Finca</th>
                  <th className="text-left px-4 py-3 font-medium">Producto</th>
                  <th className="text-right px-4 py-3 font-medium">Cantidad</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-left px-4 py-3 font-medium">Comisionistas</th>
                  <th className="text-right px-4 py-3 font-medium">Comisión Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsConComision.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      No hay registros con el filtro seleccionado
                    </td>
                  </tr>
                ) : (
                  itemsConComision.map(item => {
                    const seleccionado = !excludedIds.has(item.id);
                    return (
                    <tr key={item.id} className={`transition-colors ${seleccionado ? 'hover:bg-slate-50/50' : 'bg-slate-50/60 text-slate-400'}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-emerald-600 align-middle"
                          checked={seleccionado}
                          onChange={() => toggleItem(item.id)}
                          aria-label={`Seleccionar orden ${item.numeroOrden}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-500">{item.fecha}</td>
                      <td className="px-4 py-3 text-slate-900 font-medium">{item.numeroOrden}</td>
                      <td className="px-4 py-3 text-slate-500">{item.cliente?.nombre || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{item.fincaRel?.nombre || item.finca}</td>
                      <td className="px-4 py-3 text-slate-700">{item.productoRel?.nombre || item.producto}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {item.cantidad.toLocaleString('es-ES')} <span className="text-xs text-slate-400">{item.unidad}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">${item.total.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {item.comisionesAsignadas.length > 0 ? (
                          <div className="space-y-1">
                            {item.comisionesAsignadas.map(com => (
                              <Badge key={com.id} variant="outline" className="flex w-fit gap-1 text-xs bg-white text-slate-700 border-slate-200">
                                <span>{com.nombre}</span>
                                <span className="text-slate-400">·</span>
                                <span>{com.tarifasLabel}</span>
                                <span className="text-slate-400">·</span>
                                <span className={com.comision > 0 ? 'text-emerald-700' : 'text-amber-700'}>
                                  ${com.comision.toFixed(2)}
                                </span>
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        ${item.comisionTotal.toFixed(2)}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={6} className="px-4 py-3 font-medium text-slate-700">Totales</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                    {totalCantidad.toLocaleString('es-ES')}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                    ${totalOrden.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">
                    Total Comisión:
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xl font-bold text-slate-900 tabular-nums">${totalComision.toFixed(2)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="card-elevated rounded-2xl">
          <CardContent className="pt-6">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total Orden</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">${totalOrden.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated rounded-2xl">
          <CardContent className="pt-6">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Cantidad Total</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{totalCantidad.toLocaleString('es-ES')}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 text-white rounded-2xl border-0">
          <CardContent className="pt-6">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Comisión Total</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">${totalComision.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="card-elevated rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base text-slate-900">Resumen por Comisionista</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportTotalesExcel}
            className="rounded-xl border-slate-200 sm:w-auto w-full"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />
            Exportar Totales
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Comisionista</th>
                  <th className="text-left px-4 py-3 font-medium">Tarifa Aplicada</th>
                  <th className="text-right px-4 py-3 font-medium">Items</th>
                  <th className="text-right px-4 py-3 font-medium">Comisión Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resumenPorComisionista.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No hay comisionistas asignados
                    </td>
                  </tr>
                ) : (
                  resumenPorComisionista.map((com) => (
                    <tr key={com.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-900 font-medium">{com.nombre}</td>
                      <td className="px-4 py-3 text-slate-500">{com.tarifasLabel}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{com.items}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                        ${com.comision.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-medium text-slate-700 text-right">Total Comisión:</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-lg font-bold text-slate-900 tabular-nums">${totalComision.toFixed(2)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
