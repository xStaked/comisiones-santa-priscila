'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { itemActivo } from './nav';
import { useApp } from '@/context/AppContext';

/** Registros pagados que aún tienen alguna asignación sin liquidar. */
export function useSinLiquidar() {
  const { ordenItems } = useApp();
  return useMemo(
    () =>
      ordenItems.filter(
        (o) => o.estado === 'pagada' && o.comisionistas.some((a) => !a.liquidacionId)
      ).length,
    [ordenItems]
  );
}

/** Subtítulos con conteos en vivo; el resto usa el subtítulo estático de nav.ts. */
function useSubtitulo(href: string | undefined, porDefecto: string) {
  const { ordenItems, clientes, productos, comisionistas, liquidaciones } = useApp();
  const sinLiquidar = useSinLiquidar();

  switch (href) {
    case '/ordenes': {
      const facturas = new Set(ordenItems.map((o) => o.numeroOrden)).size;
      return `${facturas} facturas cargadas · ${sinLiquidar} registros sin liquidar`;
    }
    case '/liquidacion':
      return `${sinLiquidar} registros pagados sin liquidar`;
    case '/historial':
      return `${liquidaciones.length} liquidaciones guardadas`;
    case '/clientes':
      return `${clientes.length} clientes`;
    case '/productos':
      return `${productos.length} productos · unidades de comisión`;
    case '/comisionistas':
      return `${comisionistas.length} comisionistas activos`;
    default:
      return porDefecto;
  }
}

export function Header() {
  const pathname = usePathname();
  const item = itemActivo(pathname);
  const subtitulo = useSubtitulo(item?.href, item?.subtitulo ?? '');

  return (
    <header className="sticky top-0 z-30 flex h-[62px] items-center gap-[18px] border-b border-border bg-white/[0.92] px-5 backdrop-blur-md lg:px-[30px]">
      <div className="min-w-0 flex-1">
        <h1 className="m-0 text-lg font-semibold tracking-[-0.015em] text-[#0B1220]">
          {item?.label ?? 'Dinacuamar'}
        </h1>
        <div className="mt-px truncate text-xs text-[#6B7684]">{subtitulo}</div>
      </div>
    </header>
  );
}
