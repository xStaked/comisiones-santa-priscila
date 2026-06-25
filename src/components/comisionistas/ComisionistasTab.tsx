'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Percent, Weight, Search, Users, TrendingUp, FileText, X, PlusCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Comisionista, TarifaComision } from '@/types';
import { calcularDetalleComision } from '@/lib/export-utils';
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

export function ComisionistasTab() {
  const { comisionistas, addComisionista, updateComisionista, deleteComisionista, ordenItems, liquidaciones, tarifasClienteProducto } = useApp();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Comisionista | null>(null);
  const [form, setForm] = useState<{
    nombre: string;
    tarifas: { tipo: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor: string; proveedoresExcluidos: string }[]
  }>({
    nombre: '',
    tarifas: [{ tipo: 'porcentaje', valor: '', proveedoresExcluidos: '' }],
  });
  const [open, setOpen] = useState(false);

  const filtered = comisionistas.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase())
  );

  // Calcular stats por comisionista
  const statsPorComisionista = (c: Comisionista) => {
    const allItems = [...ordenItems, ...liquidaciones.flatMap(l => l.items)];
    const items = allItems.filter(i => i.comisionistas.some(a => a.comisionistaId === c.id));
    const total = items.reduce((s, i) => s + calcularDetalleComision(i, c, tarifasClienteProducto).comision, 0);
    const ordenes = new Set(items.map(i => i.numeroOrden)).size;
    return { ordenes, total };
  };

  const resetForm = () => {
    setForm({ nombre: '', tarifas: [{ tipo: 'porcentaje', valor: '', proveedoresExcluidos: '' }] });
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast.error('Ingresa el nombre del comisionista');
      return;
    }
    const tarifas: TarifaComision[] = form.tarifas
      .filter(t => t.valor && parseFloat(t.valor) > 0)
      .map(t => ({
        tipo: t.tipo,
        valor: parseFloat(t.valor),
        proveedoresExcluidos: t.proveedoresExcluidos
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean),
      }));

    if (tarifas.length === 0) {
      toast.error('Agrega al menos una tarifa válida');
      return;
    }

    if (editing) {
      updateComisionista(editing.id, { nombre: form.nombre, tarifas });
    } else {
      addComisionista({ nombre: form.nombre, tarifas });
    }
    resetForm();
    setOpen(false);
  };

  const handleEdit = (c: Comisionista) => {
    setEditing(c);
    setForm({
      nombre: c.nombre,
      tarifas: c.tarifas.map(t => ({
        tipo: t.tipo,
        valor: t.valor.toString(),
        proveedoresExcluidos: (t.proveedoresExcluidos || []).join('\n'),
      })),
    });
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este comisionista?')) {
      deleteComisionista(id);
    }
  };

  const addTarifa = () => {
    setForm(prev => ({
      ...prev,
      tarifas: [...prev.tarifas, { tipo: 'porcentaje', valor: '', proveedoresExcluidos: '' }],
    }));
  };

  const removeTarifa = (idx: number) => {
    setForm(prev => ({
      ...prev,
      tarifas: prev.tarifas.filter((_, i) => i !== idx),
    }));
  };

  const updateTarifa = (idx: number, field: 'tipo' | 'valor' | 'proveedoresExcluidos', value: string) => {
    setForm(prev => ({
      ...prev,
      tarifas: prev.tarifas.map((t, i) => i === idx ? { ...t, [field]: value } : t),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar comisionista..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
          />
        </div>
        <Button onClick={() => { resetForm(); setOpen(true); }} className="btn-primary-dark rounded-xl">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Comisionista
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg bg-white border-slate-200">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Comisionista' : 'Nuevo Comisionista'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={e => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                  className="bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                />
              </div>

              <div className="space-y-3">
                <Label>Tarifas de Comisión</Label>
                {form.tarifas.map((tarifa, idx) => (
                  <div key={idx} className="space-y-2 p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <Select
                        value={tarifa.tipo}
                        onValueChange={(value) => updateTarifa(idx, 'tipo', value as 'porcentaje' | 'fijo_kg' | 'fijo_unidad')}
                      >
                        <SelectTrigger className="w-40 rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                          <SelectItem value="fijo_kg">USD/kg</SelectItem>
                          <SelectItem value="fijo_unidad">USD/unidad</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={tarifa.valor}
                        onChange={e => updateTarifa(idx, 'valor', e.target.value)}
                        placeholder={tarifa.tipo === 'porcentaje' ? 'Ej: 2.5' : tarifa.tipo === 'fijo_kg' ? 'Ej: 0.05' : 'Ej: 1.00'}
                        className="bg-white border-slate-200 rounded-xl flex-1"
                      />
                      {form.tarifas.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-red-600" onClick={() => removeTarifa(idx)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Proveedores excluidos (uno por línea)</Label>
                      <textarea
                        value={tarifa.proveedoresExcluidos}
                        onChange={e => updateTarifa(idx, 'proveedoresExcluidos', e.target.value)}
                        placeholder="Ej: OCHOA RECALDE ELIZABETH MERCEDES"
                        className="w-full min-h-[60px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10 resize-none"
                      />
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addTarifa} className="rounded-xl border-slate-200 text-slate-600">
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Agregar otra tarifa
                </Button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { resetForm(); setOpen(false); }} className="rounded-xl border-slate-200">
                  Cancelar
                </Button>
                <Button type="submit" className="btn-primary-dark rounded-xl">
                  {editing ? 'Guardar Cambios' : 'Crear Comisionista'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
          <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700">No hay comisionistas</h3>
          <p className="text-sm text-slate-500 mt-1">Crea tu primer comisionista para comenzar</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(c => (
            <Card key={c.id} className="card-elevated rounded-2xl">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base font-semibold text-slate-900">{c.nombre}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" onClick={() => handleEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {c.tarifas.map((t, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <Badge variant="secondary" className="flex items-center gap-1 bg-slate-100 text-slate-700 border-0 w-fit">
                        {t.tipo === 'porcentaje' ? <Percent className="h-3 w-3" /> : <Weight className="h-3 w-3" />}
                        {t.tipo === 'porcentaje' ? `${typeof t.valor === 'string' ? parseFloat(t.valor) : t.valor}%` : `$${typeof t.valor === 'string' ? parseFloat(t.valor).toFixed(3) : t.valor.toFixed(3)}/${t.tipo === 'fijo_kg' ? 'kg' : 'unidad'}`}
                      </Badge>
                      {t.proveedoresExcluidos && t.proveedoresExcluidos.length > 0 && (
                        <span className="text-[10px] text-slate-500 truncate max-w-[200px]" title={t.proveedoresExcluidos.join(', ')}>
                          Excluye: {t.proveedoresExcluidos.join(', ')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <FileText className="h-3 w-3" />
                    <span>{statsPorComisionista(c).ordenes} órdenes</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                    <TrendingUp className="h-3 w-3" />
                    <span>${statsPorComisionista(c).total.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
