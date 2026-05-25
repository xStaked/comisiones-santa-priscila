import { Shell } from '@/components/Shell';
import { TarifasTab } from '@/components/tarifas/TarifasTab';

export default function TarifasPage() {
  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tarifas por Cliente y Producto</h2>
          <p className="text-sm text-slate-500 mt-1">
            Gestiona las tarifas específicas que vinculan comisionistas con clientes y productos.
          </p>
        </div>
        <TarifasTab />
      </div>
    </Shell>
  );
}
