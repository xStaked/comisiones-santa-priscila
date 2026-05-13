'use client';

import Link from 'next/link';
import { LayoutDashboard, Calculator, Users, FileText, Download, History, RotateCcw, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';

interface HeaderProps {
  activeTab: string;
}

const tabs = [
  { value: 'dashboard', label: 'Resumen', href: '/', icon: LayoutDashboard },
  { value: 'comisionistas', label: 'Comisionistas', href: '/comisionistas', icon: Users },
  { value: 'ordenes', label: 'Cargar Órdenes', href: '/ordenes', icon: FileText },
  { value: 'liquidacion', label: 'Liquidación', href: '/liquidacion', icon: Download },
  { value: 'historial', label: 'Historial', href: '/historial', icon: History },
  { value: 'reportes', label: 'Reportes', href: '/reportes', icon: BarChart3 },
];

export function Header({ activeTab }: HeaderProps) {
  const { resetDemoData } = useApp();

  return (
    <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
              <Calculator className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Dinacuamar</h1>
              <p className="text-xs text-slate-500">INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.</p>
            </div>
          </Link>
          <div className="hidden sm:flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('¿Restaurar los datos de demostración? Se perderán los cambios no guardados.')) {
                  resetDemoData();
                }
              }}
              className="text-slate-500 hover:text-slate-900 gap-1.5 h-8 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar demo
            </Button>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-500">Sistema activo</span>
            </div>
          </div>
        </div>
        <nav className="mt-2 flex gap-1 h-11 items-center overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.value}
                href={tab.href}
                className={
                  'flex items-center rounded-lg px-4 py-2.5 text-sm font-medium transition-all border whitespace-nowrap ' +
                  (isActive
                    ? 'bg-slate-100 text-slate-900 border-slate-200 shadow-none'
                    : 'text-slate-500 hover:text-slate-700 border-transparent hover:bg-slate-50/50')
                }
              >
                <Icon className="h-4 w-4 mr-2" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
