'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Users, X, PlusCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Comisionista, TarifaComision } from '@/types';
import { calcularDetalleComision, getTarifasLabel } from '@/lib/export-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Avatar,
  BarraAcciones,
  BotonFiltro,
  BotonPrimario,
  Buscador,
  Chip,
  Panel,
  Vacio,
  money,
} from '@/components/ui/dc';
import { toast } from 'sonner';

const getEtiquetaTipoTarifa = (tipo: 'porcentaje' | 'fijo_kg' | 'fijo_unidad') => {
  if (tipo === 'porcentaje') return 'Porcentaje (%)';
  if (tipo === 'fijo_kg') return 'USD/kg';
  return 'USD/unidad';
};

const COLS = 'grid-cols-[minmax(0,1.5fr)_100px_minmax(0,1.1fr)_minmax(0,1.4fr)_130px_150px]';

export function ComisionistasTab() {
  const {
    comisionistas,
    addComisionista,
    updateComisionista,
    deleteComisionista,
    ordenItems,
    tarifasClienteProducto,
  } = useApp();
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'interno' | 'externo'>('todos');
  const [editing, setEditing] = useState<Comisionista | null>(null);
  const [form, setForm] = useState<{
    nombre: string;
    tipo: 'interno' | 'externo';
    tarifas: { tipo: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor: string; proveedoresExcluidos: string }[];
  }>({
    nombre: '',
    tipo: 'externo',
    tarifas: [{ tipo: 'porcentaje', valor: '', proveedoresExcluidos: '' }],
  });
  const [open, setOpen] = useState(false);

  const filtered = comisionistas.filter(
    (c) =>
      c.nombre.toLowerCase().includes(search.toLowerCase()) &&
      (filtroTipo === 'todos' || c.tipo === filtroTipo)
  );

  /** Comisión pendiente: ítems pagados con asignación aún sin liquidar. */
  const pendientePorComisionista = useMemo(() => {
    const acc = new Map<string, number>();
    for (const item of ordenItems) {
      if (item.estado !== 'pagada') continue;
      for (const a of item.comisionistas) {
        if (a.liquidacionId) continue;
        const com = comisionistas.find((c) => c.id === a.comisionistaId);
        if (!com) continue;
        const valor = calcularDetalleComision(item, com, tarifasClienteProducto).comision;
        acc.set(a.comisionistaId, (acc.get(a.comisionistaId) ?? 0) + valor);
      }
    }
    return acc;
  }, [ordenItems, comisionistas, tarifasClienteProducto]);

  const especificasPorComisionista = useMemo(() => {
    const acc = new Map<string, number>();
    for (const t of tarifasClienteProducto) {
      if (t.activo === false) continue;
      acc.set(t.comisionistaId, (acc.get(t.comisionistaId) ?? 0) + 1);
    }
    return acc;
  }, [tarifasClienteProducto]);

  const resetForm = () => {
    setForm({
      nombre: '',
      tipo: 'externo',
      tarifas: [{ tipo: 'porcentaje', valor: '', proveedoresExcluidos: '' }],
    });
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast.error('Ingresa el nombre del comisionista');
      return;
    }
    const tarifas: TarifaComision[] = form.tarifas
      .filter((t) => t.valor && parseFloat(t.valor) > 0)
      .map((t) => ({
        tipo: t.tipo,
        valor: parseFloat(t.valor),
        proveedoresExcluidos: t.proveedoresExcluidos
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      }));

    if (tarifas.length === 0) {
      toast.error('Agrega al menos una tarifa válida');
      return;
    }

    if (editing) {
      updateComisionista(editing.id, { nombre: form.nombre, tipo: form.tipo, tarifas });
    } else {
      addComisionista({ nombre: form.nombre, tipo: form.tipo, tarifas });
    }
    resetForm();
    setOpen(false);
  };

  const handleEdit = (c: Comisionista) => {
    setEditing(c);
    setForm({
      nombre: c.nombre,
      tipo: c.tipo ?? 'externo',
      tarifas: c.tarifas.map((t) => ({
        tipo: t.tipo,
        valor: t.valor.toString(),
        proveedoresExcluidos: (t.proveedoresExcluidos || []).join('\n'),
      })),
    });
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este comisionista?')) deleteComisionista(id);
  };

  const addTarifa = () =>
    setForm((prev) => ({
      ...prev,
      tarifas: [...prev.tarifas, { tipo: 'porcentaje', valor: '', proveedoresExcluidos: '' }],
    }));

  const removeTarifa = (idx: number) =>
    setForm((prev) => ({ ...prev, tarifas: prev.tarifas.filter((_, i) => i !== idx) }));

  const updateTarifa = (
    idx: number,
    field: 'tipo' | 'valor' | 'proveedoresExcluidos',
    value: string
  ) =>
    setForm((prev) => ({
      ...prev,
      tarifas: prev.tarifas.map((t, i) => (i === idx ? { ...t, [field]: value } : t)),
    }));

  return (
    <div className="flex max-w-[1200px] flex-col gap-3.5">
      <BarraAcciones>
        <Buscador value={search} onChange={setSearch} placeholder="Buscar comisionista…" className="w-full sm:w-[280px]" />
        {(['todos', 'interno', 'externo'] as const).map((t) => (
          <BotonFiltro key={t} activo={filtroTipo === t} onClick={() => setFiltroTipo(t)}>
            {t === 'todos' ? 'Todos' : t === 'interno' ? 'Internos' : 'Externos'}
          </BotonFiltro>
        ))}
        <div className="flex-1" />
        <BotonPrimario
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          <Plus className="size-3.5" /> Nuevo comisionista
        </BotonPrimario>
      </BarraAcciones>

      {filtered.length === 0 ? (
        <Vacio
          icono={Users}
          titulo={comisionistas.length === 0 ? 'No hay comisionistas' : 'Ningún comisionista coincide'}
          nota={
            comisionistas.length === 0
              ? 'Crea tu primer comisionista para comenzar a asignar comisiones.'
              : 'Prueba con otro texto o cambia el filtro de tipo.'
          }
        />
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className={`th-tabla grid ${COLS} gap-3 border-b border-border bg-[#FAFBFC] px-[18px] py-2.5`}>
                <div>Comisionista</div>
                <div>Tipo</div>
                <div>Tarifa global</div>
                <div>Regla que se aplica</div>
                <div className="text-right">Pendiente</div>
                <div className="text-right">Acciones</div>
              </div>

              {filtered.map((c) => {
                const especificas = especificasPorComisionista.get(c.id) ?? 0;
                const excluidos = c.tarifas.flatMap((t) => t.proveedoresExcluidos || []);
                return (
                  <div
                    key={c.id}
                    className={`grid ${COLS} items-center gap-3 border-b border-[#F2F4F6] px-[18px] py-3 transition-colors hover:bg-[#FAFBFC]`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar nombre={c.nombre} id={c.id} size={28} />
                      <span className="truncate text-[13px] font-medium text-[#0B1220]">{c.nombre}</span>
                    </div>
                    <div>
                      <Chip tono={c.tipo === 'interno' ? 'neutro' : 'acento'}>
                        {c.tipo === 'interno' ? 'Interno' : 'Externo'}
                      </Chip>
                    </div>
                    <div className="cifra truncate text-[12.5px] text-[#344054]" title={getTarifasLabel(c)}>
                      {getTarifasLabel(c) || '—'}
                    </div>
                    <div className="min-w-0 text-xs leading-[1.35]">
                      <div style={{ color: especificas > 0 ? '#0B5E56' : '#98A2B3' }}>
                        {especificas > 0
                          ? `Usa ${especificas} tarifas específicas`
                          : 'Usa la tarifa global'}
                      </div>
                      {excluidos.length > 0 && (
                        <div className="truncate text-[11px] text-[#98A2B3]" title={excluidos.join(', ')}>
                          Excluye {excluidos.length} razón(es) social(es)
                        </div>
                      )}
                    </div>
                    <div className="cifra text-right text-[12.5px] font-semibold text-[#0B1220]">
                      {money(pendientePorComisionista.get(c.id) ?? 0)}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Link href="/tarifas" className="text-xs font-medium">
                        Ver tarifas →
                      </Link>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar comisionista' : 'Nuevo comisionista'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Juan Pérez"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(value) => setForm({ ...form, tipo: value as 'interno' | 'externo' })}
              >
                <SelectTrigger id="tipo" className="h-10 w-full">
                  <SelectValue>{form.tipo === 'interno' ? 'Interno' : 'Externo'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interno">Interno</SelectItem>
                  <SelectItem value="externo">Externo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Tarifas de comisión</Label>
              {form.tarifas.map((tarifa, idx) => (
                <div key={idx} className="space-y-2 rounded-xl border border-border bg-[#FAFBFC] p-3">
                  <div className="flex items-center gap-2">
                    <Select
                      value={tarifa.tipo}
                      onValueChange={(value) => updateTarifa(idx, 'tipo', value ?? 'porcentaje')}
                    >
                      <SelectTrigger className="h-10 w-40">
                        <SelectValue placeholder="Tipo">{getEtiquetaTipoTarifa(tarifa.tipo)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                        <SelectItem value="fijo_kg">USD/kg</SelectItem>
                        <SelectItem value="fijo_unidad">USD/unidad</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={tarifa.valor}
                      onChange={(e) => updateTarifa(idx, 'valor', e.target.value)}
                      placeholder={
                        tarifa.tipo === 'porcentaje'
                          ? 'Ej: 2.5'
                          : tarifa.tipo === 'fijo_kg'
                            ? 'Ej: 0.05'
                            : 'Ej: 1.00'
                      }
                      className="flex-1"
                    />
                    {form.tarifas.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 text-[#98A2B3] hover:text-[#B91C1C]"
                        onClick={() => removeTarifa(idx)}
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Proveedores excluidos (uno por línea)
                    </Label>
                    <textarea
                      value={tarifa.proveedoresExcluidos}
                      onChange={(e) => updateTarifa(idx, 'proveedoresExcluidos', e.target.value)}
                      placeholder="Ej: OCHOA RECALDE ELIZABETH MERCEDES"
                      className="input-clean min-h-[60px] w-full resize-none rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addTarifa} className="rounded-xl">
                <PlusCircle className="mr-2 size-4" />
                Agregar otra tarifa
              </Button>
            </div>

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
                {editing ? 'Guardar cambios' : 'Crear comisionista'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
