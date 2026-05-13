'use client';

import { Calculator, Users, FileText, Download, History } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface HeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
              <Calculator className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Dinacuamar</h1>
              <p className="text-xs text-slate-500">INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-slate-500">Sistema activo</span>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={onTabChange} className="mt-2">
          <TabsList className="bg-transparent p-0 h-11 gap-1">
            <TabsTrigger 
              value="comisionistas" 
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:border-slate-200 data-[state=active]:shadow-none rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-all border border-transparent"
            >
              <Users className="h-4 w-4 mr-2" />
              Comisionistas
            </TabsTrigger>
            <TabsTrigger 
              value="ordenes"
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:border-slate-200 data-[state=active]:shadow-none rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-all border border-transparent"
            >
              <FileText className="h-4 w-4 mr-2" />
              Cargar Órdenes
            </TabsTrigger>
            <TabsTrigger 
              value="liquidacion"
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:border-slate-200 data-[state=active]:shadow-none rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-all border border-transparent"
            >
              <Download className="h-4 w-4 mr-2" />
              Liquidación
            </TabsTrigger>
            <TabsTrigger 
              value="historial"
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:border-slate-200 data-[state=active]:shadow-none rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-all border border-transparent"
            >
              <History className="h-4 w-4 mr-2" />
              Historial
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
