'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Users,
  FileText,
  DollarSign,
  ArrowRight,
  BarChart3,
  TrendingDown,
  Package,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { calcularComisionTotalItem } from '@/lib/export-utils';
import { fetchGlobalStats, fetchTendencias, fetchPorComisionista } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const COLORS = ['#0f172a', '#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

export function DashboardTab() {
  const { comisionistas, ordenItems, liquidaciones } = useApp();

  const comisionistaMap = useMemo(
    () => new Map(comisionistas.map((c) => [c.id, c])),
    [comisionistas]
  );

  const { data: globalStats } = useQuery({
    queryKey: ['reportes', 'global'],
    queryFn: fetchGlobalStats,
  });

  const { data: tendenciasData } = useQuery({
    queryKey: ['reportes', 'tendencias'],
    queryFn: fetchTendencias,
  });

  const { data: porComisionista } = useQuery({
    queryKey: ['reportes', 'por-comisionista'],
    queryFn: fetchPorComisionista,
  });

  const totalLiquidado = globalStats?.totalComisionadoHistorico ?? 0;
  const totalComisionActual = globalStats?.totalComisionActivas ?? 0;
  const totalVendido = (globalStats?.totalVendidoHistorico ?? 0) + (globalStats?.totalVendidoActivas ?? 0);

  const tendencias = useMemo(() => {
    if (!tendenciasData || tendenciasData.length === 0) return { diff: 0, up: true };
    const actual = tendenciasData[tendenciasData.length - 1].comision;
    const anterior = tendenciasData.length > 1 ? tendenciasData[tendenciasData.length - 2].comision : 0;
    const diff = anterior > 0 ? ((actual - anterior) / anterior) * 100 : 0;
    return { diff: Math.round(diff * 10) / 10, up: diff >= 0 };
  }, [tendenciasData]);

  const comisionesPorMes = useMemo(() => {
    if (!tendenciasData) return [];
    const nombresMes = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return tendenciasData.map((d: any) => {
      const [anio, mesNum] = d.mes.split('-');
      return {
        mes: `${nombresMes[parseInt(mesNum) - 1]} ${anio}`,
        total: Math.round(d.comision * 100) / 100,
      };
    });
  }, [tendenciasData]);

  const topComisionistas = useMemo(() => {
    if (!porComisionista) return [];
    return porComisionista
      .sort((a: any, b: any) => b.totalComision - a.totalComision)
      .slice(0, 5)
      .map((c: any, idx: number) => {
        const shortName = c.comisionistaNombre.length > 16 ? c.comisionistaNombre.slice(0, 16) + '…' : c.comisionistaNombre;
        return {
          name: shortName,
          fullName: c.comisionistaNombre,
          value: Math.round(c.totalComision * 100) / 100,
          color: COLORS[idx % COLORS.length],
        };
      });
  }, [porComisionista]);

  const totalComisionTop = topComisionistas.reduce((s: number, c: any) => s + c.value, 0);


  const ultimasLiquidaciones = useMemo(() => {
    return [...liquidaciones]
      .sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime())
      .slice(0, 5);
  }, [liquidaciones]);

  const ordenesRecientes = useMemo(() => {
    return [...ordenItems]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 5);
  }, [ordenItems]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total Liquidado</p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">${totalLiquidado.toFixed(2)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Comisión Actual</p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">${totalComisionActual.toFixed(2)}</p>
                {tendencias.diff !== 0 && (
                  <p className={`text-xs mt-1 flex items-center gap-1 ${tendencias.up ? 'text-emerald-600' : 'text-red-500'}`}>
                    {tendencias.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(tendencias.diff)}% vs mes anterior
                  </p>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total Vendido</p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">${totalVendido.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Comisionistas Activos</p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{comisionistas.length}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Órdenes en Proceso</p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{ordenItems.length}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">Comisiones por Período</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {comisionesPorMes.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comisionesPorMes} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="mes"
                      tick={{ fill: '#64748b', fontSize: 12 }}
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
                    <Bar dataKey="total" fill="#0f172a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  No hay datos suficientes
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-900">Top Comisionistas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {topComisionistas.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topComisionistas}
                      cx="42%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={78}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {topComisionistas.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => {
                        const num = typeof value === 'number' ? value : Number(value);
                        const pct = totalComisionTop > 0 ? ((num / totalComisionTop) * 100).toFixed(1) : '0';
                        return [`$${num.toFixed(2)} (${pct}%)`, props.payload.fullName];
                      }}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: '12px', color: '#475569', paddingLeft: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  No hay datos suficientes
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grilla inferior: últimas órdenes + liquidaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">Órdenes Recientes</CardTitle>
            </div>
            <Link
              href="/ordenes"
              className="inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors gap-1"
            >
              Ver todas
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Factura</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Producto</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Comisionistas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordenesRecientes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No hay órdenes recientes
                      </td>
                    </tr>
                  ) : (
                    ordenesRecientes.map((item) => {
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-slate-900 font-medium">{item.numeroOrden}</td>
                          <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{item.producto}</td>
                          <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
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
                              <span className="text-xs text-slate-400">Sin asignar</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-slate-900">Últimas Liquidaciones</CardTitle>
            <Link
              href="/historial"
              className="inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors gap-1"
            >
              Ver historial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Período</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Registros</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Total Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ultimasLiquidaciones.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No hay liquidaciones guardadas aún
                      </td>
                    </tr>
                  ) : (
                    ultimasLiquidaciones.map((liq) => {
                      const totalComision = liq.items.reduce((s, item) => {
                        return s + calcularComisionTotalItem(item, comisionistas);
                      }, 0);
                      return (
                        <tr key={liq.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-slate-900 font-medium">{liq.nombre}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-0">
                              {liq.mes}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">{liq.items.length}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums">
                            ${totalComision.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
