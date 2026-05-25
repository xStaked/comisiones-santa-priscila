'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Search, Package, Weight, Droplets, Box } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Producto } from '@/types';
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

const unidadLabels: Record<string, string> = {
  kg: 'Kilogramo',
  litro: 'Litro',
  tacho: 'Tacho',
  unidad: 'Unidad',
};

const unidadIcons: Record<string, React.ReactNode> = {
  kg: <Weight className="h-3 w-3" />,
  litro: <Droplets className="h-3 w-3" />,
  tacho: <Box className="h-3 w-3" />,
  unidad: <Package className="h-3 w-3" />,
};

export function ProductosTab() {
  const { productos, addProducto, updateProducto, deleteProducto } = useApp();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Producto | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    nombre: string;
    unidadComision: 'kg' | 'litro' | 'tacho' | 'unidad';
    tachoKilos: string;
    activo: boolean;
  }>({
    nombre: '',
    unidadComision: 'kg',
    tachoKilos: '',
    activo: true,
  });

  const filtered = productos.filter((p) =>
    p.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setForm({
      nombre: '',
      unidadComision: 'kg',
      tachoKilos: '',
      activo: true,
    });
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
      activo: form.activo,
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
      activo: p.activo,
    });
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este producto?')) {
      deleteProducto(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar producto..."
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
          Nuevo Producto
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg bg-white border-slate-200">
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
                  className="bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unidad">Unidad de Comisión</Label>
                <Select
                  value={form.unidadComision}
                  onValueChange={(value) =>
                    setForm({ ...form, unidadComision: value as 'kg' | 'litro' | 'tacho' | 'unidad', tachoKilos: '' })
                  }
                >
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <SelectValue placeholder="Unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Kilogramo (kg)</SelectItem>
                    <SelectItem value="litro">Litro</SelectItem>
                    <SelectItem value="tacho">Tacho</SelectItem>
                    <SelectItem value="unidad">Unidad</SelectItem>
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
                    className="bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                  />
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
                  {editing ? 'Guardar Cambios' : 'Crear Producto'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
          <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700">No hay productos</h3>
          <p className="text-sm text-slate-500 mt-1">Crea tu primer producto para comenzar</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} className="card-elevated rounded-2xl">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold text-slate-900">{p.nombre}</CardTitle>
                    {p.activo ? (
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
                      onClick={() => handleEdit(p)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="flex items-center gap-1 bg-slate-100 text-slate-700 border-0">
                    {unidadIcons[p.unidadComision]}
                    {unidadLabels[p.unidadComision]}
                  </Badge>
                  {p.unidadComision === 'tacho' && p.tachoKilos !== undefined && (
                    <Badge variant="secondary" className="flex items-center gap-1 bg-slate-100 text-slate-700 border-0">
                      <Weight className="h-3 w-3" />
                      {p.tachoKilos} kg/tacho
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
