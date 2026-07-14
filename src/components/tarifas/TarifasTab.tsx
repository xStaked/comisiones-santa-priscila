'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Percent, Weight, Search, FileSpreadsheet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { useApp } from '@/context/AppContext';
import { TarifaClienteProducto, Finca, Proveedor } from '@/types';
import { fetchProveedores } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  fincas,
  value,
  onChange,
}: {
  fincas: Finca[];
  value: string;
  onChange: (value: string) => void;
}) {
  const fincaSeleccionada = fincas.find((f: Finca) => f.id === value);
  const etiqueta = value ? fincaSeleccionada?.nombre || 'Sector no encontrado' : 'Todos los sectores del cliente';

  return (
    <div className="space-y-2">
      <Label htmlFor="finca">Sector (opcional)</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
          <span className="flex flex-1 truncate text-left">{etiqueta}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Todos los sectores del cliente</SelectItem>
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
    updateTarifasMasivo,
    deleteTarifa,
  } = useApp();

  const [search, setSearch] = useState('');
  const [filtroComisionista, setFiltroComisionista] = useState<string>('todos');
  const [filtroCliente, setFiltroCliente] = useState<string>('todos');
  const [filtroProducto, setFiltroProducto] = useState<string>('todos');
  const [filtroFinca, setFiltroFinca] = useState<string>('todas');

  const [editing, setEditing] = useState<TarifaClienteProducto | null>(null);
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tarifaToDelete, setTarifaToDelete] = useState<TarifaClienteProducto | null>(null);
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState<string[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<{ tipo: string; valor: string; activo: string }>({
    tipo: 'sin_cambio',
    valor: '',
    activo: 'sin_cambio',
  });

  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: fetchProveedores,
  });

  const [form, setForm] = useState<{
    comisionistaId: string;
    clienteId: string;
    productoId: string;
    fincaId: string;
    proveedor: string;
    tipo: 'porcentaje' | 'fijo_kg' | 'fijo_unidad';
    valor: string;
    activo: boolean;
    umbralKg: string;
    valorSobreUmbral: string;
    vigenteHasta: string;
  }>({
    comisionistaId: '',
    clienteId: '',
    productoId: '',
    fincaId: '',
    proveedor: '',
    tipo: 'porcentaje',
    valor: '',
    activo: true,
    umbralKg: '',
    valorSobreUmbral: '',
    vigenteHasta: '',
  });

  // Los clientes ya vienen con sus sectores (selectinload en el backend)
  const fincasPorCliente = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.fincas ?? []])),
    [clientes]
  );

  const fincasFiltro = fincasPorCliente.get(filtroCliente) ?? [];

  const fincas = useMemo(
    () => clientes.flatMap((cliente) => cliente.fincas ?? []),
    [clientes]
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
    if (!id) return 'Todos los sectores';
    return fincaPorId.get(id)?.nombre || 'Sector no encontrado';
  };

  const getComisionistaTarifa = (t: TarifaClienteProducto) =>
    nombreRelacion(t.comisionista) || nombreComisionista(t.comisionistaId);
  const getClienteTarifa = (t: TarifaClienteProducto) =>
    nombreRelacion(t.cliente) || nombreCliente(t.clienteId);
  const getProductoTarifa = (t: TarifaClienteProducto) =>
    nombreRelacion(t.producto) || nombreProducto(t.productoId);
  const getFincaTarifa = (t: TarifaClienteProducto) =>
    nombreRelacion(t.finca) || nombreFinca(t.fincaId);
  const getProveedorTarifa = (t: TarifaClienteProducto) =>
    t.proveedor || 'Cualquier proveedor';
  const getExcluidosTarifa = (t: TarifaClienteProducto) =>
    (t.proveedoresExcluidos || []).join(', ');

  const filtered = tarifasClienteProducto.filter((t) => {
    const textoBusqueda = [
      getComisionistaTarifa(t),
      getClienteTarifa(t),
      getProductoTarifa(t),
      getFincaTarifa(t),
      getProveedorTarifa(t),
      getExcluidosTarifa(t),
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
      proveedor: '',
      tipo: 'porcentaje',
      valor: '',
      activo: true,
      umbralKg: '',
      valorSobreUmbral: '',
      vigenteHasta: '',
    });
    setProveedoresSeleccionados([]);
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
      proveedor: form.proveedor || '',
      proveedoresExcluidos: proveedoresSeleccionados,
      tipo: form.tipo,
      valor: parseFloat(form.valor),
      activo: form.activo,
      umbralKg: form.umbralKg ? parseFloat(form.umbralKg) : undefined,
      valorSobreUmbral: form.valorSobreUmbral ? parseFloat(form.valorSobreUmbral) : undefined,
      vigenteHasta: form.vigenteHasta || undefined,
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
      proveedor: t.proveedor || '',
      tipo: t.tipo,
      valor: t.valor.toString(),
      activo: t.activo,
      umbralKg: t.umbralKg?.toString() || '',
      valorSobreUmbral: t.valorSobreUmbral?.toString() || '',
      vigenteHasta: t.vigenteHasta?.slice(0, 10) || '',
    });
    setProveedoresSeleccionados(t.proveedoresExcluidos || []);
    setOpen(true);
  };

  const handleDelete = (t: TarifaClienteProducto) => {
    setTarifaToDelete(t);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (tarifaToDelete) {
      deleteTarifa(tarifaToDelete.id);
    }
    setDeleteConfirmOpen(false);
    setTarifaToDelete(null);
  };

  const toggleSeleccion = (id: string) => setSeleccionadas(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const todasFiltradasSeleccionadas = filtered.length > 0 && filtered.every(t => seleccionadas.has(t.id));
  const toggleSeleccionTodas = () => {
    setSeleccionadas(todasFiltradasSeleccionadas ? new Set() : new Set(filtered.map(t => t.id)));
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cambios: { tipo?: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor?: number; activo?: boolean } = {};
    if (bulkForm.tipo !== 'sin_cambio') cambios.tipo = bulkForm.tipo as 'porcentaje' | 'fijo_kg' | 'fijo_unidad';
    if (bulkForm.valor !== '' && parseFloat(bulkForm.valor) > 0) cambios.valor = parseFloat(bulkForm.valor);
    if (bulkForm.activo !== 'sin_cambio') cambios.activo = bulkForm.activo === 'activa';
    if (Object.keys(cambios).length === 0) {
      toast.error('Indica al menos un cambio');
      return;
    }
    updateTarifasMasivo(Array.from(seleccionadas), cambios)
      .then(() => setSeleccionadas(new Set()))
      .catch(() => {});
    setBulkForm({ tipo: 'sin_cambio', valor: '', activo: 'sin_cambio' });
    setBulkOpen(false);
  };

  const handleImportarExcel = () => {
    toast.info('Función disponible en backend');
  };

  const handleExportarExcel = () => {
    if (filtered.length === 0) {
      toast.error('No hay tarifas para exportar');
      return;
    }

    const data = filtered.map((t) => ({
      Comisionista: getComisionistaTarifa(t),
      Cliente: getClienteTarifa(t),
      Sector: getFincaTarifa(t),
      Producto: getProductoTarifa(t),
      Proveedor: getProveedorTarifa(t),
      'Proveedores excluidos': getExcluidosTarifa(t) || '-',
      Tipo: t.tipo === 'porcentaje' ? 'Porcentaje' : t.tipo === 'fijo_kg' ? 'Fijo/kg' : 'Fijo/unidad',
      Valor: formatValor(t),
      Estado: t.activo ? 'Activa' : 'Inactiva',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tarifas');
    XLSX.writeFile(wb, 'Tarifas.xlsx');
  };

  const formatValor = (t: TarifaClienteProducto) => {
    const valor = typeof t.valor === 'string' ? parseFloat(t.valor) : t.valor;
    if (t.tipo === 'porcentaje') {
      return `${valor}%`;
    }
    if (t.tipo === 'fijo_kg') {
      return `$${valor.toFixed(3)}/kg`;
    }
    return `$${valor.toFixed(3)}/unidad`;
  };

  const clienteSeleccionado = clientes.find((c) => c.id === form.clienteId);
  const mostrarFincaEnForm = clienteSeleccionado?.tipo === 'grupo';
  const etiquetaFiltroComisionista =
    filtroComisionista === 'todos' ? 'Todos los comisionistas' : nombreComisionista(filtroComisionista);
  const etiquetaFiltroCliente = filtroCliente === 'todos' ? 'Todos los clientes' : nombreCliente(filtroCliente);
  const etiquetaFiltroProducto = filtroProducto === 'todos' ? 'Todos los productos' : nombreProducto(filtroProducto);
  const etiquetaFiltroFinca =
    filtroFinca === 'todas' ? 'Todos los sectores' : filtroFinca === 'ninguna' ? 'Sin sector' : nombreFinca(filtroFinca);
  const etiquetaFormComisionista = form.comisionistaId
    ? nombreComisionista(form.comisionistaId)
    : 'Selecciona un comisionista';
  const etiquetaFormCliente = form.clienteId ? nombreCliente(form.clienteId) : 'Selecciona un cliente';
  const etiquetaFormProducto = form.productoId ? nombreProducto(form.productoId) : 'Selecciona un producto';
  const etiquetaFormTipo = form.tipo === 'porcentaje' ? 'Porcentaje (%)' : form.tipo === 'fijo_kg' ? 'Fijo por kg (USD)' : 'Fijo por unidad (USD)';

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
                  <SelectItem value="todas">Todos los sectores</SelectItem>
                  <SelectItem value="ninguna">Sin sector</SelectItem>
                  {fincasFiltro.map((f: Finca) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              {seleccionadas.size > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setBulkOpen(true)}
                  className="rounded-xl border-slate-200 text-slate-600"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar seleccionadas ({seleccionadas.size})
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleExportarExcel}
                className="rounded-xl border-slate-200 text-slate-600"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />
                Exportar Excel
              </Button>
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
                fincas={fincasPorCliente.get(form.clienteId) ?? []}
                value={form.fincaId}
                onChange={(value) => setForm({ ...form, fincaId: value })}
              />
            )}

            <div className="space-y-2">
              <Label htmlFor="proveedor">Proveedor (opcional)</Label>
              <Input
                id="proveedor"
                type="text"
                value={form.proveedor}
                onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                placeholder="Ej: INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR"
                className="bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
              />
              <p className="text-xs text-slate-500">
                Dejar en blanco para aplicar a cualquier proveedor.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Proveedores excluidos</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
                {proveedores.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={proveedoresSeleccionados.includes(p.nombre)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setProveedoresSeleccionados([...proveedoresSeleccionados, p.nombre]);
                        } else {
                          setProveedoresSeleccionados(proveedoresSeleccionados.filter((n) => n !== p.nombre));
                        }
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-slate-700">{p.nombre}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Estos proveedores no cobrarán comisión con esta tarifa.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(value) => setForm({ ...form, tipo: value as 'porcentaje' | 'fijo_kg' | 'fijo_unidad' })}
                >
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <span className="flex flex-1 truncate text-left">{etiquetaFormTipo}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                    <SelectItem value="fijo_kg">Fijo por kg (USD)</SelectItem>
                    <SelectItem value="fijo_unidad">Fijo por unidad (USD)</SelectItem>
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
                  placeholder={form.tipo === 'porcentaje' ? 'Ej: 2.5' : form.tipo === 'fijo_kg' ? 'Ej: 0.05' : 'Ej: 1.00'}
                  className="bg-white border-slate-200 rounded-xl focus:border-slate-900 focus:ring-slate-900/10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="umbralKg">Umbral (kg, opcional)</Label>
                <Input
                  id="umbralKg"
                  type="number"
                  step="1"
                  min="0"
                  value={form.umbralKg}
                  onChange={(e) => setForm({ ...form, umbralKg: e.target.value })}
                  placeholder="Ej: 1000"
                  className="bg-white border-slate-200 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valorSobreUmbral">Valor sobre umbral ($/kg)</Label>
                <Input
                  id="valorSobreUmbral"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valorSobreUmbral}
                  onChange={(e) => setForm({ ...form, valorSobreUmbral: e.target.value })}
                  placeholder="Ej: 3.50"
                  className="bg-white border-slate-200 rounded-xl"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Si el comisionista acumula el umbral en kg dentro de una liquidación, toda su comisión se paga a $/kg con el valor sobre umbral.
            </p>

            <div className="space-y-2">
              <Label htmlFor="vigenteHasta">Vigente hasta (opcional)</Label>
              <Input
                id="vigenteHasta"
                type="date"
                value={form.vigenteHasta}
                onChange={(e) => setForm({ ...form, vigenteHasta: e.target.value })}
                className="bg-white border-slate-200 rounded-xl"
              />
              <p className="text-xs text-slate-500">
                Déjalo vacío si la tarifa no caduca. Con fecha, solo se aplica a órdenes hasta ese día
                inclusive; las posteriores no la usan (las ya liquidadas no cambian).
              </p>
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

      {/* Dialog de confirmación para eliminar */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle>¿Eliminar tarifa?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la tarifa de{' '}
              <span className="font-medium text-slate-900">
                {tarifaToDelete ? getComisionistaTarifa(tarifaToDelete) : ''}
              </span>{' '}
              para el producto{' '}
              <span className="font-medium text-slate-900">
                {tarifaToDelete ? getProductoTarifa(tarifaToDelete) : ''}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setTarifaToDelete(null);
              }}
              className="rounded-xl border-slate-200"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              className="rounded-xl"
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de edición masiva */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle>Editar {seleccionadas.size} tarifas</DialogTitle>
            <DialogDescription>
              Solo se aplican los campos que cambies; el resto queda igual.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={bulkForm.tipo} onValueChange={(v) => setBulkForm({ ...bulkForm, tipo: v ?? 'sin_cambio' })}>
                <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">
                    {bulkForm.tipo === 'sin_cambio' ? 'Sin cambio' : bulkForm.tipo === 'porcentaje' ? 'Porcentaje (%)' : bulkForm.tipo === 'fijo_kg' ? 'Fijo por kg (USD)' : 'Fijo por unidad (USD)'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin_cambio">Sin cambio</SelectItem>
                  <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
                  <SelectItem value="fijo_kg">Fijo por kg (USD)</SelectItem>
                  <SelectItem value="fijo_unidad">Fijo por unidad (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor (vacío = sin cambio)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={bulkForm.valor}
                onChange={(e) => setBulkForm({ ...bulkForm, valor: e.target.value })}
                className="bg-white border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={bulkForm.activo} onValueChange={(v) => setBulkForm({ ...bulkForm, activo: v ?? 'sin_cambio' })}>
                <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                  <span className="flex flex-1 truncate text-left">
                    {bulkForm.activo === 'sin_cambio' ? 'Sin cambio' : bulkForm.activo === 'activa' ? 'Activa' : 'Inactiva'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin_cambio">Sin cambio</SelectItem>
                  <SelectItem value="activa">Activa</SelectItem>
                  <SelectItem value="inactiva">Inactiva</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setBulkOpen(false)} className="rounded-xl border-slate-200">
                Cancelar
              </Button>
              <Button type="submit" className="btn-primary-dark rounded-xl">
                Aplicar a {seleccionadas.size} tarifas
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
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-emerald-600"
                      checked={todasFiltradasSeleccionadas}
                      onChange={toggleSeleccionTodas}
                      aria-label="Seleccionar todas las tarifas"
                    />
                  </TableHead>
                  <TableHead className="text-slate-500 font-medium">Comisionista</TableHead>
                  <TableHead className="text-slate-500 font-medium">Cliente</TableHead>
                  <TableHead className="text-slate-500 font-medium">Sector</TableHead>
                  <TableHead className="text-slate-500 font-medium">Producto</TableHead>
                  <TableHead className="text-slate-500 font-medium">Proveedor</TableHead>
                  <TableHead className="text-slate-500 font-medium">Excluidos</TableHead>
                  <TableHead className="text-slate-500 font-medium">Tipo</TableHead>
                  <TableHead className="text-slate-500 font-medium">Valor</TableHead>
                  <TableHead className="text-slate-500 font-medium">Estado</TableHead>
                  <TableHead className="text-slate-500 font-medium text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} className="border-slate-100">
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-emerald-600"
                        checked={seleccionadas.has(t.id)}
                        onChange={() => toggleSeleccion(t.id)}
                        aria-label={`Seleccionar tarifa de ${getComisionistaTarifa(t)}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {getComisionistaTarifa(t)}
                    </TableCell>
                    <TableCell className="text-slate-700">{getClienteTarifa(t)}</TableCell>
                    <TableCell className="text-slate-700">{getFincaTarifa(t)}</TableCell>
                    <TableCell className="text-slate-700">{getProductoTarifa(t)}</TableCell>
                    <TableCell className="text-slate-700 text-xs max-w-[180px] truncate" title={getProveedorTarifa(t)}>
                      {getProveedorTarifa(t)}
                    </TableCell>
                    <TableCell className="text-slate-700 text-xs max-w-[180px] truncate" title={(t.proveedoresExcluidos || []).join(', ')}>
                      {(t.proveedoresExcluidos || []).join(', ') || '—'}
                    </TableCell>
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
                        {t.tipo === 'porcentaje' ? 'Porcentaje' : t.tipo === 'fijo_kg' ? 'Fijo/kg' : 'Fijo/unidad'}
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
                          onClick={() => handleDelete(t)}
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
