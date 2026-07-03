'use client';

import { Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchProveedores } from '@/lib/api';
import { Proveedor } from '@/types';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Lista informativa de razones sociales detectadas en las órdenes.
// Los grupos empresariales se gestionan en la sección Clientes.
export function ProveedoresTab() {
  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: fetchProveedores,
  });

  if (proveedores.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
        <Truck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-700">No hay proveedores</h3>
      </div>
    );
  }

  return (
    <Card className="rounded-2xl border-slate-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-100 hover:bg-transparent">
            <TableHead className="text-slate-500 font-medium">Razón social (proveedor)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proveedores.map((p) => (
            <TableRow key={p.id} className="border-slate-100">
              <TableCell className="font-medium text-slate-900">{p.nombre}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
