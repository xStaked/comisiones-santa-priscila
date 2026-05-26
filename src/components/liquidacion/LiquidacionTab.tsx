'use client';

import { useState, useMemo } from 'react';
import { FileText, FileSpreadsheet, Save, Calculator, Filter } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { exportarPDF, exportarExcel, calcularComision, calcularComisionTotalItem, getTarifasLabel, calcularComisionPorTarifaEspecifica, encontrarTarifaEspecifica } from '@/lib/export-utils';
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
  const [nombreLiquidacion, setNombreLiquidacion] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const comisionistaMap = useMemo(() =>
    new Map(comisionistas.map(c => [c.id, c])),
    [comisionistas]
  );

  const ordenItemsActivos = useMemo(
    () => ordenItems.filter(item => item.estado !== 'liquidado' && item.estado !== 'anulado'),
    [ordenItems]
  );

  const cantidadOrdenes = useMemo(() => {
    const ids = new Set(ordenItemsActivos.map(item => item.ordenId || `${item.fecha}-${item.numeroOrden}-${item.clienteId || ''}`));
    return ids.size;
  }, [ordenItemsActivos]);

  const filteredItems = useMemo(() => {
    if (!filterComisionista) return ordenItemsActivos;
    return ordenItemsActivos.filter(i => i.comisionistas.some(a => a.comisionistaId === filterComisionista));
  }, [ordenItemsActivos, filterComisionista]);

  const itemsConComision = useMemo(() => {
    return filteredItems.map(item => {
      const comisionistasAsignados = item.comisionistas
        .map(a => comisionistaMap.get(a.comisionistaId))
        .filter(Boolean);
      // Usar tarifa específica si existe, fallback a tarifa global
      let comisionTotal = 0;
      item.comisionistas.forEach(a => {
        const com = comisionistaMap.get(a.comisionistaId);
        if (!com) return;
        const tarifaEspecifica = encontrarTarifaEspecifica(item, a.comisionistaId, tarifasClienteProducto);
        if (tarifaEspecifica) {
          comisionTotal += calcularComisionPorTarifaEspecifica(item, tarifaEspecifica);
        } else {
          comisionTotal += calcularComision(item, com);
        }
      });
      return { ...item, comisionTotal, comisionistasAsignados };
    });
  }, [filteredItems, comisionistas, comisionistaMap, tarifasClienteProducto]);

  const totalComision = itemsConComision.reduce((s, i) => s + i.comisionTotal, 0);
  const totalCantidad = itemsConComision.reduce((s, i) => s + i.cantidad, 0);
  const totalOrden = itemsConComision.reduce((s, i) => s + i.total, 0);

  const handleExportPDF = () => {
    if (itemsConComision.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const com = filterComisionista ? comisionistaMap.get(filterComisionista) : undefined;
    exportarPDF(filteredItems, comisionistas, 'Liquidacion', com?.nombre);
    toast.success('PDF generado');
  };

  const handleExportExcel = () => {
    if (itemsConComision.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const com = filterComisionista ? comisionistaMap.get(filterComisionista) : undefined;
    exportarExcel(filteredItems, comisionistas, 'Liquidacion', com?.nombre);
    toast.success('Excel generado');
  };

  const handleSave = () => {
    if (!nombreLiquidacion.trim()) {
      toast.error('Ingresa un nombre para la liquidación');
      return;
    }
    saveLiquidacion(nombreLiquidacion);
    setNombreLiquidacion('');
    setPreviewOpen(false);
  };

  const handlePreviewSave = () => {
    if (ordenItemsActivos.length === 0) {
      toast.error('No hay órdenes para guardar');
      return;
    }
    setNombreLiquidacion(`Liquidación ${new Date().toLocaleDateString('es-ES')}`);
    setPreviewOpen(true);
  };

  if (ordenItemsActivos.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
        <Calculator className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700">Sin órdenes cargadas</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Ve a "Cargar Órdenes" para agregar registros y generar una liquidación.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Filter className="h-5 w-5 text-slate-400" />
          <div>
            <Label className="text-xs text-slate-500">Filtrar por comisionista</Label>
            <Select value={filterComisionista} onValueChange={(value) => setFilterComisionista(value ?? '')}>
              <SelectTrigger className="mt-1 h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900 w-64">
                <SelectValue placeholder="Todos los comisionistas" />
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
                    <span className="text-sm text-slate-500">Órdenes a liquidar</span>
                    <span className="text-sm font-semibold text-slate-900">{cantidadOrdenes}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Productos a liquidar</span>
                    <span className="text-sm font-semibold text-slate-900">{ordenItemsActivos.length}</span>
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
            <CardTitle className="text-base text-slate-900">Vista de Liquidación: {cantidadOrdenes} orden{cantidadOrdenes === 1 ? '' : 'es'} / {itemsConComision.length} producto{itemsConComision.length === 1 ? '' : 's'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
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
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      No hay registros con el filtro seleccionado
                    </td>
                  </tr>
                ) : (
                  itemsConComision.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
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
                        {item.comisionistasAsignados.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.comisionistasAsignados.map(com => (
                              <Badge key={com!.id} variant="outline" className="text-xs bg-white text-slate-700 border-slate-200">
                                {com!.nombre}
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
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={5} className="px-4 py-3 font-medium text-slate-700">Totales</td>
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
    </div>
  );
}
