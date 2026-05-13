'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Percent, Weight, Search, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Comisionista } from '@/types';
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
  const { comisionistas, addComisionista, updateComisionista, deleteComisionista } = useApp();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Comisionista | null>(null);
  const [form, setForm] = useState<{ nombre: string; tipo: 'porcentaje' | 'fijo_kg'; valor: string }>({ nombre: '', tipo: 'porcentaje', valor: '' });
  const [open, setOpen] = useState(false);

  const filtered = comisionistas.filter(c => 
    c.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setForm({ nombre: '', tipo: 'porcentaje', valor: '' });
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.valor) {
      toast.error('Complete todos los campos');
      return;
    }
    const valor = parseFloat(form.valor);
    if (isNaN(valor) || valor <= 0) {
      toast.error('El valor debe ser un número positivo');
      return;
    }
    if (editing) {
      updateComisionista(editing.id, { nombre: form.nombre, tipo: form.tipo, valor });
    } else {
      addComisionista({ nombre: form.nombre, tipo: form.tipo, valor });
    }
    resetForm();
    setOpen(false);
  };

  const handleEdit = (c: Comisionista) => {
    setEditing(c);
    setForm({ nombre: c.nombre, tipo: c.tipo, valor: c.valor.toString() });
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este comisionista?')) {
      deleteComisionista(id);
    }
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
          <DialogContent className="sm:max-w-md bg-white border-slate-200">
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
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Comisión</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(value) => {
                    if (value) setForm({ ...form, tipo: value as 'porcentaje' | 'fijo_kg' });
                  }}
                >
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                    <SelectItem value="fijo_kg">Valor fijo por kg (USD/kg)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor">
                  {form.tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Valor por kg (USD)'}
                </Label>
                <Input 
                  id="valor" 
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valor} 
                  onChange={e => setForm({ ...form, valor: e.target.value })}
                  placeholder={form.tipo === 'porcentaje' ? 'Ej: 2.5' : 'Ej: 0.05'}
                  className="bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                />
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
              <CardContent className="pt-0">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="flex items-center gap-1 bg-slate-100 text-slate-700 border-0">
                    {c.tipo === 'porcentaje' ? <Percent className="h-3 w-3" /> : <Weight className="h-3 w-3" />}
                    {c.tipo === 'porcentaje' ? 'Porcentaje' : 'USD/kg'}
                  </Badge>
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">
                    {c.tipo === 'porcentaje' ? `${c.valor}%` : `$${c.valor.toFixed(3)}`}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
