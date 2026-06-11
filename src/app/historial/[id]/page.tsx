'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  FileText,
  FileSpreadsheet,
  Users,
  DollarSign,
  Package,
  TrendingUp,
  Trash2,
  RotateCcw,
  MapPin,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useApp } from '@/context/AppContext';
import { exportarPDF, exportarExcel, getTarifaLabel } from '@/lib/export-utils';
import { fetchLiquidacion } from '@/lib/api';
import { Comisionista, OrdenItem } from '@/types';
import { Shell } from '@/components/Shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function LiquidacionDetallePage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { deleteLiquidacion, restoreLiquidacion } = useApp();

  const { data: rawLiquidacion } = useQuery({
    queryKey: ['liquidacion', id],
    queryFn: () => fetchLiquidacion(id),
    enabled: !!id,
  });

  const liquidacion = useMemo(() => {
    if (!rawLiquidacion) return null;
    const items: OrdenItem[] = (rawLiquidacion.items || []).map(snapshotItemToOrdenItem);
    return {
      id: rawLiquidacion.id as string,
      nombre: rawLiquidacion.nombre as string,
      mes: rawLiquidacion.mes as string,
      fechaCreacion: rawLiquidacion.fechaCreacion as string,
      items,
    };
  }, [rawLiquidacion]);

  const comisionistas = useMemo<Comisionista[]>(() => {
    if (!rawLiquidacion) return [];
    return buildComisionistasFromSnapshot(rawLiquidacion.items || []);
  }, [rawLiquidacion]);

  const comisionistaMap = useMemo(
    () => new Map(comisionistas.map((c) => [c.id, c])),
    [comisionistas]
  );

  const resumenPorFinca = useMemo(() => {
    if (!liquidacion || !rawLiquidacion) return [];
    const map = new Map<string, { nombre: string; ordenes: number; cantidad: number; total: number; comision: number }>();
    liquidacion.items.forEach(item => {
      const rawItem = (rawLiquidacion.items || []).find((ri: any) => ri.id === item.id);
      const comision = (rawItem?.tarifas || []).reduce((s: number, t: any) => s + (Number(t.comisionCalculada) || 0), 0);
      const finca = item.finca || 'Sin finca';
      const existente = map.get(finca);
      if (existente) {
        existente.ordenes += 1;
        existente.cantidad += item.cantidad;
        existente.total += item.total;
        existente.comision += comision;
      } else {
        map.set(finca, {
          nombre: finca,
          ordenes: 1,
          cantidad: item.cantidad,
          total: item.total,
          comision,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [liquidacion, rawLiquidacion]);

  const resumenPorComisionista = useMemo(() => {
    if (!rawLiquidacion) return [];
    const map = new Map<
      string,
      {
        nombre: string;
        tarifas: string;
        ordenes: number;
        totalComision: number;
        totalOrden: number;
      }
    >();
    (rawLiquidacion.items || []).forEach((rawItem: any) => {
      const itemTotal = Number(rawItem.totalSnapshot) || 0;
      (rawItem.tarifas || []).forEach((t: any) => {
        const comision = Number(t.comisionCalculada) || 0;
        const existente = map.get(t.comisionistaId);
        const tarifaLabel = t.tipoSnapshot === 'sin_tarifa'
          ? '—'
          : getTarifaLabel({ tipo: t.tipoSnapshot, valor: Number(t.valorSnapshot) });
        if (existente) {
          existente.ordenes += 1;
          existente.totalComision += comision;
          existente.totalOrden += itemTotal;
        } else {
          map.set(t.comisionistaId, {
            nombre: t.comisionistaNombreSnapshot,
            tarifas: tarifaLabel,
            ordenes: 1,
            totalComision: comision,
            totalOrden: itemTotal,
          });
        }
      });
    });
    return Array.from(map.values()).sort(
      (a, b) => b.totalComision - a.totalComision
    );
  }, [rawLiquidacion]);

  if (!liquidacion) {
    return (
      <Shell>
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700">
            Liquidación no encontrada
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            La liquidación que buscas no existe o fue eliminada.
          </p>
          <Link
            href="/historial"
            className="mt-6 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al historial
          </Link>
        </div>
      </Shell>
    );
  }

  const totalOrden = liquidacion.items.reduce((s, i) => s + i.total, 0);
  const totalComision = rawLiquidacion
    ? (rawLiquidacion.items || []).reduce((s: number, ri: any) => {
        return s + (ri.tarifas || []).reduce((ss: number, t: any) => ss + (Number(t.comisionCalculada) || 0), 0);
      }, 0)
    : 0;
  const totalCantidad = liquidacion.items.reduce((s, i) => s + i.cantidad, 0);
  const comisionistasInvolucrados = new Set(
    liquidacion.items.flatMap((i) => i.comisionistas.map(a => a.comisionistaId)).filter(Boolean)
  ).size;

  const buildComisionesSnapshot = () => {
    const map = new Map<string, { comision: number; tarifasLabel: string }>();
    for (const rawItem of rawLiquidacion?.items || []) {
      for (const t of rawItem.tarifas || []) {
        const key = `${rawItem.id}|${t.comisionistaId}`;
        const label = t.tipoSnapshot === 'sin_tarifa'
          ? '—'
          : getTarifaLabel({ tipo: t.tipoSnapshot, valor: Number(t.valorSnapshot) });
        const existing = map.get(key);
        if (existing) {
          existing.comision += Number(t.comisionCalculada) || 0;
        } else {
          map.set(key, { comision: Number(t.comisionCalculada) || 0, tarifasLabel: label });
        }
      }
    }
    return map;
  };

  const handleExportPDF = () => {
    exportarPDF(liquidacion.items, comisionistas, liquidacion.nombre, undefined, [], buildComisionesSnapshot());
    toast.success('PDF generado');
  };

  const handleExportExcel = () => {
    exportarExcel(liquidacion.items, comisionistas, liquidacion.nombre, undefined, [], buildComisionesSnapshot());
    toast.success('Excel generado');
  };

  const handleDelete = () => {
    if (confirm('¿Eliminar esta liquidación?')) {
      deleteLiquidacion(liquidacion.id);
      window.location.href = '/historial';
    }
  };

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header de navegación */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/historial"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {liquidacion.nombre}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge
                  variant="secondary"
                  className="bg-slate-100 text-slate-700 border-0"
                >
                  {liquidacion.mes}
                </Badge>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Creada el{' '}
                  {new Date(liquidacion.fechaCreacion).toLocaleDateString('es-ES')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="rounded-xl border-slate-200"
            >
              <FileText className="h-4 w-4 mr-2 text-red-500" />
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="rounded-xl border-slate-200"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl border-slate-200"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (confirm('¿Restaurar esta liquidación a órdenes pagadas? Se eliminará del historial y los registros volverán a estar editables.')) {
                  restoreLiquidacion(liquidacion.id);
                  router.push('/ordenes');
                }
              }}
              className="btn-primary-dark rounded-xl"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurar a pagadas
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Package className="h-3.5 w-3.5" />
                Registros
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {liquidacion.items.length}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Users className="h-3.5 w-3.5" />
                Comisionistas
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {comisionistasInvolucrados}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <DollarSign className="h-3.5 w-3.5" />
                Total Orden
              </div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                ${totalOrden.toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 text-white rounded-2xl border-0 shadow-sm">
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Comisión Total
              </div>
              <p className="text-2xl font-bold tabular-nums">
                ${totalComision.toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico + Fincas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-900">Comisión por Comisionista</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {resumenPorComisionista.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={resumenPorComisionista} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="nombre"
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        angle={resumenPorComisionista.length > 4 ? -30 : 0}
                        textAnchor={resumenPorComisionista.length > 4 ? 'end' : 'middle'}
                        height={resumenPorComisionista.length > 4 ? 60 : 30}
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
                      <Bar dataKey="totalComision" radius={[6, 6, 0, 0]}>
                        {resumenPorComisionista.map((_, idx) => (
                          <Cell key={idx} fill={['#0f172a', '#10b981', '#3b82f6', '#f59e0b', '#ef4444'][idx % 5]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                    No hay datos de comisionistas
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-500" />
                <CardTitle className="text-base text-slate-900">Resumen por Finca</CardTitle>
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
                    {resumenPorFinca.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          No hay datos por finca
                        </td>
                      </tr>
                    ) : (
                      resumenPorFinca.map((f, idx) => (
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
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-2 font-medium text-slate-700">Totales</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenPorFinca.reduce((s, f) => s + f.ordenes, 0)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenPorFinca.reduce((s, f) => s + f.cantidad, 0).toLocaleString('es-ES')}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenPorFinca.reduce((s, f) => s + f.total, 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenPorFinca.reduce((s, f) => s + f.comision, 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Desglose por comisionista */}
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900">
              Desglose por Comisionista
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">
                      Comisionista
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">
                      Tarifas
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">
                      Órdenes
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">
                      Total Orden
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">
                      Comisión
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">
                      % del total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumenPorComisionista.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No hay comisionistas asignados en esta liquidación
                      </td>
                    </tr>
                  ) : (
                    resumenPorComisionista.map((r, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-slate-900 font-medium">
                          {r.nombre}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{r.tarifas}</td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {r.ordenes}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          ${r.totalOrden.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                          ${r.totalComision.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {totalComision > 0
                            ? ((r.totalComision / totalComision) * 100).toFixed(1)
                            : 0}
                          %
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-3 font-medium text-slate-700"
                    >
                      Totales
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      $
                      {resumenPorComisionista
                        .reduce((s, r) => s + r.totalOrden, 0)
                        .toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      ${totalComision.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      100%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Detalle de registros */}
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900">
              Detalle de Registros
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">
                      Fecha
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">
                      Factura
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">
                      Finca
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">
                      Producto
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">
                      Cantidad
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">
                      Total
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">
                      Comisionistas
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">
                      Comisión
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {liquidacion.items.map((item) => {
                    const rawItem = (rawLiquidacion?.items || []).find((ri: any) => ri.id === item.id);
                    const comision = (rawItem?.tarifas || []).reduce((s: number, t: any) => s + (Number(t.comisionCalculada) || 0), 0);
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-slate-500">
                          {item.fecha}
                        </td>
                        <td className="px-4 py-3 text-slate-900 font-medium">
                          {item.numeroOrden}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {item.finca}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {item.producto}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {item.cantidad.toLocaleString('es-ES')}{' '}
                          {item.unidad}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          ${item.total.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          {item.comisionistas.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {item.comisionistas.map(a => {
                                const com = comisionistaMap.get(a.comisionistaId);
                                return com ? (
                                  <Badge key={a.comisionistaId} variant="secondary" className="bg-slate-100 text-slate-700 border-0 text-xs">
                                    {com.nombre}
                                  </Badge>
                                ) : null;
                              })}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          ${comision.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-3 font-medium text-slate-700"
                    >
                      Totales
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      {totalCantidad.toLocaleString('es-ES')}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      ${totalOrden.toFixed(2)}
                    </td>
                    <td colSpan={1} />
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      ${totalComision.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
