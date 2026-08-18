'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { fetchGlobalStats, fetchTendencias, fetchPorComisionista } from '@/lib/api';
import type { EstadoOrden } from '@/types';

const PALETA = ['#0F766E', '#1D4ED8', '#B45309', '#6D28D9', '#0E7490'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const n = (v: number, d = 2) =>
  v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const m = (v: number) => '$' + n(v);

const CHIPS: Record<EstadoOrden, { label: string; bg: string; fg: string }> = {
  pagada: { label: 'Pagada', bg: '#E6F2F0', fg: '#0B5E56' },
  pendiente: { label: 'Pendiente', bg: '#FEF3E2', fg: '#9A5B0B' },
  parcialmente_pagada: { label: 'Parcial', bg: '#EAF0FB', fg: '#1D4ED8' },
  liquidada: { label: 'Liquidada', bg: '#F0F2F5', fg: '#475467' },
};

function ChipEstado({ estado }: { estado?: EstadoOrden }) {
  const c = CHIPS[estado ?? 'pendiente'] ?? CHIPS.pendiente;
  return (
    <span
      className="rounded-full px-2 py-[2.5px] text-[11px] font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  );
}

export function DashboardTab() {
  const { comisionistas, ordenItems, liquidaciones } = useApp();

  const { data: globalStats } = useQuery({ queryKey: ['reportes', 'global'], queryFn: fetchGlobalStats });
  const { data: tendenciasData } = useQuery({ queryKey: ['reportes', 'tendencias'], queryFn: fetchTendencias });
  const { data: porComisionista } = useQuery({ queryKey: ['reportes', 'por-comisionista'], queryFn: fetchPorComisionista });

  const totalLiquidado = globalStats?.totalComisionadoHistorico ?? 0;
  const porLiquidar = globalStats?.totalComisionPagadas ?? globalStats?.totalComisionActivas ?? 0;
  const ordenesPagadas = globalStats?.totalOrdenesPagadas ?? globalStats?.totalOrdenesActivas ?? 0;
  const totalVendido =
    (globalStats?.totalVendidoHistorico ?? 0) +
    (globalStats?.totalVendidoPagadas ?? globalStats?.totalVendidoActivas ?? 0);

  // Registros pagados aún sin liquidar y comisionistas involucrados
  const pendientes = useMemo(() => {
    const items = ordenItems.filter(
      (o) => o.estado === 'pagada' && o.comisionistas.some((a) => !a.liquidacionId)
    );
    const personas = new Set<string>();
    items.forEach((o) => o.comisionistas.forEach((a) => !a.liquidacionId && personas.add(a.comisionistaId)));
    const facturas = new Set(items.map((o) => o.numeroOrden));
    return { registros: items.length, facturas: facturas.size, personas: personas.size };
  }, [ordenItems]);

  const variacion = useMemo(() => {
    if (!tendenciasData || tendenciasData.length < 2) return null;
    const actual = tendenciasData[tendenciasData.length - 1].comision;
    const anterior = tendenciasData[tendenciasData.length - 2].comision;
    if (anterior <= 0) return null;
    return Math.round(((actual - anterior) / anterior) * 1000) / 10;
  }, [tendenciasData]);

  const barras = useMemo(() => {
    const datos: { mes: string; valor: number }[] = (tendenciasData ?? [])
      .slice(-6)
      .map((d: { mes: string; comision: number }) => {
        const [, mesNum] = d.mes.split('-');
        return { mes: MESES[parseInt(mesNum, 10) - 1] ?? d.mes, valor: d.comision };
      });
    const max = Math.max(1, ...datos.map((b) => b.valor));
    return datos.map((b, i) => ({
      ...b,
      etiqueta: b.valor >= 1000 ? n(b.valor / 1000, 1) + 'k' : n(b.valor, 0),
      altura: Math.max(2, Math.round((b.valor / max) * 130)),
      ultima: i === datos.length - 1,
    }));
  }, [tendenciasData]);

  const topComisionistas = useMemo(() => {
    if (!porComisionista) return [];
    const orden = [...porComisionista].sort((a, b) => b.totalComision - a.totalComision).slice(0, 5);
    const max = Math.max(1, ...orden.map((c) => c.totalComision));
    return orden.map((c, i) => ({
      nombre: c.comisionistaNombre,
      monto: m(c.totalComision),
      ancho: Math.round((c.totalComision / max) * 100),
      color: PALETA[i % PALETA.length],
    }));
  }, [porComisionista]);

  const recientes = useMemo(
    () =>
      [...ordenItems]
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
        .slice(0, 6),
    [ordenItems]
  );

  const ultimasLiquidaciones = useMemo(
    () =>
      [...liquidaciones]
        .sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime())
        .slice(0, 4),
    [liquidaciones]
  );

  const kpis = [
    { label: 'Total vendido', valor: m(totalVendido), delta: variacion !== null ? (variacion >= 0 ? '+' : '−') + n(Math.abs(variacion), 1) + ' %' : '—', deltaColor: variacion === null ? '#98A2B3' : variacion >= 0 ? '#0F766E' : '#B45309', nota: 'comisión vs mes anterior' },
    { label: 'Facturas pagadas', valor: String(ordenesPagadas), delta: String(pendientes.facturas), deltaColor: '#0F766E', nota: 'listas para liquidar' },
    { label: 'Total liquidado', valor: m(totalLiquidado), delta: String(liquidaciones.length), deltaColor: '#0F766E', nota: 'liquidaciones guardadas' },
    { label: 'Comisionistas', valor: String(comisionistas.length), delta: String(pendientes.personas), deltaColor: '#B45309', nota: 'con saldo pendiente' },
  ];

  return (
    <div className="flex max-w-[1360px] flex-col gap-4">
      {/* Hero + KPIs secundarios */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="relative flex min-h-[196px] flex-col justify-between overflow-hidden rounded-[14px] bg-[#0B1220] px-6 py-[22px] text-white">
          <div className="pointer-events-none absolute -right-10 -top-10 size-[200px] rounded-full bg-primary opacity-[0.16]" />
          <div className="relative">
            <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#8394AA]">
              Comisión por liquidar
            </div>
            <div className="cifra mt-2 text-[44px] font-semibold leading-none">{m(porLiquidar)}</div>
            <div className="mt-2 text-[13px] text-[#A9B6C7]">
              {pendientes.registros} registros de {pendientes.facturas} facturas pagadas ·{' '}
              {pendientes.personas} comisionistas
            </div>
          </div>
          <div className="relative mt-5 flex gap-2.5">
            <Link
              href="/liquidacion"
              className="flex h-[38px] items-center rounded-[9px] bg-primary px-[18px] text-[13.5px] font-semibold text-white transition hover:brightness-110 hover:no-underline"
            >
              Liquidar ahora →
            </Link>
            <Link
              href="/ordenes"
              className="flex h-[38px] items-center rounded-[9px] border border-white/[0.18] px-4 text-[13.5px] font-medium text-[#D6DEE8] transition hover:bg-white/[0.07] hover:no-underline hover:text-[#D6DEE8]"
            >
              Ver facturas pagadas
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="flex flex-col justify-between rounded-xl border border-border bg-white px-4 py-[15px]"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#7A8798]">
                {k.label}
              </div>
              <div className="cifra mt-2.5 text-2xl font-semibold text-[#0B1220]">{k.valor}</div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="cifra text-[11.5px] font-semibold" style={{ color: k.deltaColor }}>
                  {k.delta}
                </span>
                <span className="text-[11.5px] text-[#98A2B3]">{k.nota}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Barras + top comisionistas */}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="rounded-xl border border-border bg-white px-5 pb-3.5 pt-[18px]">
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <div className="text-sm font-semibold text-[#0B1220]">Comisión liquidada por mes</div>
              <div className="mt-0.5 text-xs text-[#7A8798]">Últimos 6 meses</div>
            </div>
            <div className="cifra text-xs text-[#7A8798]">USD</div>
          </div>
          {barras.length > 0 ? (
            <div className="flex h-[172px] items-end gap-3.5 pb-0.5">
              {barras.map((b) => (
                <div key={b.mes} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div className="cifra text-[11px] font-medium text-[#475467]">{b.etiqueta}</div>
                  <div
                    className="w-full rounded-t-md"
                    style={{ height: b.altura, background: b.ultima ? '#0F766E' : '#D7DDE4' }}
                  />
                  <div className="text-[11.5px] text-[#7A8798]">{b.mes}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-[172px] items-center justify-center text-sm text-[#98A2B3]">
              No hay datos suficientes
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white px-5 py-[18px]">
          <div className="mb-4 flex items-baseline justify-between">
            <div className="text-sm font-semibold text-[#0B1220]">Top comisionistas</div>
            <Link href="/comisionistas" className="text-xs font-medium">
              Ver todos
            </Link>
          </div>
          <div className="flex flex-col gap-[13px]">
            {topComisionistas.length === 0 && (
              <div className="text-sm text-[#98A2B3]">No hay datos suficientes</div>
            )}
            {topComisionistas.map((c) => (
              <div key={c.nombre} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="truncate text-[13px] font-medium text-[#0B1220]">{c.nombre}</span>
                  <span className="cifra text-[12.5px] font-semibold text-[#0B1220]">{c.monto}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-[3px] bg-[#F0F2F5]">
                  <div
                    className="h-full rounded-[3px]"
                    style={{ width: `${c.ancho}%`, background: c.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Facturas recientes + últimas liquidaciones */}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="flex items-center justify-between border-b border-[#EDEFF2] px-5 pb-[13px] pt-[15px]">
            <div className="text-sm font-semibold text-[#0B1220]">Facturas recientes</div>
            <Link href="/ordenes" className="text-xs font-medium">
              Ver todas
            </Link>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="th-tabla grid grid-cols-[130px_92px_1fr_108px_92px] gap-3 border-b border-[#EDEFF2] bg-[#FAFBFC] px-5 py-2.5">
                <div>Factura</div>
                <div>Fecha</div>
                <div>Cliente</div>
                <div className="text-right">Total</div>
                <div className="text-right">Estado</div>
              </div>
              {recientes.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[#98A2B3]">
                  No hay facturas recientes
                </div>
              ) : (
                recientes.map((o) => (
                  <div
                    key={o.id}
                    className="grid grid-cols-[130px_92px_1fr_108px_92px] items-center gap-3 border-b border-[#F2F4F6] px-5 py-2.5 transition-colors hover:bg-[#FAFBFC]"
                  >
                    <div className="cifra truncate text-[12.5px] font-medium text-[#0B1220]">
                      {o.numeroOrden}
                    </div>
                    <div className="cifra text-[12.5px] text-[#6B7684]">
                      {new Date(o.fecha).toLocaleDateString('es-ES')}
                    </div>
                    <div className="truncate text-[13px] text-[#344054]">
                      {o.cliente?.nombre || '—'}
                    </div>
                    <div className="cifra text-right text-[12.5px] font-medium text-[#0B1220]">
                      {m(o.total)}
                    </div>
                    <div className="text-right">
                      <ChipEstado estado={o.estado} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="flex items-center justify-between border-b border-[#EDEFF2] px-5 pb-[13px] pt-[15px]">
            <div className="text-sm font-semibold text-[#0B1220]">Últimas liquidaciones</div>
            <Link href="/historial" className="text-xs font-medium">
              Historial
            </Link>
          </div>
          {ultimasLiquidaciones.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[#98A2B3]">
              No hay liquidaciones guardadas aún
            </div>
          ) : (
            ultimasLiquidaciones.map((liq) => {
              const total = liq.totalComision;
              const personas = new Set(
                liq.items.flatMap((i) => i.comisionistas.map((a) => a.comisionistaId))
              ).size;
              return (
                <Link
                  key={liq.id}
                  href={`/historial/${liq.id}`}
                  className="flex items-center justify-between gap-3 border-b border-[#F2F4F6] px-5 py-3 transition-colors hover:bg-[#FAFBFC] hover:no-underline"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-[#0B1220]">{liq.nombre}</div>
                    <div className="mt-0.5 text-[11.5px] text-[#7A8798]">
                      {liq.items.length} registros · {personas} comisionistas · {liq.mes}
                    </div>
                  </div>
                  <div className="cifra text-[13px] font-semibold text-primary">{m(total)}</div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
