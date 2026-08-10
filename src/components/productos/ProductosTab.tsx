'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Package, X, Tag } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Producto } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Vacio,
} from '@/components/ui/dc';
import { toast } from 'sonner';

const unidadLabels: Record<string, string> = {
  kg: 'Kilogramo',
  litro: 'Litro',
  tacho: 'Tacho',
  saco: 'Saco',
  unidad: 'Unidad',
  caneca: 'Caneca',
  galon: 'Galón',
};

const unidadPesoLabels: Record<string, string> = {
  kg: 'kg',
  litro: 'kg',
  tacho: 'kg',
  saco: 'kg',
  unidad: 'kg',
  caneca: 'lt',
  galon: 'lt',
};

const COLS = 'grid-cols-[minmax(0,1.7fr)_150px_minmax(0,1.5fr)_minmax(0,1.2fr)_90px]';

/**
 * "Conversión verificada" del prototipo: en ámbar cuando falta el factor que
 * la comisión necesita para pasar de envases a kg.
 */
function conversionDe(p: Producto): { texto: string; ok: boolean } {
  const peso = unidadPesoLabels[p.unidadComision] ?? 'kg';
  switch (p.unidadComision) {
    case 'kg':
    case 'litro':
      return { texto: `Directo · 1 ${p.unidadComision} = 1 ${p.unidadComision}`, ok: true };
    case 'tacho':
      return p.tachoKilos
        ? { texto: `1 tacho = ${p.tachoKilos} kg`, ok: true }
        : { texto: 'Falta el factor de conversión', ok: false };
    case 'saco':
      return p.sacoKilos
        ? { texto: `1 saco = ${p.sacoKilos} kg`, ok: true }
        : { texto: 'Falta el factor de conversión', ok: false };
    default:
      return p.pesoPorUnidad
        ? { texto: `1 ${p.unidadComision} = ${p.pesoPorUnidad} ${peso}`, ok: true }
        : { texto: 'Falta el factor de conversión', ok: false };
  }
}

