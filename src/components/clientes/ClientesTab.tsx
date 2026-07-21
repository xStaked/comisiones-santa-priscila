'use client';

import { useState } from 'react';
import { isAxiosError } from 'axios';
import { Plus, Pencil, Trash2, Search, Building2, X, PlusCircle, ToggleLeft, ToggleRight, Tag } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { Cliente, Finca, Grupo } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { fetchFincas, createFinca, updateFinca as apiUpdateFinca, deleteFinca as apiDeleteFinca, fetchGrupos, createGrupo, deleteGrupo } from '@/lib/api';

function mostrarErrorFinca(error: unknown, mensaje: string) {
  const detalle = isAxiosError<{ detail?: string }>(error) ? error.response?.data?.detail : undefined;
  toast.error(detalle || mensaje);
}

export function ClientesTab() {
  const queryClient = useQueryClient();
  const { clientes, addCliente, updateCliente, deleteCliente } = useApp();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [fincasOriginales, setFincasOriginales] = useState<Finca[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    nombre: string;
    tipo: 'grupo' | 'individual';
    activo: boolean;
    grupoId: string;
    fincas: { id?: string; nombre: string }[];
    nuevaFinca: string;
    alias: string[];
  }>({
    nombre: '',
    tipo: 'individual',
    activo: true,
    grupoId: '',
    fincas: [],
    nuevaFinca: '',
    alias: [],
  });
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const [aliasInput, setAliasInput] = useState('');

  const { data: grupos = [] } = useQuery<Grupo[]>({
    queryKey: ['grupos'],
    queryFn: fetchGrupos,
  });

  const crearGrupoMutation = useMutation({
    mutationFn: createGrupo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grupos'] });
      setNuevoGrupo('');
      toast.success('Grupo creado');
    },
    onError: (err) => mostrarErrorFinca(err, 'Error al crear grupo'),
  });

  const eliminarGrupoMutation = useMutation({
    mutationFn: deleteGrupo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grupos'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success('Grupo eliminado');
    },
    onError: (err) => mostrarErrorFinca(err, 'Error al eliminar grupo'),
  });

  const handleCrearGrupo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoGrupo.trim()) {
      toast.error('Ingresa un nombre de grupo');
      return;
    }
    crearGrupoMutation.mutate(nuevoGrupo.trim());
  };

  const fincasQuery = useQuery({
    queryKey: ['fincas', editing?.id],
    queryFn: () => fetchFincas(editing!.id),
    enabled: !!editing && editing.tipo === 'grupo',
  });

  const fincasExistentes: Finca[] = fincasQuery.data ?? [];

  const createFincaMutation = useMutation({
    mutationFn: ({ clienteId, data }: { clienteId: string; data: Omit<Finca, 'id' | 'createdAt'> }) =>
      createFinca(clienteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (err) => mostrarErrorFinca(err, 'Error al crear sector'),
  });

  const updateFincaMutation = useMutation({
    mutationFn: ({ clienteId, id, data }: { clienteId: string; id: string; data: Partial<Finca> }) =>
      apiUpdateFinca(clienteId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (err) => mostrarErrorFinca(err, 'Error al actualizar sector'),
  });

  const deleteFincaMutation = useMutation({
    mutationFn: ({ clienteId, id }: { clienteId: string; id: string }) => apiDeleteFinca(clienteId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fincas'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (err) => mostrarErrorFinca(err, 'Error al eliminar sector'),
  });

  const filtered = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setForm({
      nombre: '',
      tipo: 'individual',
      activo: true,
      grupoId: '',
      fincas: [],
      nuevaFinca: '',
      alias: [],
    });
    setEditing(null);
    setFincasOriginales([]);
    setAliasInput('');
  };

  const agregarAlias = () => {
    const limpio = aliasInput.trim();
    if (limpio && !form.alias.includes(limpio)) {
      setForm({ ...form, alias: [...form.alias, limpio] });
      setAliasInput('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast.error('Ingresa el nombre del cliente');
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      activo: form.activo,
      grupoId: form.grupoId || undefined,
      alias: form.alias.filter((a) => a.trim() !== ''),
    };

    if (editing) {
      updateCliente(editing.id, payload);
      try {
        const fincasFormIds = form.fincas.map((f) => f.id).filter(Boolean) as string[];
        const eliminaciones = fincasOriginales
          .filter((f) => !fincasFormIds.includes(f.id))
          .map((f) => deleteFincaMutation.mutateAsync({ clienteId: editing.id, id: f.id }));
        const actualizaciones = form.fincas.flatMap((f) => {
          if (f.id) {
            return updateFincaMutation.mutateAsync({
              clienteId: editing.id,
              id: f.id,
              data: { nombre: f.nombre.trim() },
            });
          }
          if (f.nombre.trim()) {
            return createFincaMutation.mutateAsync({
              clienteId: editing.id,
              data: { nombre: f.nombre.trim(), clienteId: editing.id, activo: true },
            });
          }
          return [];
        });
        await Promise.all([...eliminaciones, ...actualizaciones]);
      } catch {
        return;
      }
    } else {
      // Para crear, no podemos crear fincas hasta tener el clienteId
      // Por simplicidad, solo creamos el cliente y las fincas se agregan después editando
      addCliente(payload);
      toast.info('Cliente creado. Edítalo para agregar sectores.');
    }
    resetForm();
    setOpen(false);
  };

  const handleEdit = (c: Cliente) => {
    setEditing(c);
    const fincasCliente = (c.fincas ?? fincasExistentes)
      .filter((f) => f.clienteId === c.id)
    setFincasOriginales(fincasCliente);
    setForm({
      nombre: c.nombre,
      tipo: c.tipo,
      activo: c.activo,
      grupoId: c.grupoId || '',
      fincas: fincasCliente.map((f) => ({ id: f.id, nombre: f.nombre })),
      nuevaFinca: '',
      alias: c.alias ?? [],
    });
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este cliente?')) {
      deleteCliente(id);
    }
  };

  const addFincaForm = () => {
    if (!form.nuevaFinca.trim()) return;
    setForm((prev) => ({
      ...prev,
      fincas: [...prev.fincas, { nombre: prev.nuevaFinca.trim() }],
      nuevaFinca: '',
    }));
  };

  const removeFincaForm = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      fincas: prev.fincas.filter((_, i) => i !== idx),
    }));
  };

  const updateFincaForm = (idx: number, nombre: string) => {
    setForm((prev) => ({
      ...prev,
      fincas: prev.fincas.map((f, i) => (i === idx ? { ...f, nombre } : f)),
    }));
  };

  const fincasPorCliente = (cliente: Cliente) =>
    cliente.fincas ?? fincasExistentes.filter((f) => f.clienteId === cliente.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
          />
        </div>
        <Button
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
          className="btn-primary-dark rounded-xl"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Cliente
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg bg-white border-slate-200 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Grupo Acuícola S.A."
                  className="bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(value) => setForm({ ...form, tipo: value as 'grupo' | 'individual' })}
                >
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <SelectValue placeholder="Tipo">
                      {form.tipo === 'individual' ? 'Individual' : 'Grupo'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="grupo">Grupo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Grupo empresarial</Label>
                <Select
                  value={form.grupoId}
                  onValueChange={(value) => setForm({ ...form, grupoId: value || '' })}
                >
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <span className="flex flex-1 truncate text-left">
                      {grupos.find((g) => g.id === form.grupoId)?.nombre || 'N/A (sin grupo)'}
                    </span>
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="alias">Alias (razón social en las facturas)</Label>
                <div className="flex gap-2">
                  <Input
                    id="alias"
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agregarAlias();
                      }
                    }}
                    placeholder="Ej: CAMARONERA FAGUILL S.A."
                    className="bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={agregarAlias}
                    className="rounded-xl border-slate-200 shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {form.alias.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.alias.map((a, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="flex items-center gap-1 bg-slate-100 text-slate-700 border-0 pl-2 pr-1"
                      >
                        <Tag className="h-3 w-3" />
                        {a}
                        <button
                          type="button"
                          onClick={() =>
                            setForm({ ...form, alias: form.alias.filter((_, idx) => idx !== i) })
                          }
                          className="ml-1 p-0.5 rounded hover:bg-slate-200"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm({ ...form, activo: !form.activo })}
                  className={form.activo ? 'text-emerald-600' : 'text-slate-400'}
                >
                  {form.activo ? <ToggleRight className="h-5 w-5 mr-1" /> : <ToggleLeft className="h-5 w-5 mr-1" />}
                  {form.activo ? 'Activo' : 'Inactivo'}
                </Button>
              </div>

              {form.tipo === 'grupo' && editing && (
                <div className="space-y-3 border rounded-xl p-4 border-slate-200 bg-slate-50/50">
                  <Label>Sectores del grupo</Label>
                  {form.fincas.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={f.nombre}
                        onChange={(e) => updateFincaForm(idx, e.target.value)}
                        placeholder="Nombre del sector"
                        className="bg-white border-slate-200 rounded-xl flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-slate-400 hover:text-red-600"
                        onClick={() => removeFincaForm(idx)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      value={form.nuevaFinca}
                      onChange={(e) => setForm({ ...form, nuevaFinca: e.target.value })}
                      placeholder="Nuevo sector..."
                      className="bg-white border-slate-200 rounded-xl flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addFincaForm();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addFincaForm}
                      className="rounded-xl border-slate-200 text-slate-600"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setOpen(false);
                  }}
                  className="rounded-xl border-slate-200"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="btn-primary-dark rounded-xl">
                  {editing ? 'Guardar Cambios' : 'Crear Cliente'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">Grupos empresariales</CardTitle>
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
                      if (confirm(`¿Eliminar el grupo "${g.nombre}"? Los clientes asignados quedarán sin grupo.`)) {
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

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
          <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700">No hay clientes</h3>
          <p className="text-sm text-slate-500 mt-1">Crea tu primer cliente para comenzar</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="card-elevated rounded-2xl">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold text-slate-900">{c.nombre}</CardTitle>
                    {c.activo ? (
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-0 text-xs">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-0 text-xs">
                        Inactivo
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                      onClick={() => handleEdit(c)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="flex items-center gap-1 bg-slate-100 text-slate-700 border-0">
                    <Tag className="h-3 w-3" />
                    {c.tipo === 'grupo' ? 'Grupo' : 'Individual'}
                  </Badge>
                  {c.grupo && (
                    <Badge variant="secondary" className="flex items-center gap-1 bg-indigo-50 text-indigo-700 border-0">
                      {c.grupo.nombre}
                    </Badge>
                  )}
                </div>
                {c.tipo === 'grupo' && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-500 mb-1.5 font-medium">Sectores</p>
                    <div className="flex flex-wrap gap-1.5">
                      {fincasPorCliente(c).map((f) => (
                        <Badge
                          key={f.id}
                          variant="outline"
                          className="text-xs border-slate-200 text-slate-600 bg-white"
                        >
                          {f.nombre}
                        </Badge>
                      ))}
                      {fincasPorCliente(c).length === 0 && (
                        <span className="text-xs text-slate-400">Sin sectores registrados</span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
