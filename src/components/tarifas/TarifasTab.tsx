'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Percent, FileSpreadsheet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { useApp } from '@/context/AppContext';
import { TarifaClienteProducto, Finca, Proveedor } from '@/types';
import { fetchProveedores } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  BarraAcciones,
  BotonPrimario,
  BotonSecundario,
  Buscador,
  Chip,
  Panel,
  Vacio,
  num,
} from '@/components/ui/dc';
import { toast } from 'sonner';

const COLS =
  'grid-cols-[34px_minmax(0,1.15fr)_minmax(0,1.25fr)_minmax(0,1.3fr)_minmax(0,1fr)_120px_minmax(0,1.1fr)_100px_80px]';

/** "Regla escalonada" del prototipo: el umbral en kg y el valor sobre umbral. */
function reglaEscalonada(t: TarifaClienteProducto): { texto: string; conRegla: boolean } {
  const umbral = t.umbralKg ? Number(t.umbralKg) : 0;
  const sobre = t.valorSobreUmbral ? Number(t.valorSobreUmbral) : 0;
  if (!umbral || !sobre) return { texto: 'Sin umbral', conRegla: false };
  const base = Number(t.valor);
  return {
    texto: `Hasta ${num(umbral, 0)} kg → $${num(base, 2)} · sobre → $${num(sobre, 2)}`,
    conRegla: true,
  };
}

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
        <SelectTrigger className="h-10 w-full rounded-xl">
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
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
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

  const filtrosActivos =
    (filtroComisionista !== 'todos' ? 1 : 0) +
    (filtroCliente !== 'todos' ? 1 : 0) +
    (filtroProducto !== 'todos' ? 1 : 0) +
    (filtroFinca !== 'todas' ? 1 : 0);

  // Vista previa "Así se va a pagar" del prototipo, con el ejemplo calculado en vivo.
  const unidadValor = form.tipo === 'porcentaje' ? '%' : form.tipo === 'fijo_kg' ? '/kg' : '/unidad';
  const valorNum = parseFloat(form.valor) || 0;
  const umbralNum = parseFloat(form.umbralKg) || 0;
  const sobreNum = parseFloat(form.valorSobreUmbral) || 0;
  const hayEscalon = umbralNum > 0 && sobreNum > 0 && form.tipo !== 'porcentaje';
  const kgEjemplo = hayEscalon ? Math.round(umbralNum * 1.25) : 0;
  // Sobre el umbral toda la comisión pasa al valor reducido (ver calcularComisionPorTarifa).
  const comisionEjemplo = hayEscalon ? kgEjemplo * sobreNum : 0;

  return (
    <div className="flex max-w-[1360px] flex-col gap-3.5">
      {/* Filtros y acciones */}
      <BarraAcciones>
        <Buscador value={search} onChange={setSearch} placeholder="Buscar tarifa…" className="w-full sm:w-[280px]" />
        <BotonSecundario onClick={() => setFiltrosAbiertos((v) => !v)}>
          Filtros
          {filtrosActivos > 0 && (
            <span className="cifra rounded-full bg-[#0B1220] px-1.5 py-px text-[10.5px] text-white">
              {filtrosActivos}
            </span>
          )}
        </BotonSecundario>
        {seleccionadas.size > 0 && (
          <BotonSecundario onClick={() => setBulkOpen(true)}>
            <Pencil className="size-3.5" /> Editar {seleccionadas.size} seleccionadas
          </BotonSecundario>
        )}
        <div className="flex-1" />
        <BotonSecundario onClick={handleExportarExcel}>
          <FileSpreadsheet className="size-3.5 text-primary" /> Exportar Excel
        </BotonSecundario>
        <BotonSecundario onClick={handleImportarExcel}>Importar Excel</BotonSecundario>
        <BotonPrimario
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          <Plus className="size-3.5" /> Nueva tarifa
        </BotonPrimario>
      </BarraAcciones>

      {filtrosAbiertos && (
        <Panel className="flex flex-wrap items-center gap-2.5 p-3.5">
          <Select value={filtroComisionista} onValueChange={(v) => setFiltroComisionista(v ?? 'todos')}>
            <SelectTrigger className="h-9 w-52 rounded-[9px]">
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

          <Select
            value={filtroCliente}
            onValueChange={(v) => {
              setFiltroCliente(v ?? 'todos');
              setFiltroFinca('todas');
            }}
          >
            <SelectTrigger className="h-9 w-52 rounded-[9px]">
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
            <SelectTrigger className="h-9 w-52 rounded-[9px]">
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
            <SelectTrigger className="h-9 w-52 rounded-[9px]">
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

          {filtrosActivos > 0 && (
            <button
              type="button"
              onClick={() => {
                setFiltroComisionista('todos');
                setFiltroCliente('todos');
                setFiltroProducto('todos');
                setFiltroFinca('todas');
              }}
              className="text-xs text-[#7A8798] underline"
            >
              Limpiar
            </button>
          )}
        </Panel>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[660px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar tarifa' : 'Nueva tarifa'}</DialogTitle>
            <DialogDescription>
              Dos pasos: a quién aplica y cuánto se paga.
            </DialogDescription>
          </DialogHeader>

          {/* Cabecera de pasos del prototipo */}
          <div className="mt-1 flex items-center gap-2.5">
            {[
              { n: '1', titulo: 'A quién aplica', sub: 'Comisionista, cliente, producto', on: true },
              { n: '2', titulo: 'Cuánto se paga', sub: 'Tipo, valor y umbral', on: valorNum > 0 },
            ].map((p) => (
              <div
                key={p.n}
                className={`flex flex-1 items-center gap-2.5 rounded-[10px] border px-3 py-2.5 ${
                  p.on ? 'border-[#CFE3E0] bg-[#F7FBFA]' : 'border-border bg-white'
                }`}
              >
                <span
                  className={`cifra flex size-[22px] items-center justify-center rounded-full text-[11px] font-semibold ${
                    p.on ? 'bg-primary text-white' : 'bg-[#F0F2F5] text-[#6B7684]'
                  }`}
                >
                  {p.n}
                </span>
                <div className="min-w-0">
                  <div
                    className="truncate text-[12.5px] font-semibold"
                    style={{ color: p.on ? '#0B1220' : '#6B7684' }}
                  >
                    {p.titulo}
                  </div>
                  <div className="truncate text-[11px] text-[#8B96A5]">{p.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="comisionista">Comisionista</Label>
              <Select
                value={form.comisionistaId}
                onValueChange={(value) => setForm({ ...form, comisionistaId: value ?? '' })}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
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
                <SelectTrigger className="h-10 w-full rounded-xl">
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
                <SelectTrigger className="h-10 w-full rounded-xl">
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
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Dejar en blanco para aplicar a cualquier proveedor.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Proveedores excluidos</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto rounded-xl border border-border bg-white p-3">
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
                      className="h-4 w-4 rounded border-[#C6CDD6] text-[#0B1220] focus:ring-slate-900"
                    />
                    <span className="text-[#344054]">{p.nombre}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
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
                  <SelectTrigger className="h-10 w-full rounded-xl">
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
                  step="0.0001"
                  min="0"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  placeholder={form.tipo === 'porcentaje' ? 'Ej: 2.5' : form.tipo === 'fijo_kg' ? 'Ej: 0.05' : 'Ej: 1.00'}
                  className="rounded-xl"
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
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valorSobreUmbral">Valor sobre umbral ($/kg)</Label>
                <Input
                  id="valorSobreUmbral"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.valorSobreUmbral}
                  onChange={(e) => setForm({ ...form, valorSobreUmbral: e.target.value })}
                  placeholder="Ej: 3.50"
                  className="rounded-xl"
                />
              </div>
            </div>
            {/* "Así se va a pagar": vista previa en vivo del prototipo */}
            <div className="rounded-[11px] bg-[#0B1220] px-[17px] py-4">
              <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#8394AA]">
                Así se va a pagar
              </div>
              {valorNum <= 0 ? (
                <div className="text-xs text-[#8394AA]">
                  Ingresa un valor para ver cómo queda la regla.
                </div>
              ) : hayEscalon ? (
                <>
                  <div className="cifra flex flex-wrap items-center gap-3 text-[13px] text-[#D6DEE8]">
                    <span>
                      Hasta{' '}
                      <span className="font-semibold text-white">{num(umbralNum, 0)} kg</span> →{' '}
                      <span className="font-semibold text-[#5EEAD4]">
                        ${num(valorNum, 2)}
                        {unidadValor}
                      </span>
                    </span>
                    <span className="text-[#4E5C70]">·</span>
                    <span>
                      Desde{' '}
                      <span className="font-semibold text-white">{num(umbralNum, 0)} kg</span> →{' '}
                      <span className="font-semibold text-[#5EEAD4]">
                        ${num(sobreNum, 2)}
                        {unidadValor}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2.5 text-xs leading-[1.45] text-[#8394AA]">
                    Al superar el umbral, <strong className="font-semibold text-[#B7C3D3]">toda</strong> la
                    comisión acumulada pasa al valor reducido: con {num(kgEjemplo, 0)} kg se pagarían{' '}
                    <span className="cifra text-white">${num(comisionEjemplo, 2)}</span>.
                  </div>
                </>
              ) : (
                <div className="cifra text-[13px] text-[#D6DEE8]">
                  Todo el volumen →{' '}
                  <span className="font-semibold text-[#5EEAD4]">
                    {form.tipo === 'porcentaje' ? `${num(valorNum, 2)} %` : `$${num(valorNum, 2)}${unidadValor}`}
                  </span>
                  <span className="ml-2 text-[#8394AA]">· sin umbral</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vigenteHasta">Vigente hasta (opcional)</Label>
              <Input
                id="vigenteHasta"
                type="date"
                value={form.vigenteHasta}
                onChange={(e) => setForm({ ...form, vigenteHasta: e.target.value })}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
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
                className="h-4 w-4 rounded border-[#C6CDD6] text-[#0B1220] focus:ring-slate-900"
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
                className="rounded-xl"
              >
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl">
                {editing ? 'Guardar Cambios' : 'Crear Tarifa'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación para eliminar */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar tarifa?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la tarifa de{' '}
              <span className="font-medium text-foreground">
                {tarifaToDelete ? getComisionistaTarifa(tarifaToDelete) : ''}
              </span>{' '}
              para el producto{' '}
              <span className="font-medium text-foreground">
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
              className="rounded-xl"
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
        <DialogContent className="sm:max-w-md">
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
                <SelectTrigger className="h-10 w-full rounded-xl">
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
                step="0.0001"
                min="0"
                value={bulkForm.valor}
                onChange={(e) => setBulkForm({ ...bulkForm, valor: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={bulkForm.activo} onValueChange={(v) => setBulkForm({ ...bulkForm, activo: v ?? 'sin_cambio' })}>
                <SelectTrigger className="h-10 w-full rounded-xl">
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
              <Button type="button" variant="outline" onClick={() => setBulkOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl">
                Aplicar a {seleccionadas.size} tarifas
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <Vacio
          icono={Percent}
          titulo={tarifasClienteProducto.length === 0 ? 'No hay tarifas' : 'Ninguna tarifa coincide'}
          nota={
            tarifasClienteProducto.length === 0
              ? 'Crea tu primera tarifa específica para comenzar.'
              : 'Ajusta la búsqueda o limpia los filtros.'
          }
        />
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <div className="min-w-[1180px]">
              <div className={`th-tabla grid ${COLS} items-center gap-2.5 border-b border-border bg-[#FAFBFC] px-4 py-2.5`}>
                <div>
                  <input
                    type="checkbox"
                    className="size-[15px] cursor-pointer accent-primary align-middle"
                    checked={todasFiltradasSeleccionadas}
                    onChange={toggleSeleccionTodas}
                    aria-label="Seleccionar todas las tarifas"
                  />
                </div>
                <div>Comisionista</div>
                <div>Cliente</div>
                <div>Producto</div>
                <div>Sector</div>
                <div className="text-right">Valor</div>
                <div>Regla escalonada</div>
                <div>Vigencia</div>
                <div className="text-right">Acciones</div>
              </div>

              {filtered.map((t) => {
                const regla = reglaEscalonada(t);
                const excluidos = (t.proveedoresExcluidos || []).join(', ');
                return (
                  <div
                    key={t.id}
                    className={`grid ${COLS} items-center gap-2.5 border-b border-[#F2F4F6] px-4 py-3 transition-colors hover:bg-[#FAFBFC] ${t.activo ? '' : 'opacity-60'}`}
                  >
                    <div>
                      <input
                        type="checkbox"
                        className="size-[15px] cursor-pointer accent-primary align-middle"
                        checked={seleccionadas.has(t.id)}
                        onChange={() => toggleSeleccion(t.id)}
                        aria-label={`Seleccionar tarifa de ${getComisionistaTarifa(t)}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-[#0B1220]">{getComisionistaTarifa(t)}</div>
                      {!t.activo && <Chip className="mt-0.5">Inactiva</Chip>}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] text-[#344054]">{getClienteTarifa(t)}</div>
                      {excluidos && (
                        <div className="truncate text-[11px] text-[#B45309]" title={excluidos}>
                          Excluye {(t.proveedoresExcluidos || []).length} razón(es)
                        </div>
                      )}
                    </div>
                    <div className="truncate text-[12.5px] text-[#344054]" title={getProductoTarifa(t)}>
                      {getProductoTarifa(t)}
                    </div>
                    <div className="truncate text-[12.5px] text-[#6B7684]">{getFincaTarifa(t)}</div>
                    <div className="text-right">
                      <span className="cifra rounded-md bg-[#F2F4F6] px-2 py-[3px] text-[12.5px] font-semibold text-[#0B1220]">
                        {formatValor(t)}
                      </span>
                    </div>
                    <div
                      className="truncate text-[11.5px] leading-[1.35]"
                      style={{ color: regla.conRegla ? '#0B5E56' : '#98A2B3' }}
                      title={regla.texto}
                    >
                      {regla.texto}
                    </div>
                    <div className="cifra text-[11.5px] text-[#6B7684]">
                      {t.vigenteHasta ? t.vigenteHasta.slice(0, 10) : 'Sin caducidad'}
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => handleEdit(t)}
                        className="inline-flex size-7 items-center justify-center rounded-[7px] border border-[#E0E4E9] bg-white text-[#98A2B3] transition hover:border-[#C6CDD6] hover:text-[#0B1220]"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        title="Eliminar"
                        onClick={() => handleDelete(t)}
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
