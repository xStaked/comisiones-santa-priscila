'use client';

import { useState } from 'react';
import { isAxiosError } from 'axios';
import { Plus, Pencil, Trash2, Building2, X, PlusCircle, ToggleLeft, ToggleRight, Tag } from 'lucide-react';
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
import {
  BarraAcciones,
  BotonPrimario,
  Buscador,
  Chip,
  Etiqueta,
  Panel,
  PanelTitulo,
  Vacio,
} from '@/components/ui/dc';
import { toast } from 'sonner';
import { RetencionCard } from '@/components/clientes/RetencionCard';
import { fetchFincas, createFinca, updateFinca as apiUpdateFinca, deleteFinca as apiDeleteFinca, fetchGrupos, createGrupo, deleteGrupo } from '@/lib/api';

const COLS =
  'grid-cols-[minmax(0,1.5fr)_110px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)_90px]';

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
    <div className="flex max-w-[1200px] flex-col gap-3.5">
      <RetencionCard />
      <BarraAcciones>
        <Buscador
          value={search}
          onChange={setSearch}
          placeholder="Buscar cliente o alias…"
          className="w-full sm:w-[280px]"
        />
        <div className="flex-1" />
        <BotonPrimario
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          <Plus className="size-3.5" /> Nuevo cliente
        </BotonPrimario>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
                  className="bg-white border-border rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(value) => setForm({ ...form, tipo: value as 'grupo' | 'individual' })}
                >
                  <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
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
                  <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
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
                    className="bg-white border-border rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={agregarAlias}
                    className="rounded-xl border-border shrink-0"
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
                        className="flex items-center gap-1 bg-[#F0F2F5] text-[#344054] border-0 pl-2 pr-1"
                      >
                        <Tag className="h-3 w-3" />
                        {a}
                        <button
                          type="button"
                          onClick={() =>
                            setForm({ ...form, alias: form.alias.filter((_, idx) => idx !== i) })
                          }
                          className="ml-1 p-0.5 rounded hover:bg-[#E5E8EC]"
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
                  className={form.activo ? 'text-primary' : 'text-[#98A2B3]'}
                >
                  {form.activo ? <ToggleRight className="h-5 w-5 mr-1" /> : <ToggleLeft className="h-5 w-5 mr-1" />}
                  {form.activo ? 'Activo' : 'Inactivo'}
                </Button>
              </div>

              {form.tipo === 'grupo' && editing && (
                <div className="space-y-3 border rounded-xl p-4 border-border bg-[#FAFBFC]">
                  <Label>Sectores del grupo</Label>
                  {form.fincas.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={f.nombre}
                        onChange={(e) => updateFincaForm(idx, e.target.value)}
                        placeholder="Nombre del sector"
                        className="bg-white border-border rounded-xl flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-[#98A2B3] hover:text-[#B91C1C]"
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
                      className="bg-white border-border rounded-xl flex-1"
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
                      className="rounded-xl border-border text-[#475467]"
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
                  className="rounded-xl"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-xl">
                  {editing ? 'Guardar cambios' : 'Crear cliente'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </BarraAcciones>

      <Panel>
        <PanelTitulo titulo="Grupos empresariales" nota="Agrupan clientes que comparten matriz" />
        <div className="space-y-3 px-5 py-4">
          <form onSubmit={handleCrearGrupo} className="flex gap-2">
            <Input
              placeholder="Nombre del nuevo grupo…"
              value={nuevoGrupo}
              onChange={(e) => setNuevoGrupo(e.target.value)}
              className="w-72 rounded-xl"
            />
            <Button type="submit" className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Crear grupo
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {grupos.length === 0 ? (
              <p className="text-sm text-[#98A2B3]">No hay grupos creados</p>
            ) : (
              grupos.map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center gap-2 rounded-full bg-[#F2F4F6] py-1 pl-3 pr-2 text-xs font-medium text-[#475467]"
                >
                  {g.nombre}
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          `¿Eliminar el grupo "${g.nombre}"? Los clientes asignados quedarán sin grupo.`
                        )
                      ) {
                        eliminarGrupoMutation.mutate(g.id);
                      }
                    }}
                    className="text-[#98A2B3] transition hover:text-[#B91C1C]"
                    aria-label={`Eliminar grupo ${g.nombre}`}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </Panel>

      {filtered.length === 0 ? (
        <Vacio
          icono={Building2}
          titulo={clientes.length === 0 ? 'No hay clientes' : 'Ningún cliente coincide'}
          nota={
            clientes.length === 0
              ? 'Crea tu primer cliente para comenzar.'
              : 'Prueba con otro nombre o alias.'
          }
        />
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <div className="min-w-[1000px]">
              <div className={`th-tabla grid ${COLS} gap-3 border-b border-border bg-[#FAFBFC] px-[18px] py-2.5`}>
                <div>Cliente</div>
                <div>Tipo</div>
                <div>Grupo</div>
                <div>Sectores</div>
                <div>Alias de importación</div>
                <div className="text-right">Acciones</div>
              </div>

              {filtered.map((c) => {
                const sectores = fincasPorCliente(c);
                return (
                  <div
                    key={c.id}
                    className={`grid ${COLS} items-center gap-3 border-b border-[#F2F4F6] px-[18px] py-3 transition-colors hover:bg-[#FAFBFC]`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-[#0B1220]">{c.nombre}</span>
                      {!c.activo && <Chip>Inactivo</Chip>}
                    </div>
                    <div>
                      <Chip tono={c.tipo === 'grupo' ? 'azul' : 'neutro'}>
                        {c.tipo === 'grupo' ? 'Grupo' : 'Individual'}
                      </Chip>
                    </div>
                    <div className="truncate text-[12.5px] text-[#6B7684]">{c.grupo?.nombre ?? '—'}</div>
                    <div className="truncate text-[12.5px] text-[#344054]" title={sectores.map((f) => f.nombre).join(', ')}>
                      {c.tipo === 'grupo'
                        ? sectores.length > 0
                          ? `${sectores.length} sector${sectores.length === 1 ? '' : 'es'}`
                          : 'Sin sectores'
                        : '—'}
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {(c.alias ?? []).length === 0 ? (
                        <span className="text-xs text-[#98A2B3]">—</span>
                      ) : (
                        c.alias!.map((a, i) => (
                          <Etiqueta key={i} title={a} className="max-w-[150px] truncate">
                            {a}
                          </Etiqueta>
                        ))
                      )}
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => handleEdit(c)}
                        className="inline-flex size-7 items-center justify-center rounded-[7px] border border-[#E0E4E9] bg-white text-[#98A2B3] transition hover:border-[#C6CDD6] hover:text-[#0B1220]"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        title="Eliminar"
                        onClick={() => handleDelete(c.id)}
                        className="inline-flex size-7 items-center justify-center rounded-[7px] border border-[#E0E4E9] bg-white text-[#98A2B3] transition hover:border-[#F5C2C2] hover:text-[#B91C1C]"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
