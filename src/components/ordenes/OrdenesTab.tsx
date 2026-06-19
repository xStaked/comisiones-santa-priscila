'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Upload, Trash2, Pencil, UserCheck, Calculator, FileUp, Check, X, Search, ChevronDown, ChevronRight, ChevronLeft, Filter, Calendar, ArrowUpDown } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { EstadoOrden, OrdenItem } from '@/types';
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
import { uploadPDF, uploadImage, fetchFincas } from '@/lib/api';
import { generarId } from '@/lib/id';
import { useQuery } from '@tanstack/react-query';
import { encontrarTarifaEspecifica } from '@/lib/export-utils';

const ESTADOS_ORDEN: { value: EstadoOrden; label: string; className: string }[] = [
  { value: 'pendiente', label: 'Pendiente', className: 'bg-slate-100 text-slate-700 border-0' },
  { value: 'parcialmente_pagada', label: 'Parcialmente pagada', className: 'bg-amber-100 text-amber-700 border-0' },
  { value: 'pagada', label: 'Pagada', className: 'bg-emerald-100 text-emerald-700 border-0' },
  { value: 'liquidada', label: 'Liquidada', className: 'bg-blue-100 text-blue-700 border-0' },
];

const ITEMS_PER_PAGE = 15;

function getEstadoOrdenMeta(estado?: string) {
  return ESTADOS_ORDEN.find((item) => item.value === estado) ?? ESTADOS_ORDEN[0];
}

function getEstadoOrdenAgrupada(items: OrdenItem[]): EstadoOrden {
  const estados = items.map((item) => item.estado || 'pendiente');
  const primero = estados[0] || 'pendiente';
  if (estados.every((estado) => estado === primero)) return primero;
  if (estados.includes('pagada')) return 'pagada';
  if (estados.includes('parcialmente_pagada')) return 'parcialmente_pagada';
  return 'pendiente';
}

