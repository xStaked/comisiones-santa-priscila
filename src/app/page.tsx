'use client';

import { useState } from 'react';
import { AppProvider } from '@/context/AppContext';
import { Header } from '@/components/Header';
import { DashboardTab } from '@/components/dashboard/DashboardTab';
import { ComisionistasTab } from '@/components/comisionistas/ComisionistasTab';
import { OrdenesTab } from '@/components/ordenes/OrdenesTab';
import { LiquidacionTab } from '@/components/liquidacion/LiquidacionTab';
import { HistorialTab } from '@/components/historial/HistorialTab';

function Dashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <DashboardTab onTabChange={setActiveTab} />}
        {activeTab === 'comisionistas' && <ComisionistasTab />}
        {activeTab === 'ordenes' && <OrdenesTab />}
        {activeTab === 'liquidacion' && <LiquidacionTab />}
        {activeTab === 'historial' && <HistorialTab />}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
}
