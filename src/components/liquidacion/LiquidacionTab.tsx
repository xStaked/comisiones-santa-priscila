'use client';

import { useState, useMemo } from 'react';
import { FileText, FileSpreadsheet, Save, Calculator, Filter } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { exportarPDF, exportarExcel, calcularComision } from '@/lib/export-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export function LiquidacionTab() {
  const { comisionistas, ordenItems, saveLiquidacion } = useApp();
  const [filterComisionista, setFilterComisionista] = useState('');
  const [nombreLiquidacion, setNombreLiquidacion] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);

  const comisionistaMap = useMemo(() => 
    new Map(comisionistas.map(c => [c.id, c])), 
    [comisionistas]
  );

  const filteredItems = useMemo(() => {
    if (!filterComisionista) return ordenItems;
    return ordenItems.filter(i => i.comisionistaId === filterComisionista);
  }, [ordenItems, filterComisionista]);

  const itemsConComision = useMemo(() => {
    return filteredItems.map(item => {
      const com = item.comisionistaId ? comisionistaMap.get(item.comisionistaId) : undefined;
      const comision = calcularComision(item, com);
      const comUnitaria = item.cantidad > 0 ? comision / item.cantidad : 0;
      return { ...item, comision, comUnitaria, comisionista: com };
    });
  }, [filteredItems, comisionistaMap]);

  const totalComision = itemsConComision.reduce((s, i) => s + i.comision, 0);
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
    setSaveOpen(false);
    setNombreLiquidacion('');
  };

  if (ordenItems.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
        <Calculator className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700">Sin órdenes cargadas</h3>
        <p className="text-sm text-slate-500 mt-1">Ve a "Cargar Órdenes" para agregar registros</p>
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
            <select
              value={filterComisionista}
              onChange={e => setFilterComisionista(e.target.value)}
              className="mt-1 h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 w-64"
            >
              <option value="">Todos los comisionistas</option>
              {comisionistas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
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
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <Button onClick={() => setSaveOpen(true)} className="btn-primary-dark rounded-xl">
              <Save className="h-4 w-4 mr-2" />
              Guardar Liquidación
            </Button>
            <DialogContent className="bg-white border-slate-200">
              <DialogHeader>
                <DialogTitle>Guardar Liquidación</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nombre de la liquidación</Label>
                  <Input 
                    placeholder="Ej: Liquidación Enero 2024"
                    value={nombreLiquidacion}
                    onChange={e => setNombreLiquidacion(e.target.value)}
                    className="bg-white border-slate-200 rounded-xl"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSaveOpen(false)} className="rounded-xl border-slate-200">Cancelar</Button>
                  <Button onClick={handleSave} className="btn-primary-dark rounded-xl">Guardar</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="card-elevated rounded-2xl overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">Vista de Liquidación</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Factura</th>
                  <th className="text-left px-4 py-3 font-medium">Finca</th>
                  <th className="text-left px-4 py-3 font-medium">Producto</th>
                  <th className="text-right px-4 py-3 font-medium">Cantidad</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-left px-4 py-3 font-medium">Comisionista</th>
                  <th className="text-right px-4 py-3 font-medium">Comisión Unit.</th>
                  <th className="text-right px-4 py-3 font-medium">Valor Comisión</th>
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
                      <td className="px-4 py-3 text-slate-500">{item.finca}</td>
                      <td className="px-4 py-3 text-slate-700">{item.producto}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {item.cantidad.toLocaleString('es-ES')} <span className="text-xs text-slate-400">{item.unidad}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">${item.total.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {item.comisionista ? (
                          <Badge variant="outline" className="text-xs bg-white text-slate-700 border-slate-200">
                            {item.comisionista.nombre}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        ${item.comUnitaria.toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        ${item.comision.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-medium text-slate-700">Totales</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                    {totalCantidad.toLocaleString('es-ES')}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                    ${totalOrden.toFixed(2)}
                  </td>
                  <td colSpan={2} className="px-4 py-3 text-right font-medium text-slate-700">
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
