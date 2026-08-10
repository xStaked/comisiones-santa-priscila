'use client';

/**
 * Primitivas visuales del rediseño ("Dinacuamar Rediseño.dc.html").
 * Solo presentación: ningún componente de aquí toca lógica de negocio.
 */
import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EstadoOrden } from '@/types';

/* ── formato ───────────────────────────────────────────────────────── */

export const num = (v: number, d = 2) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('es-ES', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

export const money = (v: number) => '$' + num(v);

export const fechaCorta = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES') : '—';

export function iniciales(nombre: string) {
  const p = (nombre || '').trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '—';
}

/** Paleta categórica del prototipo, estable por identificador. */
export const PALETA_DC = ['#0F766E', '#1D4ED8', '#B45309', '#6D28D9', '#0E7490', '#9D174D', '#3F6212'];

export function colorDe(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETA_DC[h % PALETA_DC.length];
}

/* ── superficies ───────────────────────────────────────────────────── */

export function Panel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('overflow-hidden rounded-xl border border-border bg-white', className)}
      {...props}
    />
  );
}

export function PanelTitulo({
  titulo,
  nota,
  accion,
  className,
}: {
  titulo: React.ReactNode;
  nota?: React.ReactNode;
  accion?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-[#EDEFF2] px-5 pb-[13px] pt-[15px]',
        className
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[#0B1220]">{titulo}</div>
        {nota && <div className="mt-0.5 text-xs text-[#7A8798]">{nota}</div>}
      </div>
      {accion}
    </div>
  );
}

/** Barra superior de filtros/acciones de cada módulo. */
export function BarraAcciones({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap items-center gap-2.5', className)} {...props} />;
}

/* ── controles ─────────────────────────────────────────────────────── */

export function Buscador({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-9 items-center gap-2 rounded-[9px] border border-[#E0E4E9] bg-white px-3 focus-within:border-primary',
        className ?? 'w-full sm:w-[300px]'
      )}
    >
      <Search className="size-3.5 flex-none text-[#98A2B3]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-[#0B1220] outline-none placeholder:text-[#98A2B3]"
      />
    </div>
  );
}

const baseBoton =
  'inline-flex h-9 items-center justify-center gap-[7px] rounded-[9px] px-3 text-[12.5px] font-medium transition disabled:pointer-events-none disabled:opacity-50';

export function BotonPrimario({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(baseBoton, 'bg-primary px-4 text-[13px] font-semibold text-white hover:brightness-110', className)}
      {...props}
    />
  );
}

export function BotonSecundario({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        baseBoton,
        'border border-[#E0E4E9] bg-white text-[#475467] hover:border-[#C6CDD6] hover:text-[#0B1220]',
        className
      )}
      {...props}
    />
  );
}

/** Botón de filtro tipo segmento (activo = tinta sólida). */
export function BotonFiltro({
  activo,
  contador,
  children,
  className,
  ...props
}: React.ComponentProps<'button'> & { activo?: boolean; contador?: React.ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        baseBoton,
        'border',
        activo
          ? 'border-[#0B1220] bg-[#0B1220] text-white'
          : 'border-[#E0E4E9] bg-white text-[#475467] hover:border-[#C6CDD6]',
        className
      )}
      {...props}
    >
      {children}
      {contador !== undefined && (
        <span className="cifra text-[11px] opacity-65">{contador}</span>
      )}
    </button>
  );
}

/** Grupo de pestañas sobre fondo gris (periodos, dimensiones, modos). */
export function Segmentado<T extends string>({
  valor,
  opciones,
  onChange,
  className,
}: {
  valor: T;
  opciones: readonly { valor: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center rounded-[9px] bg-[#F2F4F6] p-[3px]', className)}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={cn(
            'h-[30px] rounded-[7px] px-3.5 text-[12.5px] font-medium transition',
            valor === o.valor ? 'bg-white text-[#0B1220] shadow-sm' : 'text-[#6B7684] hover:text-[#0B1220]'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── indicadores ───────────────────────────────────────────────────── */

export function Chip({
  tono = 'neutro',
  mono,
  className,
  ...props
}: React.ComponentProps<'span'> & {
  tono?: 'neutro' | 'acento' | 'azul' | 'ambar' | 'rojo';
  mono?: boolean;
}) {
  const tonos = {
    neutro: 'bg-[#F0F2F5] text-[#475467]',
    acento: 'bg-[#E6F2F0] text-[#0B5E56]',
    azul: 'bg-[#EAF0FB] text-[#1D4ED8]',
    ambar: 'bg-[#FEF3E2] text-[#9A5B0B]',
    rojo: 'bg-[#FDECEC] text-[#B91C1C]',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-[2.5px] text-[11px] font-semibold',
        tonos[tono],
        mono && 'cifra',
        className
      )}
      {...props}
    />
  );
}

/** Etiqueta pequeña para alias e identificadores. */
export function Etiqueta({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('cifra rounded-[5px] bg-[#F2F4F6] px-[7px] py-0.5 text-[11px] text-[#6B7684]', className)}
      {...props}
    />
  );
}

const ESTADOS: Record<EstadoOrden, { label: string; tono: 'neutro' | 'acento' | 'azul' | 'ambar' }> = {
  pagada: { label: 'Pagada', tono: 'acento' },
  pendiente: { label: 'Pendiente', tono: 'ambar' },
  parcialmente_pagada: { label: 'Parcial', tono: 'azul' },
  liquidada: { label: 'Liquidada', tono: 'neutro' },
};

export function ChipEstado({ estado }: { estado?: EstadoOrden }) {
  const e = ESTADOS[estado ?? 'pendiente'] ?? ESTADOS.pendiente;
  return <Chip tono={e.tono}>{e.label}</Chip>;
}

export function Avatar({
  nombre,
  id,
  size = 24,
  className,
  ...props
}: React.ComponentProps<'span'> & { nombre: string; id?: string; size?: number }) {
  const color = colorDe(id ?? nombre);
  return (
    <span
      title={nombre}
      className={cn('inline-flex flex-none items-center justify-center rounded-full font-semibold', className)}
      style={{
        width: size,
        height: size,
        background: color + '18',
        color,
        fontSize: Math.round(size * 0.42),
      }}
      {...props}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Barra de progreso horizontal (top comisionistas, % del total). */
export function BarraProgreso({ pct, color = '#0F766E' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-[#F0F2F5]">
      <div
        className="h-full rounded-[3px]"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  );
}

/** Aviso ámbar del prototipo (datos congelados, faltan tarifas, …). */
export function Aviso({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-[11px] rounded-[11px] border border-[#F5E3B8] bg-[#FEF7E7] px-4 py-3',
        className
      )}
    >
      <span className="mt-px text-sm text-[#B45309]">◆</span>
      <div className="text-[12.5px] leading-[1.45] text-[#7A4B08]">{children}</div>
    </div>
  );
}

/** Estado vacío consistente en todos los módulos. */
export function Vacio({
  titulo,
  nota,
  icono: Icono,
  accion,
}: {
  titulo: string;
  nota?: string;
  icono?: React.ComponentType<{ className?: string }>;
  accion?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-white px-6 py-16 text-center">
      {Icono && <Icono className="mx-auto mb-4 size-10 text-[#CBD2DA]" />}
      <h3 className="text-base font-semibold text-[#0B1220]">{titulo}</h3>
      {nota && <p className="mx-auto mt-1 max-w-md text-[13px] text-[#7A8798]">{nota}</p>}
      {accion && <div className="mt-4 flex justify-center">{accion}</div>}
    </div>
  );
}
