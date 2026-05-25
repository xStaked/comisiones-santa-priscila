'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Filter,
  FileText,
  FileSpreadsheet,
  BarChart3,
  DollarSign,
  Package,
  Users,
  TrendingUp,
  CalendarDays,
  MapPin,
  Fish,
  UserCheck,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { OrdenItem, Cliente } from '@/types';
import { fetchOrdenes } from '@/lib/api';
import {
  filtrarItems,
  agruparPorFinca,
  agruparPorProducto,
  agruparPorComisionista,
  agruparPorCliente,
  getTrimestreActual,
  exportarReportePDF,
  exportarReporteExcel,
  calcularComisionTotalItem,
} from '@/lib/export-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

function MultiSelectFilter({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
}: {
  label: string;
  icon: any;
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-500 flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              selected.includes(opt)
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {opt}
          </button>
        ))}
        {options.length === 0 && (
          <span className="text-xs text-slate-400">No hay opciones</span>
        )}
      </div>
    </div>
  );
}

export function ReportesTab() {
  const { comisionistas, clientes } = useApp();

  const trimestre = useMemo(() => getTrimestreActual(), []);

  const [fechaDesde, setFechaDesde] = useState(trimestre.inicio);
  const [fechaHasta, setFechaHasta] = useState(trimestre.fin);
  const [fincasSel, setFincasSel] = useState<string[]>([]);
  const [productosSel, setProductosSel] = useState<string[]>([]);
  const [comisionistasSel, setComisionistasSel] = useState<string[]>([]);
  const [clientesSel, setClientesSel] = useState<string[]>([]);

  const { data: ordenesData } = useQuery({
    queryKey: ['ordenes', 'reportes', fechaDesde, fechaHasta, fincasSel[0], productosSel[0], clientesSel[0]],
    queryFn: () => fetchOrdenes({
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      finca: fincasSel[0] || undefined,
      producto: productosSel[0] || undefined,
      clienteId: clientes.find((c: Cliente) => c.nombre === clientesSel[0])?.id || undefined,
    }),
  });

  const ordenItems: OrdenItem[] = ordenesData ?? [];

  const fincasUnicas = useMemo(() =>
    Array.from(new Set(ordenItems.map(i => i.fincaRel?.nombre || i.finca).filter(Boolean))).sort(),
    [ordenItems]
  );

  const productosUnicos = useMemo(() =>
    Array.from(new Set(ordenItems.map(i => i.productoRel?.nombre || i.producto).filter(Boolean))).sort(),
    [ordenItems]
  );

  const clientesUnicos = useMemo(() =>
    Array.from(new Set(ordenItems.map(i => i.cliente?.nombre).filter(Boolean) as string[])).sort(),
    [ordenItems]
  );

  const comisionistaNombreAId = (nombre: string) => comisionistas.find(c => c.nombre === nombre)?.id || '';
  const comisionistaIdANombre = (id: string) => comisionistas.find(c => c.id === id)?.nombre || id;

  const filtros = useMemo(() => ({
    fechaDesde,
    fechaHasta,
    fincas: fincasSel,
    productos: productosSel,
    comisionistas: comisionistasSel.map(comisionistaNombreAId).filter(Boolean),
    clientes: clientesSel,
  }), [fechaDesde, fechaHasta, fincasSel, productosSel, comisionistasSel, clientesSel, comisionistas]);

  const itemsFiltrados = useMemo(() =>
    filtrarItems(ordenItems, filtros),
    [ordenItems, filtros]
  );

  const resumenFincas = useMemo(() => agruparPorFinca(itemsFiltrados, comisionistas), [itemsFiltrados, comisionistas]);
  const resumenProductos = useMemo(() => agruparPorProducto(itemsFiltrados, comisionistas), [itemsFiltrados, comisionistas]);
  const resumenComisionistas = useMemo(() => agruparPorComisionista(itemsFiltrados, comisionistas), [itemsFiltrados, comisionistas]);
  const resumenClientes = useMemo(() => agruparPorCliente(itemsFiltrados, comisionistas), [itemsFiltrados, comisionistas]);

  const totalOrden = itemsFiltrados.reduce((s, i) => s + i.total, 0);
  const totalComision = itemsFiltrados.reduce((s, i) => s + calcularComisionTotalItem(i, comisionistas), 0);
  const totalCantidad = itemsFiltrados.reduce((s, i) => s + i.cantidad, 0);
  const comisionistasInvolucrados = new Set(
    itemsFiltrados.flatMap(i => i.comisionistas.map(a => a.comisionistaId))
  ).size;

  const handleExportPDF = () => {
    if (itemsFiltrados.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    exportarReportePDF(itemsFiltrados, comisionistas, 'Reporte_Comisiones', filtros);
    toast.success('PDF generado');
  };

  const handleExportExcel = () => {
    if (itemsFiltrados.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    exportarReporteExcel(itemsFiltrados, comisionistas, 'Reporte_Comisiones', filtros);
    toast.success('Excel generado');
  };

  const chartData = resumenFincas.length > 0
    ? resumenFincas.map(f => ({ name: f.nombre.length > 14 ? f.nombre.slice(0, 14) + '…' : f.nombre, comision: Math.round(f.comision * 100) / 100 }))
    : resumenProductos.length > 0
    ? resumenProductos.map(p => ({ name: p.nombre.length > 14 ? p.nombre.slice(0, 14) + '…' : p.nombre, comision: Math.round(p.comision * 100) / 100 }))
    : [];

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card className="card-elevated rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-slate-900">
            <Filter className="h-4 w-4 text-slate-700" />
            Filtros del Reporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Desde
              </Label>
              <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="bg-white border-slate-200 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Hasta
              </Label>
              <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="bg-white border-slate-200 rounded-xl" />
            </div>
            <div className="sm:col-span-2 flex items-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const t = getTrimestreActual();
                  setFechaDesde(t.inicio);
                  setFechaHasta(t.fin);
                }}
                className="rounded-lg border-slate-200 text-slate-600"
              >
                Último trimestre
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  const inicio = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                  const fin = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;
                  setFechaDesde(inicio);
                  setFechaHasta(fin);
                }}
                className="rounded-lg border-slate-200 text-slate-600"
              >
                Mes actual
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFechaDesde('');
                  setFechaHasta('');
                  setFincasSel([]);
                  setProductosSel([]);
                  setComisionistasSel([]);
                  setClientesSel([]);
                }}
                className="rounded-lg border-slate-200 text-slate-600"
              >
                Limpiar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
            <MultiSelectFilter
              label="Clientes"
              icon={Users}
              options={clientesUnicos}
              selected={clientesSel}
              onChange={setClientesSel}
            />
            <MultiSelectFilter
              label="Fincas"
              icon={MapPin}
              options={fincasUnicas}
              selected={fincasSel}
              onChange={setFincasSel}
            />
            <MultiSelectFilter
              label="Productos"
              icon={Fish}
              options={productosUnicos}
              selected={productosSel}
              onChange={setProductosSel}
            />
            <MultiSelectFilter
              label="Comisionistas"
              icon={UserCheck}
              options={comisionistas.map(c => c.nombre)}
              selected={comisionistasSel}
              onChange={setComisionistasSel}
            />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Package className="h-3.5 w-3.5" />
              Registros
            </div>
            <p className="text-2xl font-bold text-slate-900">{itemsFiltrados.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Users className="h-3.5 w-3.5" />
              Comisionistas
            </div>
            <p className="text-2xl font-bold text-slate-900">{comisionistasInvolucrados}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              Total Orden
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">${totalOrden.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 text-white rounded-2xl border-0 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Comisión Total
            </div>
            <p className="text-2xl font-bold tabular-nums">${totalComision.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleExportPDF} className="rounded-xl border-slate-200">
          <FileText className="h-4 w-4 mr-2 text-red-500" />
          Exportar PDF
        </Button>
        <Button variant="outline" onClick={handleExportExcel} className="rounded-xl border-slate-200">
          <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />
          Exportar Excel
        </Button>
      </div>

      {/* Gráfico */}
      {chartData.length > 0 && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">
                Comisión por {resumenFincas.length > 0 ? 'Finca' : 'Producto'}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${v.toLocaleString('es-ES')}`}
                  />
                  <Tooltip
                    formatter={(value: any) => {
                      const num = typeof value === 'number' ? value : Number(value);
                      return [`$${num.toFixed(2)}`, 'Comisión'];
                    }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="comision" fill="#0f172a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tablas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por Cliente */}
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">Por Cliente</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Cliente</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Órdenes</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Cantidad</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumenClientes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No hay datos</td>
                    </tr>
                  ) : (
                    resumenClientes.map((c, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2 text-slate-900 font-medium">{c.nombre}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{c.ordenes}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{c.cantidad.toLocaleString('es-ES')}</td>
                        <td className="px-4 py-2 text-right text-slate-700">${c.total.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">${c.comision.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {resumenClientes.length > 0 && (
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-2 font-medium text-slate-700">Totales</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenClientes.reduce((s, c) => s + c.ordenes, 0)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenClientes.reduce((s, c) => s + c.cantidad, 0).toLocaleString('es-ES')}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenClientes.reduce((s, c) => s + c.total, 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenClientes.reduce((s, c) => s + c.comision, 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Por Finca */}
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">Por Finca</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Finca</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Órdenes</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Cantidad</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumenFincas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No hay datos</td>
                    </tr>
                  ) : (
                    resumenFincas.map((f, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2 text-slate-900 font-medium">{f.nombre}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{f.ordenes}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{f.cantidad.toLocaleString('es-ES')}</td>
                        <td className="px-4 py-2 text-right text-slate-700">${f.total.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">${f.comision.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {resumenFincas.length > 0 && (
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-2 font-medium text-slate-700">Totales</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenFincas.reduce((s, f) => s + f.ordenes, 0)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenFincas.reduce((s, f) => s + f.cantidad, 0).toLocaleString('es-ES')}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenFincas.reduce((s, f) => s + f.total, 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenFincas.reduce((s, f) => s + f.comision, 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Por Producto */}
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Fish className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">Por Producto</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Producto</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Órdenes</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Cantidad</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumenProductos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No hay datos</td>
                    </tr>
                  ) : (
                    resumenProductos.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2 text-slate-900 font-medium">{p.nombre}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{p.ordenes}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{p.cantidad.toLocaleString('es-ES')}</td>
                        <td className="px-4 py-2 text-right text-slate-700">${p.total.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">${p.comision.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {resumenProductos.length > 0 && (
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-2 font-medium text-slate-700">Totales</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenProductos.reduce((s, p) => s + p.ordenes, 0)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenProductos.reduce((s, p) => s + p.cantidad, 0).toLocaleString('es-ES')}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenProductos.reduce((s, p) => s + p.total, 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenProductos.reduce((s, p) => s + p.comision, 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Por Comisionista */}
      <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base text-slate-900">Por Comisionista</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Comisionista</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Tarifas</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Órdenes</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Total Orden</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Comisión</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">% del total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resumenComisionistas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No hay datos</td>
                  </tr>
                ) : (
                  resumenComisionistas.map((c, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-900 font-medium">{c.nombre}</td>
                      <td className="px-4 py-3 text-slate-500">{c.tarifas}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{c.ordenes}</td>
                      <td className="px-4 py-3 text-right text-slate-700">${c.totalOrden.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">${c.totalComision.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {totalComision > 0 ? ((c.totalComision / totalComision) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {resumenComisionistas.length > 0 && (
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-medium text-slate-700">Totales</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{resumenComisionistas.reduce((s, c) => s + c.ordenes, 0)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">${resumenComisionistas.reduce((s, c) => s + c.totalOrden, 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">${totalComision.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
