'use client';

import { useState } from 'react';
import { Plus, Trash2, Truck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProveedores, fetchGrupos, updateProveedor, createGrupo, deleteGrupo } from '@/lib/api';
import { Proveedor, Grupo } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

export function ProveedoresTab() {
  const queryClient = useQueryClient();
  const [nuevoGrupo, setNuevoGrupo] = useState('');

  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: fetchProveedores,
  });
  const { data: grupos = [] } = useQuery<Grupo[]>({
    queryKey: ['grupos'],
    queryFn: fetchGrupos,
  });

  const asignarGrupoMutation = useMutation({
    mutationFn: ({ id, grupoId }: { id: string; grupoId: string | null }) => updateProveedor(id, grupoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Proveedor actualizado');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al actualizar proveedor'),
  });

  const crearGrupoMutation = useMutation({
    mutationFn: createGrupo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grupos'] });
      setNuevoGrupo('');
      toast.success('Grupo creado');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al crear grupo'),
  });

  const eliminarGrupoMutation = useMutation({
    mutationFn: deleteGrupo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grupos'] });
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      toast.success('Grupo eliminado');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al eliminar grupo'),
  });

  const handleCrearGrupo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoGrupo.trim()) {
      toast.error('Ingresa un nombre de grupo');
      return;
    }
    crearGrupoMutation.mutate(nuevoGrupo.trim());
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">Grupos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCrearGrupo} className="flex gap-2">
            <Input
              placeholder="Nombre del nuevo grupo..."
              value={nuevoGrupo}
              onChange={(e) => setNuevoGrupo(e.target.value)}
              className="bg-white border-slate-200 rounded-xl w-72"
            />
            <Button type="submit" className="btn-primary-dark rounded-xl">
              <Plus className="h-4 w-4 mr-2" />
              Crear Grupo
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {grupos.length === 0 ? (
              <p className="text-sm text-slate-500">No hay grupos creados</p>
            ) : (
              grupos.map((g) => (
                <Badge key={g.id} variant="secondary" className="flex items-center gap-2 bg-slate-100 text-slate-700 border-0 py-1.5 px-3">
                  {g.nombre}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar el grupo "${g.nombre}"? Los proveedores asignados quedarán sin grupo.`)) {
                        eliminarGrupoMutation.mutate(g.id);
                      }
                    }}
                    className="text-slate-400 hover:text-red-600"
                    aria-label={`Eliminar grupo ${g.nombre}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {proveedores.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
          <Truck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700">No hay proveedores</h3>
        </div>
      ) : (
        <Card className="rounded-2xl border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="text-slate-500 font-medium">Razón social (proveedor)</TableHead>
                <TableHead className="text-slate-500 font-medium w-72">Grupo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proveedores.map((p) => (
                <TableRow key={p.id} className="border-slate-100">
                  <TableCell className="font-medium text-slate-900">{p.nombre}</TableCell>
                  <TableCell>
                    <Select
                      value={p.grupoId || ''}
                      onValueChange={(v) => asignarGrupoMutation.mutate({ id: p.id, grupoId: v || null })}
                    >
                      <SelectTrigger className="w-64 rounded-xl border-slate-200 bg-white h-9 text-sm text-slate-900">
                        <span className="flex flex-1 truncate text-left">{p.grupo || 'N/A'}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">N/A (sin grupo)</SelectItem>
                        {grupos.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