export function ProductosTab() {
  const { productos, addProducto, updateProducto, deleteProducto } = useApp();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Producto | null>(null);
  const [open, setOpen] = useState(false);
  const [aliasInput, setAliasInput] = useState('');
  const [form, setForm] = useState<{
    nombre: string;
    unidadComision: 'kg' | 'litro' | 'tacho' | 'saco' | 'unidad' | 'caneca' | 'galon';
    tachoKilos: string;
    sacoKilos: string;
    pesoPorUnidad: string;
    activo: boolean;
    alias: string[];
  }>({
    nombre: '',
    unidadComision: 'kg',
    tachoKilos: '',
    sacoKilos: '',
    pesoPorUnidad: '',
    activo: true,
    alias: [],
  });

  const filtered = productos.filter((p) =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.alias?.some((a) => a.toLowerCase().includes(search.toLowerCase()))
  );

  const resetForm = () => {
    setForm({
      nombre: '',
      unidadComision: 'kg',
      tachoKilos: '',
      sacoKilos: '',
      pesoPorUnidad: '',
      activo: true,
      alias: [],
    });
    setAliasInput('');
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast.error('Ingresa el nombre del producto');
      return;
    }

    const payload: Omit<Producto, 'id' | 'createdAt'> = {
      nombre: form.nombre.trim(),
      unidadComision: form.unidadComision,
      tachoKilos: form.unidadComision === 'tacho' && form.tachoKilos ? parseFloat(form.tachoKilos) : undefined,
      sacoKilos: form.unidadComision === 'saco' && form.sacoKilos ? parseFloat(form.sacoKilos) : undefined,
      pesoPorUnidad: form.pesoPorUnidad ? parseFloat(form.pesoPorUnidad) : undefined,
      activo: form.activo,
      alias: form.alias.filter((a) => a.trim() !== ''),
    };

    if (editing) {
      updateProducto(editing.id, payload);
    } else {
      addProducto(payload);
    }
    resetForm();
    setOpen(false);
  };

  const handleEdit = (p: Producto) => {
    setEditing(p);
    setForm({
      nombre: p.nombre,
      unidadComision: p.unidadComision,
      tachoKilos: p.tachoKilos?.toString() ?? '',
      sacoKilos: p.sacoKilos?.toString() ?? '',
      pesoPorUnidad: p.pesoPorUnidad?.toString() ?? '',
      activo: p.activo,
      alias: p.alias || [],
    });
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este producto?')) {
      deleteProducto(id);
    }
  };

  return (
    <div className="flex max-w-[1200px] flex-col gap-3.5">
      <BarraAcciones>
        <Buscador
          value={search}
          onChange={setSearch}
          placeholder="Buscar producto…"
          className="w-full sm:w-[280px]"
        />
        <div className="flex-1" />
        <BotonPrimario
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          <Plus className="size-3.5" /> Nuevo producto
        </BotonPrimario>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Camarón congelado"
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unidad">Unidad de Comisión</Label>
                <Select
                  value={form.unidadComision}
                  onValueChange={(value) =>
                    setForm({ ...form, unidadComision: value as 'kg' | 'litro' | 'tacho' | 'saco' | 'unidad' | 'caneca' | 'galon', tachoKilos: '', sacoKilos: '' })
                  }
                >
                  <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
                    <SelectValue placeholder="Unidad">
                      {unidadLabels[form.unidadComision] || 'Unidad'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Kilogramo (kg)</SelectItem>
                    <SelectItem value="litro">Litro</SelectItem>
                    <SelectItem value="tacho">Tacho</SelectItem>
                    <SelectItem value="saco">Saco</SelectItem>
                    <SelectItem value="unidad">Unidad</SelectItem>
                    <SelectItem value="caneca">Caneca</SelectItem>
                    <SelectItem value="galon">Galón</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.unidadComision === 'tacho' && (
                <div className="space-y-2">
                  <Label htmlFor="tachoKilos">Kilos por tacho</Label>
                  <Input
                    id="tachoKilos"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.tachoKilos}
                    onChange={(e) => setForm({ ...form, tachoKilos: e.target.value })}
                    placeholder="Ej: 20"
                    className="rounded-xl"
                  />
                </div>
              )}

              {form.unidadComision === 'saco' && (
                <div className="space-y-2">
                  <Label htmlFor="sacoKilos">Kilos por saco</Label>
                  <Input
                    id="sacoKilos"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.sacoKilos}
                    onChange={(e) => setForm({ ...form, sacoKilos: e.target.value })}
                    placeholder="Ej: 25"
                    className="rounded-xl"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="pesoPorUnidad">Peso por unidad ({unidadPesoLabels[form.unidadComision]})</Label>
                <Input
                  id="pesoPorUnidad"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.pesoPorUnidad}
                  onChange={(e) => setForm({ ...form, pesoPorUnidad: e.target.value })}
                  placeholder={form.unidadComision === 'caneca' ? 'Ej: 20 (litros por caneca)' : form.unidadComision === 'galon' ? 'Ej: 3.785 (litros por galón)' : 'Ej: 10 (para cajas de 10kg)'}
                  className="rounded-xl"
                />
                <p className="text-xs text-[#7A8798]">
                  {form.unidadComision === 'caneca' || form.unidadComision === 'galon'
                    ? 'Opcional. Define cuántos litros contiene cada unidad para la conversión a kg.'
                    : 'Opcional. Usar cuando la cantidad en órdenes viene en unidades/cajas/sacas pero la comisión es por kg.'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="alias">Alias (nombres en órdenes de compra)</Label>
                <div className="flex gap-2">
                  <Input
                    id="alias"
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const trimmed = aliasInput.trim();
                        if (trimmed && !form.alias.includes(trimmed)) {
                          setForm({ ...form, alias: [...form.alias, trimmed] });
                          setAliasInput('');
                        }
                      }
                    }}
                    placeholder="Ej: ECU-BACILLUS SUELO-PASTILLA TH"
                    className="rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const trimmed = aliasInput.trim();
                      if (trimmed && !form.alias.includes(trimmed)) {
                        setForm({ ...form, alias: [...form.alias, trimmed] });
                        setAliasInput('');
                      }
                    }}
                    className="shrink-0 rounded-xl"
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
                  {editing ? 'Guardar cambios' : 'Crear producto'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </BarraAcciones>

      {filtered.length === 0 ? (
        <Vacio
          icono={Package}
          titulo={productos.length === 0 ? 'No hay productos' : 'Ningún producto coincide'}
          nota={
            productos.length === 0
              ? 'Crea tu primer producto para comenzar.'
              : 'Prueba con otro nombre o alias.'
          }
        />
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className={`th-tabla grid ${COLS} gap-3 border-b border-border bg-[#FAFBFC] px-[18px] py-2.5`}>
                <div>Producto</div>
                <div>Unidad de comisión</div>
                <div>Conversión verificada</div>
                <div>Alias</div>
                <div className="text-right">Acciones</div>
              </div>

              {filtered.map((p) => {
                const conv = conversionDe(p);
                return (
                  <div
                    key={p.id}
                    className={`grid ${COLS} items-center gap-3 border-b border-[#F2F4F6] px-[18px] py-3 transition-colors hover:bg-[#FAFBFC]`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13px] text-[#0B1220]">{p.nombre}</span>
                      {!p.activo && <Chip>Inactivo</Chip>}
                    </div>
                    <div>
                      <Chip mono>{unidadLabels[p.unidadComision] ?? p.unidadComision}</Chip>
                    </div>
                    <div
                      className="cifra truncate text-xs"
                      style={{ color: conv.ok ? '#475467' : '#B45309' }}
                      title={conv.texto}
                    >
                      {conv.texto}
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {(p.alias ?? []).length === 0 ? (
                        <span className="text-xs text-[#98A2B3]">—</span>
                      ) : (
                        p.alias!.map((a, i) => (
                          <Etiqueta key={i} title={a} className="max-w-[160px] truncate">
                            {a}
                          </Etiqueta>
                        ))
                      )}
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => handleEdit(p)}
                        className="inline-flex size-7 items-center justify-center rounded-[7px] border border-[#E0E4E9] bg-white text-[#98A2B3] transition hover:border-[#C6CDD6] hover:text-[#0B1220]"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        title="Eliminar"
                        onClick={() => handleDelete(p.id)}
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