function MultiSelectComisionistas({
  comisionistas,
  selectedIds,
  onChange,
  placeholder = 'Seleccionar comisionistas...',
  disabled = false,
}: {
  comisionistas: { id: string; nombre: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (id: string) => {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(sid => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedNames = selectedIds
    .map(id => comisionistas.find(c => c.id === id)?.nombre)
    .filter(Boolean) as string[];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full min-h-10 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 hover:border-slate-300 transition-colors disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span className={selectedIds.length === 0 ? 'text-slate-400' : ''}>
          {selectedIds.length === 0
            ? placeholder
            : (
              <span className="flex flex-wrap gap-1">
                {selectedNames.map((name, i) => (
                  <span key={selectedIds[i]} className="inline-flex items-center gap-0.5 bg-slate-100 px-1.5 py-0.5 rounded-md text-xs font-medium text-slate-700">
                    {name}
                    <button
                      type="button"
                      className="ml-0.5 hover:text-red-500"
                      onClick={(e) => { e.stopPropagation(); toggle(selectedIds[i]); }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </span>
            )
          }
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {comisionistas.map(c => (
            <label
              key={c.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(c.id)}
                disabled={disabled}
                onChange={() => toggle(c.id)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span className="text-slate-700">{c.nombre}</span>
            </label>
          ))}
          {comisionistas.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400">No hay comisionistas</div>
          )}
        </div>
      )}
    </div>
  );
}

function EditFincaSelect({ clienteId, value, onChange }: { clienteId: string; value: string; onChange: (id: string, nombre: string) => void }) {
  const { data: fincas } = useQuery({
    queryKey: ['fincas', clienteId],
    queryFn: () => fetchFincas(clienteId),
    enabled: !!clienteId,
  });
  return (
    <Select value={value} onValueChange={(v) => {
      const id = v ?? '';
      const f = (fincas || []).find((x: { id: string; nombre: string }) => x.id === id);
      onChange(id, f?.nombre || '');
    }}>
      <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
        <SelectValue placeholder="Seleccionar finca" />
      </SelectTrigger>
      <SelectContent>
        {(fincas || []).map((f: { id: string; nombre: string }) => (
          <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OrdenesTab() {
  const { comisionistas, ordenItems, addOrdenItems, updateOrdenItem, updateEstadoOrden, deleteOrdenItem, clearOrdenItems, assignComisionistasGlobal, clientes, productos, tarifasClienteProducto } = useApp();
  const [activeForm, setActiveForm] = useState<'manual' | 'pdf'>('manual');
  const [globalComisionistaIds, setGlobalComisionistaIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pdfPreview, setPdfPreview] = useState<{
    fileName: string;
    fecha: string;
    numeroOrden: string;
    proveedor: string;
    semana: string;
    items: OrdenItem[];
  } | null>(null);
  const [isProcessingPDF, setIsProcessingPDF] = useState(false);
  const [uploadType, setUploadType] = useState<'pdf' | 'imagen'>('pdf');
  const [pdfClienteId, setPdfClienteId] = useState<string>('');

  const initialFecha = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = useState({
    fecha: initialFecha,
    numeroOrden: '',
    finca: '',
    producto: '',
    cantidad: '',
    unidad: 'kg',
    precioUnitario: '',
    comisionistaIds: [] as string[],
    clienteId: '',
    fincaId: '',
    productoId: '',
  });

  const selectedCliente = clientes.find(c => c.id === form.clienteId);
  const { data: fincasCliente } = useQuery({
    queryKey: ['fincas', form.clienteId],
    queryFn: () => fetchFincas(form.clienteId),
    enabled: !!form.clienteId && selectedCliente?.tipo === 'grupo',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<OrdenItem>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedOrdenIds, setCollapsedOrdenIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterFechaDesde, setFilterFechaDesde] = useState('');
  const [filterFechaHasta, setFilterFechaHasta] = useState('');
  const [filterComisionistaId, setFilterComisionistaId] = useState<string>('todos');
  const [sortField, setSortField] = useState<'fecha' | 'total' | 'numeroOrden'>('numeroOrden');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  const toggleCollapse = (id: string) => {
    setCollapsedOrdenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setCollapsedOrdenIds(new Set());
  };

  const collapseAll = () => {
    setCollapsedOrdenIds(new Set(ordenesAgrupadas.map(o => o.id)));
  };

  const filteredOrdenItems = useMemo(() => {
    let items = ordenItems;
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(item =>
        item.producto.toLowerCase().includes(q) ||
        item.productoRel?.nombre.toLowerCase().includes(q) ||
        item.numeroOrden.toLowerCase().includes(q) ||
        item.finca.toLowerCase().includes(q) ||
        item.fincaRel?.nombre.toLowerCase().includes(q) ||
        item.cliente?.nombre.toLowerCase().includes(q) ||
        item.comisionistas.some(a => comisionistas.find(c => c.id === a.comisionistaId)?.nombre.toLowerCase().includes(q))
      );
    }
    if (filterFechaDesde) {
      items = items.filter(item => item.fecha >= filterFechaDesde);
    }
    if (filterFechaHasta) {
      items = items.filter(item => item.fecha <= filterFechaHasta);
    }
    if (filterEstado !== 'todos') {
      items = items.filter(item => (item.estado || 'pendiente') === filterEstado);
    }
    if (filterComisionistaId !== 'todos') {
      items = items.filter(item => item.comisionistas.some(a => a.comisionistaId === filterComisionistaId));
    }
    return items;
  }, [ordenItems, search, comisionistas, filterFechaDesde, filterFechaHasta, filterEstado, filterComisionistaId]);

  const ordenesAgrupadas = useMemo(() => {
    const map = new Map<string, {
      id: string;
      fecha: string;
      numeroOrden: string;
      cliente: string;
      fincas: string[];
      total: number;
      estado: EstadoOrden;
      comisionistaIds: string[];
      items: OrdenItem[];
    }>();

    filteredOrdenItems.forEach((item) => {
      const id = item.ordenId || `${item.fecha}-${item.numeroOrden}-${item.clienteId || ''}`;
      const existente = map.get(id);
      const finca = item.fincaRel?.nombre || item.finca;
      const comisionistaIds = item.comisionistas.map(a => a.comisionistaId);
      if (existente) {
        existente.total += item.total;
        existente.items.push(item);
        if (finca && !existente.fincas.includes(finca)) existente.fincas.push(finca);
        comisionistaIds.forEach((cid) => {
          if (!existente.comisionistaIds.includes(cid)) existente.comisionistaIds.push(cid);
        });
        existente.estado = getEstadoOrdenAgrupada(existente.items);
        return;
      }

      map.set(id, {
        id,
        fecha: item.fecha,
        numeroOrden: item.numeroOrden,
        cliente: item.cliente?.nombre || '-',
        fincas: finca ? [finca] : [],
        total: item.total,
        estado: item.estado || 'pendiente',
        comisionistaIds,
        items: [item],
      });
    });

    const extraerNumero = (s: string) => { const m = s.match(/\d+/); return m ? parseInt(m[0], 10) : NaN; };

    const result = Array.from(map.values());

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'fecha') cmp = a.fecha.localeCompare(b.fecha);
      else if (sortField === 'total') cmp = a.total - b.total;
      else if (sortField === 'numeroOrden') {
        const na = extraerNumero(a.numeroOrden);
        const nb = extraerNumero(b.numeroOrden);
        if (!isNaN(na) && !isNaN(nb)) cmp = na - nb;
        else cmp = a.numeroOrden.localeCompare(b.numeroOrden);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [filteredOrdenItems, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(ordenesAgrupadas.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedOrdenes = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return ordenesAgrupadas.slice(start, start + ITEMS_PER_PAGE);
  }, [ordenesAgrupadas, safePage]);

  const resetForm = () => {
    setForm({
      fecha: typeof window !== 'undefined' ? new Date().toISOString().slice(0, 10) : '',
      numeroOrden: '',
      finca: '',
      producto: '',
      cantidad: '',
      unidad: 'kg',
      precioUnitario: '',
      comisionistaIds: [],
      clienteId: '',
      fincaId: '',
      productoId: '',
    });
  };

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    const cantidad = parseFloat(form.cantidad);
    const precio = parseFloat(form.precioUnitario);
    if (!form.numeroOrden || !form.producto || isNaN(cantidad) || isNaN(precio)) {
      toast.error('Complete los campos obligatorios');
      return;
    }
    const total = cantidad * precio;
    const item: OrdenItem = {
      id: generarId(),
      fecha: form.fecha,
      numeroOrden: form.numeroOrden,
      finca: form.finca || '-',
      producto: form.producto,
      cantidad,
      unidad: form.unidad,
      precioUnitario: precio,
      total,
      comisionistas: form.comisionistaIds.map(id => ({ comisionistaId: id })),
      clienteId: form.clienteId || undefined,
      productoId: form.productoId || undefined,
      fincaId: form.fincaId || undefined,
    };
    addOrdenItems([item]);
    resetForm();
  };

  function getNombreProducto(productoId: string) {
    return productos.find(p => p.id === productoId)?.nombre || '';
  }

  function getNombreFinca(fincaId: string) {
    return fincasCliente?.find((f: { id: string; nombre: string }) => f.id === fincaId)?.nombre || '';
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const isPdf = lowerName.endsWith('.pdf');
    const isImage = lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png');
    if (!isPdf && !isImage) {
      toast.error('Solo se permiten archivos PDF o imágenes (JPG, PNG)');
      return;
    }

    setUploadType(isPdf ? 'pdf' : 'imagen');
    setIsProcessingPDF(true);
    try {
      const result = isPdf ? await uploadPDF(file, pdfClienteId || undefined) : await uploadImage(file, pdfClienteId || undefined);
      setPdfPreview({
        fileName: file.name,
        fecha: result.fecha,
        numeroOrden: result.numeroOrden,
        proveedor: result.proveedor,
        semana: result.semana,
        items: result.items.map((item: any, idx: number) => ({
          ...item,
          id: item.id || `preview-${Date.now()}-${idx}`,
        })),
      });
      toast.success(`${result.items.length} productos extraídos del ${isPdf ? 'PDF' : 'imagen'}`);
    } catch (err) {
      console.error(err);
      toast.error(`Error al procesar el ${isPdf ? 'PDF' : 'imagen'}. Verifica que sea una orden de compra válida.`);
    } finally {
      setIsProcessingPDF(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmPDF = () => {
    if (!pdfPreview || pdfPreview.items.length === 0) return;
    const itemsConCliente = pdfPreview.items.map(item => ({
      ...item,
      clienteId: pdfClienteId || item.clienteId,
      proveedor: pdfPreview.proveedor || item.proveedor,
    }));
    addOrdenItems(itemsConCliente);
    setPdfPreview(null);
    setPdfClienteId('');
  };

  const handleDiscardPDF = () => {
    setPdfPreview(null);
    setPdfClienteId('');
  };

  const handleEdit = (item: OrdenItem) => {
    setEditingId(item.id);
    setEditForm({ ...item });
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const updatedEditForm = { ...editForm };
    if (updatedEditForm.cantidad && updatedEditForm.precioUnitario) {
      updatedEditForm.total = updatedEditForm.cantidad * updatedEditForm.precioUnitario;
    }
    updateOrdenItem(editingId, {
      ...updatedEditForm,
      comisionistaIds: (updatedEditForm.comisionistas || []).map(a => a.comisionistaId),
    } as Partial<OrdenItem> & { comisionistaIds: string[] });
    setEditOpen(false);
    setEditingId(null);
  };

  const totalGeneral = ordenItems.reduce((s, i) => s + i.total, 0);
  const hayItemsLiquidados = useMemo(
    () => ordenItems.some(item => item.estado === 'liquidada'),
    [ordenItems]
  );
  const cantidadOrdenes = useMemo(() => {
    const ids = new Set(ordenItems.map(item => item.ordenId || `${item.fecha}-${item.numeroOrden}-${item.clienteId || ''}`));
    return ids.size;
  }, [ordenItems]);

  const clearFilters = () => {
    setSearch('');
    setFilterEstado('todos');
    setFilterFechaDesde('');
    setFilterFechaHasta('');
    setFilterComisionistaId('todos');
  };

  const hasActiveFilters = search || filterEstado !== 'todos' || filterFechaDesde || filterFechaHasta || filterComisionistaId !== 'todos';

  const toggleSort = (field: 'fecha' | 'total' | 'numeroOrden') => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="card-elevated rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-slate-900">
            <Upload className="h-4 w-4 text-slate-700" />
            Cargar Orden de Compra
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button
              variant={activeForm === 'manual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveForm('manual')}
              className={activeForm === 'manual' ? 'btn-primary-dark rounded-lg' : 'border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg'}
            >
              <Plus className="h-4 w-4 mr-1" />
              Manual
            </Button>
            <Button
              variant={activeForm === 'pdf' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveForm('pdf')}
              className={activeForm === 'pdf' ? 'btn-primary-dark rounded-lg' : 'border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg'}
            >
              <FileUp className="h-4 w-4 mr-1" />
              Cargar archivo
            </Button>
          </div>

          {activeForm === 'manual' ? (
            <form onSubmit={handleAddManual} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Fecha</Label>
                <Input type="date" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Factura / Orden *</Label>
                <Input placeholder="#001" value={form.numeroOrden} onChange={e => setForm({...form, numeroOrden: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Cliente</Label>
                <Select value={form.clienteId} onValueChange={(value) => {
                  const cliente = clientes.find(c => c.id === value);
                  setForm({
                    ...form,
                    clienteId: value || '',
                    fincaId: '',
                    finca: cliente?.tipo === 'individual' ? cliente.nombre : form.finca,
                  });
                }}>
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedCliente?.tipo === 'grupo' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Finca</Label>
                  <Select value={form.fincaId} onValueChange={(value) => {
                    const v = value ?? '';
                    const nombre = getNombreFinca(v);
                    setForm({ ...form, fincaId: v, finca: nombre || form.finca });
                  }}>
                    <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                      <SelectValue placeholder="Seleccionar finca" />
                    </SelectTrigger>
                    <SelectContent>
                      {(fincasCliente || []).map((f: { id: string; nombre: string }) => (
                        <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedCliente?.tipo !== 'grupo' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Finca / Sector</Label>
                  <Input placeholder="Finca A" value={form.finca} onChange={e => setForm({...form, finca: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Producto *</Label>
                <Select value={form.productoId} onValueChange={(value) => {
                  const v = value ?? '';
                  const nombre = getNombreProducto(v);
                  setForm({ ...form, productoId: v, producto: nombre || form.producto });
                }}>
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <SelectValue placeholder="Seleccionar producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {productos.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Producto (texto libre)</Label>
                <Input placeholder="Producto" value={form.producto} onChange={e => setForm({...form, producto: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Cantidad *</Label>
                <Input type="number" step="0.01" placeholder="0" value={form.cantidad} onChange={e => setForm({...form, cantidad: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Unidad</Label>
                <Select value={form.unidad} onValueChange={(value) => setForm({...form, unidad: value ?? 'kg'})}>
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <SelectValue placeholder="Seleccionar unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="libras">libras</SelectItem>
                    <SelectItem value="unidades">unidades</SelectItem>
                    <SelectItem value="cajas">cajas</SelectItem>
                    <SelectItem value="litros">litros</SelectItem>
                    <SelectItem value="tachos">tachos</SelectItem>
                    <SelectItem value="sacos">sacos</SelectItem>
                    <SelectItem value="canecas">canecas</SelectItem>
                    <SelectItem value="galones">galones</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Precio Unit. *</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.precioUnitario} onChange={e => setForm({...form, precioUnitario: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Comisionistas</Label>
                <MultiSelectComisionistas
                  comisionistas={comisionistas}
                  selectedIds={form.comisionistaIds}
                  onChange={ids => setForm({...form, comisionistaIds: ids})}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <Button type="submit" className="btn-primary-dark rounded-xl">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Registro
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Cliente (opcional)</Label>
                <Select value={pdfClienteId} onValueChange={(value) => setPdfClienteId(value ?? '')}>
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <SelectValue placeholder="Seleccionar cliente para vincular fincas..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!pdfPreview ? (
                <>
                  <div
                    className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-slate-400 hover:bg-slate-50 transition-all cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileUp className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">Haz clic para subir el PDF o imagen de la orden de compra</p>
                    <p className="text-xs text-slate-500 mt-1">Soporta órdenes de compra tipo INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  {isProcessingPDF && (
                    <div className="text-center py-4">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-slate-900 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
                      <p className="text-sm text-slate-500 mt-2">{uploadType === 'pdf' ? 'Procesando PDF...' : 'Procesando imagen...'}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{pdfPreview.fileName}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                          <span><strong>Orden:</strong> {pdfPreview.numeroOrden}</span>
                          <span><strong>Fecha:</strong> {pdfPreview.fecha}</span>
                          {pdfPreview.semana && <span><strong>Semana:</strong> {pdfPreview.semana}</span>}
                          {pdfPreview.proveedor && <span><strong>Proveedor:</strong> {pdfPreview.proveedor}</span>}
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700">{pdfPreview.items.length} productos</Badge>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Finca</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-600">Producto</th>
                          <th className="text-right px-3 py-2 font-medium text-slate-600">Cantidad</th>
                          <th className="text-right px-3 py-2 font-medium text-slate-600">Precio Unit.</th>
                          <th className="text-right px-3 py-2 font-medium text-slate-600">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pdfPreview.items.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-2 text-slate-700">{item.finca}</td>
                            <td className="px-3 py-2 text-slate-900 font-medium">{item.producto}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{item.cantidad.toLocaleString('es-ES')} {item.unidad}</td>
                            <td className="px-3 py-2 text-right text-slate-700">${item.precioUnitario.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-900">${item.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleDiscardPDF} className="rounded-xl border-slate-200">
                      <X className="h-4 w-4 mr-2" />
                      Descartar
                    </Button>
                    <Button onClick={handleConfirmPDF} className="btn-primary-dark rounded-xl">
                      <Check className="h-4 w-4 mr-2" />
                      Confirmar y Agregar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {ordenItems.length > 0 && (
        <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar producto, factura..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                className="pl-9 bg-white border-slate-200 rounded-xl text-sm"
              />
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? 'btn-primary-dark rounded-lg' : 'rounded-lg border-slate-200'}
            >
              <Filter className="h-4 w-4 mr-1" />
              Filtros
              {hasActiveFilters && (
                <span className="ml-1 bg-white/20 text-xs px-1.5 py-0.5 rounded-md">
                  {[search && 1, filterEstado !== 'todos' && 1, filterFechaDesde && 1, filterFechaHasta && 1, filterComisionistaId !== 'todos' && 1].filter(Boolean).length}
                </span>
              )}
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={collapseAll} className="rounded-lg border-slate-200 text-slate-600">
                Colapsar todo
              </Button>
              <Button variant="outline" size="sm" onClick={expandAll} className="rounded-lg border-slate-200 text-slate-600">
                Expandir todo
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Fecha desde</Label>
                <Input type="date" value={filterFechaDesde} onChange={e => { setFilterFechaDesde(e.target.value); setCurrentPage(1); }} className="bg-white border-slate-200 rounded-xl h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Fecha hasta</Label>
                <Input type="date" value={filterFechaHasta} onChange={e => { setFilterFechaHasta(e.target.value); setCurrentPage(1); }} className="bg-white border-slate-200 rounded-xl h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Estado</Label>
                <Select value={filterEstado} onValueChange={v => { setFilterEstado(v ?? 'todos'); setCurrentPage(1); }}>
                  <SelectTrigger className="bg-white border-slate-200 rounded-xl h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los estados</SelectItem>
                    {ESTADOS_ORDEN.map(e => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Comisionista</Label>
                <Select value={filterComisionistaId} onValueChange={v => { setFilterComisionistaId(v ?? 'todos'); setCurrentPage(1); }}>
                  <SelectTrigger className="bg-white border-slate-200 rounded-xl h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los comisionistas</SelectItem>
                    {comisionistas.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500 hover:text-slate-700 rounded-lg">
                  <X className="h-3.5 w-3.5 mr-1" />
                  Limpiar filtros
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <UserCheck className="h-5 w-5 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <Label className="text-xs text-slate-500">Asignar comisionistas a todos</Label>
              <div className="flex gap-2 mt-1">
                <MultiSelectComisionistas
                  comisionistas={comisionistas}
                  selectedIds={globalComisionistaIds}
                  onChange={setGlobalComisionistaIds}
                  placeholder="Seleccionar..."
                  disabled={hayItemsLiquidados}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={hayItemsLiquidados}
                  onClick={() => {
                    if (hayItemsLiquidados) {
                      toast.error('No se pueden modificar órdenes con ítems liquidados');
                      return;
                    }
                    if (globalComisionistaIds.length === 0) {
                      toast.error('Selecciona al menos un comisionista');
                      return;
                    }
                    assignComisionistasGlobal(globalComisionistaIds);
                    const sinTarifa: string[] = [];
                    ordenItems.forEach(item => {
                      globalComisionistaIds.forEach(comId => {
                        if (item.clienteId && item.productoId && !encontrarTarifaEspecifica(item, comId, tarifasClienteProducto)) {
                          const com = comisionistas.find(c => c.id === comId);
                          sinTarifa.push(`${com?.nombre || comId} → ${item.productoRel?.nombre || item.producto}`);
                        }
                      });
                    });
                    if (sinTarifa.length > 0) {
                      toast.warning(`Algunas asignaciones carecen de tarifa específica: ${sinTarifa.slice(0, 3).join(', ')}${sinTarifa.length > 3 ? '...' : ''}`);
                    }
                  }}
                  className="border-slate-200 rounded-lg shrink-0"
                >
                  Asignar
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <p className="text-xs text-slate-500">{cantidadOrdenes} orden{cantidadOrdenes === 1 ? '' : 'es'} / {ordenItems.length} productos</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">${totalGeneral.toFixed(2)}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={hayItemsLiquidados}
                onClick={clearOrdenItems}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            </div>
          </div>
        </div>
      )}

      {ordenesAgrupadas.length > 0 && (
        <Card className="card-elevated rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700">
                  {filteredOrdenItems.length === ordenItems.length
                    ? `${cantidadOrdenes} orden${cantidadOrdenes === 1 ? '' : 'es'}`
                    : `${ordenesAgrupadas.length} de ${cantidadOrdenes} orden${cantidadOrdenes === 1 ? '' : 'es'}`
                  }
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => toggleSort('fecha')} className="text-xs text-slate-600 h-7 rounded-lg">
                  <Calendar className="h-3.5 w-3.5 mr-1" />
                  Fecha{sortField === 'fecha' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleSort('numeroOrden')} className="text-xs text-slate-600 h-7 rounded-lg">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
                  №{sortField === 'numeroOrden' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleSort('total')} className="text-xs text-slate-600 h-7 rounded-lg">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
                  Total{sortField === 'total' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                </Button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {paginatedOrdenes.map(orden => {
                const collapsed = collapsedOrdenIds.has(orden.id);
                return (
                  <div key={orden.id} className="group">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(orden.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 transition-colors text-left"
                    >
                      {collapsed ? <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-sm">{orden.numeroOrden}</span>
                          <Badge variant="secondary" className={getEstadoOrdenMeta(orden.estado).className}>
                            {getEstadoOrdenMeta(orden.estado).label}
                          </Badge>
                          <span className="text-xs text-slate-500">{orden.fecha}</span>
                          {orden.comisionistaIds.length > 0 && (
                            <div className="flex items-center gap-1">
                              {orden.comisionistaIds.slice(0, 3).map(cid => {
                                const com = comisionistas.find(c => c.id === cid);
                                return com ? (
                                  <Badge key={cid} variant="secondary" className="text-xs border-0 bg-slate-100 text-slate-700">
                                    {com.nombre}
                                  </Badge>
                                ) : null;
                              })}
                              {orden.comisionistaIds.length > 3 && (
                                <Badge variant="secondary" className="text-xs border-0 bg-slate-200 text-slate-600">
                                  +{orden.comisionistaIds.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                          <span>{orden.cliente}</span>
                          {orden.fincas.length > 0 && (
                            <span>{orden.fincas.length > 1 ? `${orden.fincas.length} fincas` : orden.fincas[0]}</span>
                          )}
                          <span>{orden.items.length} producto{orden.items.length !== 1 ? 's' : ''}</span>
                          {orden.comisionistaIds.length === 0 && (
                            <span className="text-slate-400">Sin asignar</span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">${orden.total.toFixed(2)}</span>
                    </button>

                    {!collapsed && (
                      <div className="border-t border-slate-100">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50/50">
                            <tr>
                              <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Producto</th>
                              <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Cliente</th>
                              <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Finca</th>
                              <th className="text-right px-4 py-2 font-medium text-slate-500 text-xs">Cantidad</th>
                              <th className="text-right px-4 py-2 font-medium text-slate-500 text-xs">Total</th>
                              <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Comisionistas</th>
                              <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Estado</th>
                              <th className="text-center px-4 py-2 font-medium text-slate-500 text-xs w-20"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {orden.items.map(item => {
                              const grupoBloqueado = orden.estado === 'liquidada' || orden.items.some((ordenItem) => ordenItem.estado === 'liquidada');
                              return (
                                <tr key={item.id} className="hover:bg-slate-50/30 transition-colors">
                                  <td className="px-4 py-2.5">
                                    <span className="text-sm font-medium text-slate-900">{item.productoRel?.nombre || item.producto}</span>
                                    <span className="ml-1.5 text-xs text-slate-400">${item.precioUnitario.toFixed(2)} unit.</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-slate-600">{item.cliente?.nombre || '-'}</td>
                                  <td className="px-4 py-2.5 text-sm text-slate-600">{item.fincaRel?.nombre || item.finca}</td>
                                  <td className="px-4 py-2.5 text-right text-sm text-slate-700">
                                    {item.cantidad.toLocaleString('es-ES')} <span className="text-xs text-slate-400">{item.unidad}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-medium text-sm text-slate-900">${item.total.toFixed(2)}</td>
                                  <td className="px-4 py-2.5">
                                    {item.comisionistas.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {item.comisionistas.map(a => {
                                          const com = comisionistas.find(c => c.id === a.comisionistaId);
                                          const tieneTarifa = item.clienteId && item.productoId && encontrarTarifaEspecifica(item, a.comisionistaId, tarifasClienteProducto);
                                          const nombre = com?.nombre || a.comisionistaId;
                                          return (
                                            <Badge key={a.comisionistaId} variant="secondary" className={`text-xs border-0 ${tieneTarifa ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-700'}`} title={tieneTarifa ? '' : 'Sin tarifa específica configurada'}>
                                              {nombre}
                                            </Badge>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-400">Sin asignar</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <Badge variant="secondary" className={getEstadoOrdenMeta(item.estado).className}>
                                      {getEstadoOrdenMeta(item.estado).label}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex justify-center gap-1">
                                      <Button variant="ghost" size="icon-xs" disabled={grupoBloqueado} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400" onClick={() => handleEdit(item)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon-xs" disabled={grupoBloqueado} className="text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400" onClick={() => deleteOrdenItem(item.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div className="flex items-center justify-between px-4 py-2 bg-slate-50/50 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            <Select
                              value={orden.estado}
                              onValueChange={(value) => updateEstadoOrden(orden.id, value as EstadoOrden)}
                              disabled={orden.estado === 'liquidada' || orden.items.some(item => item.estado === 'liquidada')}
                            >
                              <SelectTrigger className="h-7 w-40 rounded-lg border-slate-200 bg-white text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ESTADOS_ORDEN.filter((estado) => estado.value !== 'liquidada').map((estado) => (
                                  <SelectItem key={estado.value} value={estado.value}>
                                    {estado.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button variant="ghost" size="sm" disabled={orden.estado === 'liquidada' || orden.items.some(item => item.estado === 'liquidada')} className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-red-300" onClick={() => {
                            if (confirm('¿Eliminar toda la orden y sus productos?')) {
                              orden.items.forEach(item => deleteOrdenItem(item.id));
                            }
                          }}>
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Eliminar orden
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/70">
                <p className="text-xs text-slate-500">
                  Mostrando {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, ordenesAgrupadas.length)} de {ordenesAgrupadas.length} órdenes
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-xs" disabled={safePage === 1} onClick={() => setCurrentPage(p => p - 1)} className="rounded-lg border-slate-200">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (safePage <= 3) {
                      page = i + 1;
                    } else if (safePage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = safePage - 2 + i;
                    }
                    return (
                      <Button key={page} variant={page === safePage ? 'default' : 'outline'} size="icon-xs" onClick={() => setCurrentPage(page)} className={page === safePage ? 'rounded-lg btn-primary-dark' : 'rounded-lg border-slate-200'}>
                        {page}
                      </Button>
                    );
                  })}
                  <Button variant="outline" size="icon-xs" disabled={safePage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="rounded-lg border-slate-200">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {ordenItems.length === 0 && !pdfPreview && (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
          <Calculator className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700">Sin órdenes cargadas</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Carga un PDF de orden de compra o agrega registros manualmente para comenzar.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setActiveForm('manual')} className="rounded-xl border-slate-200">
              <Plus className="h-4 w-4 mr-2" />
              Agregar manual
            </Button>
            <Button size="sm" onClick={() => setActiveForm('pdf')} className="btn-primary-dark rounded-xl">
              <FileUp className="h-4 w-4 mr-2" />
              Cargar archivo
            </Button>
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle>Editar Registro</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Fecha</Label>
                <Input type="date" value={editForm.fecha || ''} onChange={e => setEditForm({...editForm, fecha: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Factura/Orden</Label>
                <Input value={editForm.numeroOrden || ''} onChange={e => setEditForm({...editForm, numeroOrden: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Cliente</Label>
                <Select value={editForm.clienteId || ''} onValueChange={(value) => {
                  const cliente = clientes.find(c => c.id === value);
                  setEditForm({
                    ...editForm,
                    clienteId: value || undefined,
                    fincaId: undefined,
                    finca: cliente?.tipo === 'individual' ? cliente.nombre : editForm.finca,
                  });
                }}>
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <SelectValue placeholder="Seleccionar cliente">
                      {editForm.clienteId ? (clientes.find(c => c.id === editForm.clienteId)?.nombre || 'Cliente no encontrado') : 'Seleccionar cliente'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(clientes.find(c => c.id === editForm.clienteId)?.tipo === 'grupo') && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Finca</Label>
                  <EditFincaSelect
                    clienteId={editForm.clienteId || ''}
                    value={editForm.fincaId || ''}
                    onChange={(value, nombre) => setEditForm({ ...editForm, fincaId: value || undefined, finca: nombre || editForm.finca })}
                  />
                </div>
              )}
              {!(clientes.find(c => c.id === editForm.clienteId)?.tipo === 'grupo') && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Finca / Sector</Label>
                  <Input value={editForm.finca || ''} onChange={e => setEditForm({...editForm, finca: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Producto</Label>
                <Select value={editForm.productoId || ''} onValueChange={(value) => {
                  const nombre = productos.find(p => p.id === value)?.nombre;
                  setEditForm({ ...editForm, productoId: value || undefined, producto: nombre || editForm.producto });
                }}>
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <SelectValue placeholder="Seleccionar producto">
                      {editForm.productoId ? (productos.find(p => p.id === editForm.productoId)?.nombre || 'Producto no encontrado') : 'Seleccionar producto'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {productos.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Producto (texto libre)</Label>
                <Input value={editForm.producto || ''} onChange={e => setEditForm({...editForm, producto: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Cantidad</Label>
                <Input type="number" step="0.01" value={editForm.cantidad || ''} onChange={e => setEditForm({...editForm, cantidad: parseFloat(e.target.value) || 0})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Unidad</Label>
                <Select value={editForm.unidad || 'kg'} onValueChange={(value) => setEditForm({...editForm, unidad: value ?? 'kg'})}>
                  <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white h-10 text-sm text-slate-900">
                    <SelectValue placeholder="Seleccionar unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="libras">libras</SelectItem>
                    <SelectItem value="unidades">unidades</SelectItem>
                    <SelectItem value="cajas">cajas</SelectItem>
                    <SelectItem value="litros">litros</SelectItem>
                    <SelectItem value="tachos">tachos</SelectItem>
                    <SelectItem value="sacos">sacos</SelectItem>
                    <SelectItem value="canecas">canecas</SelectItem>
                    <SelectItem value="galones">galones</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Precio Unit.</Label>
                <Input type="number" step="0.01" value={editForm.precioUnitario || ''} onChange={e => setEditForm({...editForm, precioUnitario: parseFloat(e.target.value) || 0})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-slate-500">Comisionistas</Label>
                <MultiSelectComisionistas
                  comisionistas={comisionistas}
                  selectedIds={(editForm.comisionistas || []).map(a => a.comisionistaId)}
                  onChange={ids => setEditForm({
                    ...editForm,
                    comisionistas: ids.map(id => ({ comisionistaId: id })),
                  })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)} className="rounded-xl border-slate-200">Cancelar</Button>
              <Button onClick={handleSaveEdit} className="btn-primary-dark rounded-xl">Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}