'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Power } from 'lucide-react';
import { Header, useSinLiquidar } from './Header';
import { AuthGuard } from './AuthGuard';
import { gruposNav, esActiva } from './nav';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { Loader2 } from 'lucide-react';

function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const sinLiquidar = useSinLiquidar();

  const iniciales = (user?.username ?? '')
    .split(/[.\s_-]+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <aside className="sticky top-0 flex h-screen w-[64px] flex-none flex-col bg-[#0B1220] text-[#93A1B4] lg:w-[236px]">
      <Link
        href="/"
        className="flex items-center gap-[11px] border-b border-white/[0.07] px-3 py-5 hover:no-underline lg:px-[18px]"
      >
        <div className="flex size-8 flex-none items-center justify-center rounded-[9px] bg-primary font-mono text-sm font-semibold text-white">
          D
        </div>
        <div className="hidden min-w-0 lg:block">
          <div className="text-sm font-semibold tracking-[-0.01em] text-white">Dinacuamar</div>
          <div className="text-[10.5px] uppercase tracking-[0.04em] text-[#5F6E82]">Comisiones</div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-2 py-3.5 lg:px-2.5">
        {gruposNav.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-0.5">
            <div className="hidden px-2.5 pb-[7px] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#4E5C70] lg:block">
              {grupo.titulo}
            </div>
            {grupo.items.map((item) => {
              const activa = esActiva(item.href, pathname);
              const Icono = item.icono;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors hover:no-underline ' +
                    (activa
                      ? 'bg-white/10 text-white'
                      : 'text-[#93A1B4] hover:bg-white/[0.06] hover:text-[#E7ECF3]')
                  }
                >
                  <Icono className="size-4 flex-none opacity-85" />
                  <span className="hidden flex-1 truncate lg:block">{item.label}</span>
                  {item.contador && sinLiquidar > 0 && (
                    <span
                      className={
                        'hidden rounded-full px-1.5 py-px font-mono text-[10.5px] text-white lg:inline ' +
                        (activa ? 'bg-white/[0.14]' : 'bg-primary')
                      }
                    >
                      {sinLiquidar}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-white/[0.07] px-3 py-3 lg:px-3.5">
        <div className="flex size-7 flex-none items-center justify-center rounded-full bg-[#1B2739] text-[11.5px] font-semibold text-[#B7C3D3]">
          {iniciales || '—'}
        </div>
        <div className="hidden min-w-0 flex-1 lg:block">
          <div className="truncate text-[12.5px] font-medium text-[#DCE3EC]">{user?.username}</div>
          <div className="text-[10.5px] text-[#5F6E82]">
            {user?.is_superuser ? 'Administración' : 'Operación'}
          </div>
        </div>
        <button
          type="button"
          title="Salir"
          onClick={() => {
            if (confirm('¿Cerrar sesión?')) logout();
          }}
          className="hidden rounded-md p-1 text-[#5F6E82] transition-colors hover:bg-white/[0.06] hover:text-[#F98080] lg:block"
        >
          <Power className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}

/** Sin esto cada pantalla muestra su "no hay nada" mientras carga, que es
 *  indistinguible de no tener datos.
 *  ponytail: espera a las 7 queries juntas. Si alguna se vuelve lenta (ordenes
 *  cuando crezca), conviene un loader por pantalla en vez de este global. */
function Contenido({ children }: { children: React.ReactNode }) {
  const { cargando } = useApp();
  if (!cargando) return <>{children}</>;
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-[#98A2B3]">
      <Loader2 className="size-7 animate-spin" />
      <span className="text-[13px]">Cargando datos…</span>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen items-stretch bg-background">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Header />
          <div className="flex-1 px-5 py-6 lg:px-[30px]">
            <Contenido>{children}</Contenido>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
