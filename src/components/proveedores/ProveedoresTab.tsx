'use client';

import { useState } from 'react';
import { Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchProveedores } from '@/lib/api';
import { Proveedor } from '@/types';
import { BarraAcciones, Buscador, Panel, Vacio } from '@/components/ui/dc';

// Lista informativa de razones sociales detectadas en las órdenes.
// Los grupos empresariales se gestionan en la sección Clientes.
export function ProveedoresTab() {
  const [search, setSearch] = useState('');
  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: fetchProveedores,
  });

  const filtered = proveedores.filter((p) =>
    p.nombre.toLowerCase().includes(search.toLowerCase())
  );

  if (proveedores.length === 0) {
    return (
      <Vacio
        icono={Truck}
        titulo="No hay proveedores"
        nota="Las razones sociales aparecen aquí al cargar facturas que las mencionen."
      />
    );
  }

  return (
    <div className="flex max-w-[900px] flex-col gap-3.5">
      <BarraAcciones>
        <Buscador
          value={search}
          onChange={setSearch}
          placeholder="Buscar razón social…"
          className="w-full sm:w-[320px]"
        />
      </BarraAcciones>

      <Panel>
        <div className="th-tabla border-b border-border bg-[#FAFBFC] px-[18px] py-2.5">
          Razón social (proveedor)
        </div>
        {filtered.length === 0 ? (
          <div className="px-[18px] py-10 text-center text-sm text-[#98A2B3]">
            Ninguna razón social coincide con «{search}»
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className="border-b border-[#F2F4F6] px-[18px] py-3 text-[13px] text-[#0B1220] transition-colors hover:bg-[#FAFBFC]"
            >
              {p.nombre}
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
