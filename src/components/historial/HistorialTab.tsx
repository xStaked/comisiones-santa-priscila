'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, FileText, FileSpreadsheet, Trash2, ChevronDown, ChevronUp, Search, Eye } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { exportarPDF, exportarExcel, calcularComisionTotalItem } from '@/lib/export-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export function HistorialTab() {
  const { comisionistas, liquidaciones, deleteLiquidacion } = useApp();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const comisionistaMap = new Map(comisionistas.map(c => [c.id, c]));

  const filtered = liquidaciones.filter(l =>
    l.nombre.toLowerCase().includes(search.toLowerCase()) ||
    l.mes.includes(search)
  );

  const handleExportPDF = (liq: typeof liquidaciones[0]) => {
    exportarPDF(liq.items, comisionistas, liq.nombre);
    toast.success('PDF generado');
  };

  const handleExportExcel = (liq: typeof liquidaciones[0]) => {
    exportarExcel(liq.items, comisionistas, liq.nombre);
    toast.success('Excel generado');
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
          const isExpanded = expandedId === liq.id;
          const totalComision = liq.items.reduce((s, item) => {
            return s + calcularComisionTotalItem(item, comisionistas);
          }, 0);
          const totalOrden = liq.items.reduce((s, i) => s + i.total, 0);

          return (
            <Card key={liq.id} className="card-elevated rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : liq.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    <div>
                      <CardTitle className="text-base text-slate-900">{liq.nombre}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700 border-0">{liq.mes}</Badge>
                        <span className="text-xs text-slate-500">
                          {liq.items.length} registro{liq.items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 tabular-nums">${totalComision.toFixed(2)}</p>
                    <p className="text-xs text-slate-500">comisión total</p>
                  </div>
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="pt-0">
                  <div className="overflow-x-auto border border-slate-200 rounded-xl mb-4">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-slate-600">Fecha</th>
                          <th className="text-left px-4 py-2 font-medium text-slate-600">Factura</th>
                          <th className="text-left px-4 py-2 font-medium text-slate-600">Finca</th>
                          <th className="text-left px-4 py-2 font-medium text-slate-600">Producto</th>
                          <th className="text-right px-4 py-2 font-medium text-slate-600">Cantidad</th>
                          <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
                          <th className="text-right px-4 py-2 font-medium text-slate-600">Comisión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {liq.items.map(item => {
                          const comision = calcularComisionTotalItem(item, comisionistas);
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-2 text-slate-500">{item.fecha}</td>
                              <td className="px-4 py-2 text-slate-900 font-medium">{item.numeroOrden}</td>
                              <td className="px-4 py-2 text-slate-500">{item.finca}</td>
                              <td className="px-4 py-2 text-slate-700">{item.producto}</td>
                              <td className="px-4 py-2 text-right text-slate-700">
                                {item.cantidad.toLocaleString('es-ES')} {item.unidad}
                              </td>
                              <td className="px-4 py-2 text-right text-slate-500">${item.total.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-medium text-slate-900 tabular-nums">${comision.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200">
                        <tr>
                          <td colSpan={5} className="px-4 py-2 font-medium text-slate-700">Totales</td>
                          <td className="px-4 py-2 text-right font-bold text-slate-900 tabular-nums">${totalOrden.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right font-bold text-slate-900 tabular-nums">${totalComision.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/historial/${liq.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Eye className="h-4 w-4 mr-2 text-slate-600" />
                      Ver detalle
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => handleExportPDF(liq)} className="rounded-lg border-slate-200">
                      <FileText className="h-4 w-4 mr-2 text-red-500" />
                      PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportExcel(liq)} className="rounded-lg border-slate-200">
                      <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />
                      Excel
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border-slate-200" onClick={() => {
                      if (confirm('¿Eliminar esta liquidación?')) deleteLiquidacion(liq.id);
                    }}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
