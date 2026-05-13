'use client';

import { useMemo } from 'react';
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
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { calcularComision } from '@/lib/export-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';


export function DashboardTab({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const { comisionistas, ordenItems, liquidaciones } = useApp();

  const comisionistaMap = useMemo(
    () => new Map(comisionistas.map((c) => [c.id, c])),
    [comisionistas]
  );

  // KPIs
  const totalLiquidado = useMemo(() => {
    return liquidaciones.reduce((sum, liq) => {
      const comisionLiq = liq.items.reduce((s, item) => {
        const com = item.comisionistaId ? comisionistaMap.get(item.comisionistaId) : undefined;
        return s + calcularComision(item, com);
      }, 0);
      return sum + comisionLiq;
    }, 0);
  }, [liquidaciones, comisionistaMap]);

  const totalComisionActual = useMemo(() => {
    return ordenItems.reduce((s, item) => {
      const com = item.comisionistaId ? comisionistaMap.get(item.comisionistaId) : undefined;
      return s + calcularComision(item, com);
    }, 0);
  }, [ordenItems, comisionistaMap]);

  // Comisiones por mes (historial + actual)
  const comisionesPorMes = useMemo(() => {
    const map = new Map<string, number>();

    // Liquidaciones históricas
    liquidaciones.forEach((liq) => {
      const mes = liq.mes;
      const comisionLiq = liq.items.reduce((s, item) => {
        const com = item.comisionistaId ? comisionistaMap.get(item.comisionistaId) : undefined;
        return s + calcularComision(item, com);
      }, 0);
      map.set(mes, (map.get(mes) || 0) + comisionLiq);
    });

    // Órdenes actuales
    if (ordenItems.length > 0) {
      const ahora = new Date().toISOString().slice(0, 7);
      const comisionActual = ordenItems.reduce((s, item) => {
        const com = item.comisionistaId ? comisionistaMap.get(item.comisionistaId) : undefined;
        return s + calcularComision(item, com);
      }, 0);
      map.set(ahora, (map.get(ahora) || 0) + comisionActual);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, total]) => {
        const [anio, mesNum] = mes.split('-');
        const nombresMes = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return {
          mes: `${nombresMes[parseInt(mesNum) - 1]} ${anio}`,
          total: Math.round(total * 100) / 100,
        };
      });
  }, [liquidaciones, ordenItems, comisionistaMap]);

  // Top comisionistas (todo: histórico + actual)
  const topComisionistas = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number }>();

    const procesarItems = (items: typeof ordenItems) => {
      items.forEach((item) => {
        if (!item.comisionistaId) return;
        const com = comisionistaMap.get(item.comisionistaId);
        if (!com) return;
        const comision = calcularComision(item, com);
        const existente = map.get(item.comisionistaId);
        if (existente) {
          existente.total += comision;
        } else {
          map.set(item.comisionistaId, { nombre: com.nombre, total: comision });
        }
      });
    };

    liquidaciones.forEach((liq) => procesarItems(liq.items));
    procesarItems(ordenItems);

    const COLORS = ['#0f172a', '#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((c, idx) => {
        const shortName = c.nombre.length > 16 ? c.nombre.slice(0, 16) + '…' : c.nombre;
        return {
          name: shortName,
          fullName: c.nombre,
          value: Math.round(c.total * 100) / 100,
          color: COLORS[idx % COLORS.length],
        };
      });
  }, [liquidaciones, ordenItems, comisionistaMap]);

  const totalComisionTop = topComisionistas.reduce((s, c) => s + c.value, 0);


  const ultimasLiquidaciones = useMemo(() => {
    return [...liquidaciones]
      .sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime())
      .slice(0, 5);
  }, [liquidaciones]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Comisionistas Activos</p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{comisionistas.length}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
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
                      {topComisionistas.map((entry, index) => (
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

      {/* Últimas liquidaciones */}
      <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900">Últimas Liquidaciones</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTabChange('historial')}
            className="text-slate-500 hover:text-slate-900 gap-1"
          >
            Ver historial
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Período</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Registros</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Total Orden</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Total Comisión</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ultimasLiquidaciones.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No hay liquidaciones guardadas aún
                    </td>
                  </tr>
                ) : (
                  ultimasLiquidaciones.map((liq) => {
                    const totalOrden = liq.items.reduce((s, i) => s + i.total, 0);
                    const totalComision = liq.items.reduce((s, item) => {
                      const com = item.comisionistaId ? comisionistaMap.get(item.comisionistaId) : undefined;
                      return s + calcularComision(item, com);
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
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                          ${totalOrden.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums">
                          ${totalComision.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {new Date(liq.fechaCreacion).toLocaleDateString('es-ES')}
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
  );
}
