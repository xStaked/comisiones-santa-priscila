'use client';

import { usePathname } from 'next/navigation';
import { Header } from './Header';
import { AuthGuard } from './AuthGuard';

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const activeTab =
    pathname.startsWith('/historial') ? 'historial' :
    pathname.startsWith('/comisionistas') ? 'comisionistas' :
    pathname.startsWith('/ordenes') ? 'ordenes' :
    pathname.startsWith('/liquidacion') ? 'liquidacion' :
    pathname.startsWith('/reportes') ? 'reportes' :
    'dashboard';

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#F8F9FB]">
        <Header activeTab={activeTab} />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
