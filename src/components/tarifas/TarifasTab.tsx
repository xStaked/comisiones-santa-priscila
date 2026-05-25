'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Percent, Weight, Search, FileSpreadsheet } from 'lucide-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { TarifaClienteProducto, Finca } from '@/types';
import { fetchFincas } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

function FincaSelect({
  clienteId,
  value,
  onChange,
}: {
  clienteId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { data: fincas = [] } = useQuery({
    queryKey: ['fincas', clienteId],
    queryFn: () => fetchFincas(clienteId),
    enabled: !!clienteId,
  });

  const fincaSeleccionada = fincas.find((f: Finca) => f.id === value);
  const etiqueta = value ? fincaSeleccionada?.nombre || 'Finca no encontrada' : 'Todas las fincas del cliente';

  return (
    <div className="space-y-2">
      <Label htmlFor="finca">Finca (opcional)</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
          <span className="flex flex-1 truncate text-left">{etiqueta}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Todas las fincas del cliente</SelectItem>
          {fincas.map((f: Finca) => (
            <SelectItem key={f.id} value={f.id}>
              {f.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function nombreRelacion(valor?: string | { nombre: string } | null) {
  if (!valor) return undefined;
  return typeof valor === 'string' ? valor : valor.nombre;
}

export function TarifasTab() {
  const {
    tarifasClienteProducto,
    comisionistas,
    clientes,
    productos,
    addTarifa,
    updateTarifa,
    deleteTarifa,
  } = useApp();

  const [search, setSearch] = useState('');
  const [filtroComisionista, setFiltroComisionista] = useState<string>('todos');
  const [filtroCliente, setFiltroCliente] = useState<string>('todos');
  const [filtroProducto, setFiltroProducto] = useState<string>('todos');
  const [filtroFinca, setFiltroFinca] = useState<string>('todas');

  const [editing, setEditing] = useState<TarifaClienteProducto | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    comisionistaId: string;
    clienteId: string;
    productoId: string;
    fincaId: string;
    tipo: 'porcentaje' | 'fijo_kg';
    valor: string;
    activo: boolean;
  }>({
    comisionistaId: '',
    clienteId: '',
    productoId: '',
    fincaId: '',
    tipo: 'porcentaje',
    valor: '',
    activo: true,
  });

  // Cargar fincas del cliente seleccionado en el filtro
  const { data: fincasFiltro = [] } = useQuery({
    queryKey: ['fincas', filtroCliente],
    queryFn: () => fetchFincas(filtroCliente),
    enabled: filtroCliente !== 'todos',
  });

  const fincasQueries = useQueries({
    queries: clientes.map((cliente) => ({
      queryKey: ['fincas', cliente.id],
      queryFn: () => fetchFincas(cliente.id),
      enabled: !!cliente.id,
    })),
  });

  const fincas = useMemo(
    () => [
      ...clientes.flatMap((cliente) => cliente.fincas ?? []),
      ...fincasQueries.flatMap((query) => (query.data ?? []) as Finca[]),
    ],
    [clientes, fincasQueries]
  );

  const comisionistaPorId = useMemo(
    () => new Map(comisionistas.map((c) => [c.id, c])),
    [comisionistas]
  );
  const clientePorId = useMemo(
    () => new Map(clientes.map((c) => [c.id, c])),
    [clientes]
  );
  const productoPorId = useMemo(
    () => new Map(productos.map((p) => [p.id, p])),
    [productos]
  );
  const fincaPorId = useMemo(
    () => new Map(fincas.map((f) => [f.id, f])),
    [fincas]
  );

  const nombreComisionista = (id: string) => comisionistaPorId.get(id)?.nombre || 'Comisionista no encontrado';
  const nombreCliente = (id: string) => clientePorId.get(id)?.nombre || 'Cliente no encontrado';
  const nombreProducto = (id: string) => productoPorId.get(id)?.nombre || 'Producto no encontrado';
  const nombreFinca = (id?: string) => {
    if (!id) return 'Todas las fincas';
    return fincaPorId.get(id)?.nombre || 'Finca no encontrada';
  };

  const getComisionistaTarifa = (t: TarifaClienteProducto) =>
    nombreRelacion(t.comisionista) || nombreComisionista(t.comisionistaId);
  const getClienteTarifa = (t: TarifaClienteProducto) =>
    nombreRelacion(t.cliente) || nombreCliente(t.clienteId);
  const getProductoTarifa = (t: TarifaClienteProducto) =>
    nombreRelacion(t.producto) || nombreProducto(t.productoId);
  const getFincaTarifa = (t: TarifaClienteProducto) =>
    nombreRelacion(t.finca) || nombreFinca(t.fincaId);

  const filtered = tarifasClienteProducto.filter((t) => {
    const textoBusqueda = [
      getComisionistaTarifa(t),
      getClienteTarifa(t),
      getProductoTarifa(t),
      getFincaTarifa(t),
    ].join(' ').toLowerCase();

    const matchSearch =
      search === '' ||
      textoBusqueda.includes(search.toLowerCase());

    const matchComisionista = filtroComisionista === 'todos' || t.comisionistaId === filtroComisionista;
    const matchCliente = filtroCliente === 'todos' || t.clienteId === filtroCliente;
    const matchProducto = filtroProducto === 'todos' || t.productoId === filtroProducto;
    const matchFinca =
      filtroFinca === 'todas' ||
      t.fincaId === filtroFinca ||
      (filtroFinca === 'ninguna' && !t.fincaId);

    return matchSearch && matchComisionista && matchCliente && matchProducto && matchFinca;
  });

  const resetForm = () => {
    setForm({
      comisionistaId: '',
      clienteId: '',
      productoId: '',
      fincaId: '',
      tipo: 'porcentaje',
      valor: '',
      activo: true,
    });
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.comisionistaId) {
      toast.error('Selecciona un comisionista');
      return;
    }
    if (!form.clienteId) {
      toast.error('Selecciona un cliente');
      return;
    }
    if (!form.productoId) {
      toast.error('Selecciona un producto');
      return;
    }
    if (!form.valor || parseFloat(form.valor) <= 0) {
      toast.error('Ingresa un valor válido');
      return;
    }

    const payload = {
      comisionistaId: form.comisionistaId,
      clienteId: form.clienteId,
      productoId: form.productoId,
      fincaId: form.fincaId || undefined,
      tipo: form.tipo,
      valor: parseFloat(form.valor),
      activo: form.activo,
    };

    if (editing) {
      updateTarifa(editing.id, payload);
    } else {
      addTarifa(payload);
    }
    resetForm();
    setOpen(false);
  };

  const handleEdit = (t: TarifaClienteProducto) => {
    setEditing(t);
    setForm({
      comisionistaId: t.comisionistaId,
      clienteId: t.clienteId,
      productoId: t.productoId,
      fincaId: t.fincaId || '',
      tipo: t.tipo,
      valor: t.valor.toString(),
      activo: t.activo,
    });
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar esta tarifa?')) {
      deleteTarifa(id);
    }
  };

  const handleImportarExcel = () => {
    toast.info('Función disponible en backend');
  };

  const formatValor = (t: TarifaClienteProducto) => {
    const valor = typeof t.valor === 'string' ? parseFloat(t.valor) : t.valor;
    if (t.tipo === 'porcentaje') {
      return `${valor}%`;
    }
    return `$${valor.toFixed(3)}/kg`;
  };

  const clienteSeleccionado = clientes.find((c) => c.id === form.clienteId);
  const mostrarFincaEnForm = clienteSeleccionado?.tipo === 'grupo';
  const etiquetaFiltroComisionista =
    filtroComisionista === 'todos' ? 'Todos los comisionistas' : nombreComisionista(filtroComisionista);
  const etiquetaFiltroCliente = filtroCliente === 'todos' ? 'Todos los clientes' : nombreCliente(filtroCliente);
  const etiquetaFiltroProducto = filtroProducto === 'todos' ? 'Todos los productos' : nombreProducto(filtroProducto);
  const etiquetaFiltroFinca =
    filtroFinca === 'todas' ? 'Todas las fincas' : filtroFinca === 'ninguna' ? 'Sin finca' : nombreFinca(filtroFinca);
  const etiquetaFormComisionista = form.comisionistaId
    ? nombreComisionista(form.comisionistaId)
    : 'Selecciona un comisionista';
  const etiquetaFormCliente = form.clienteId ? nombreCliente(form.clienteId) : 'Selecciona un cliente';
  const etiquetaFormProducto = form.productoId ? nombreProducto(form.productoId) : 'Selecciona un producto';
  const etiquetaFormTipo = form.tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Fijo por kg (USD)';

  return (
    <div className="space-y-6">
      {/* Filtros y acciones */}
      <Card className="rounded-2xl border-slate-200">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar tarifa..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                />
              </div>

              <Select value={filtroComisionista} onValueChange={(v) => setFiltroComisionista(v ?? 'todos')}>
                <SelectTrigger className="w-48 rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">{etiquetaFiltroComisionista}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los comisionistas</SelectItem>
                  {comisionistas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filtroCliente} onValueChange={(v) => { setFiltroCliente(v ?? 'todos'); setFiltroFinca('todas'); }}>
                <SelectTrigger className="w-48 rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">{etiquetaFiltroCliente}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los clientes</SelectItem>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filtroProducto} onValueChange={(v) => setFiltroProducto(v ?? 'todos')}>
                <SelectTrigger className="w-48 rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">{etiquetaFiltroProducto}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los productos</SelectItem>
                  {productos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filtroFinca} onValueChange={(v) => setFiltroFinca(v ?? 'todas')}>
                <SelectTrigger className="w-48 rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">{etiquetaFiltroFinca}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las fincas</SelectItem>
                  <SelectItem value="ninguna">Sin finca</SelectItem>
                  {fincasFiltro.map((f: Finca) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleImportarExcel}
                className="rounded-xl border-slate-200 text-slate-600"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Importar desde Excel
              </Button>
              <Button
                onClick={() => {
                  resetForm();
                  setOpen(true);
                }}
                className="btn-primary-dark rounded-xl"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nueva Tarifa
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Tarifa' : 'Nueva Tarifa'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="comisionista">Comisionista</Label>
              <Select
                value={form.comisionistaId}
                onValueChange={(value) => setForm({ ...form, comisionistaId: value ?? '' })}
              >
                <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">{etiquetaFormComisionista}</span>
                </SelectTrigger>
                <SelectContent>
                  {comisionistas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cliente">Cliente</Label>
              <Select
                value={form.clienteId}
                onValueChange={(value) => setForm({ ...form, clienteId: value ?? '', fincaId: '' })}
              >
                <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">{etiquetaFormCliente}</span>
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="producto">Producto</Label>
              <Select
                value={form.productoId}
                onValueChange={(value) => setForm({ ...form, productoId: value ?? '' })}
              >
                <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">{etiquetaFormProducto}</span>
                </SelectTrigger>
                <SelectContent>
                  {productos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mostrarFincaEnForm && form.clienteId && (
              <FincaSelect
                clienteId={form.clienteId}
                value={form.fincaId}
                onChange={(value) => setForm({ ...form, fincaId: value })}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(value) => setForm({ ...form, tipo: value as 'porcentaje' | 'fijo_kg' })}
                >
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <span className="flex flex-1 truncate text-left">{etiquetaFormTipo}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                    <SelectItem value="fijo_kg">Fijo por kg (USD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor">Valor</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  placeholder={form.tipo === 'porcentaje' ? 'Ej: 2.5' : 'Ej: 0.05'}
                  className="bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="activo"
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <Label htmlFor="activo" className="text-sm font-normal cursor-pointer">
                Tarifa activa
              </Label>
            </div>

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
                {editing ? 'Guardar Cambios' : 'Crear Tarifa'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
          <Percent className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700">No hay tarifas</h3>
          <p className="text-sm text-slate-500 mt-1">Crea tu primera tarifa para comenzar</p>
        </div>
      ) : (
        <Card className="rounded-2xl border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="text-slate-500 font-medium">Comisionista</TableHead>
                  <TableHead className="text-slate-500 font-medium">Cliente</TableHead>
                  <TableHead className="text-slate-500 font-medium">Finca</TableHead>
                  <TableHead className="text-slate-500 font-medium">Producto</TableHead>
                  <TableHead className="text-slate-500 font-medium">Tipo</TableHead>
                  <TableHead className="text-slate-500 font-medium">Valor</TableHead>
                  <TableHead className="text-slate-500 font-medium">Estado</TableHead>
                  <TableHead className="text-slate-500 font-medium text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} className="border-slate-100">
                    <TableCell className="font-medium text-slate-900">
                      {getComisionistaTarifa(t)}
                    </TableCell>
                    <TableCell className="text-slate-700">{getClienteTarifa(t)}</TableCell>
                    <TableCell className="text-slate-700">{getFincaTarifa(t)}</TableCell>
                    <TableCell className="text-slate-700">{getProductoTarifa(t)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="flex items-center gap-1 bg-slate-100 text-slate-700 border-0 w-fit"
                      >
                        {t.tipo === 'porcentaje' ? (
                          <Percent className="h-3 w-3" />
                        ) : (
                          <Weight className="h-3 w-3" />
                        )}
                        {t.tipo === 'porcentaje' ? 'Porcentaje' : 'Fijo/kg'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-900 font-medium">{formatValor(t)}</TableCell>
                    <TableCell>
                      {t.activo ? (
                        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-0">
                          Activa
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 border-0">
                          Inactiva
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                          onClick={() => handleEdit(t)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          onClick={() => handleDelete(t.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
