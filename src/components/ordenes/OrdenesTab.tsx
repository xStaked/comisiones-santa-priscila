'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Trash2, Pencil, UserCheck, Calculator, FileUp, Check, X, ChevronDown, ChevronRight, ChevronLeft, Calendar, ArrowUpDown } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { EstadoOrden, OrdenItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  BotonSecundario,
  Buscador,
  Chip,
  ChipEstado,
  Panel,
  Vacio,
  money,
  num,
} from '@/components/ui/dc';
import { toast } from 'sonner';
import { uploadPDF, uploadImage, fetchFincas } from '@/lib/api';
import { generarId } from '@/lib/id';
import { useQuery } from '@tanstack/react-query';
import { encontrarTarifaEspecifica } from '@/lib/export-utils';

const ESTADOS_ORDEN: { value: EstadoOrden; label: string; className: string }[] = [
  { value: 'pendiente', label: 'Pendiente', className: 'bg-[#F0F2F5] text-[#344054] border-0' },
  { value: 'parcialmente_pagada', label: 'Parcialmente pagada', className: 'bg-[#FEF3E2] text-[#9A5B0B] border-0' },
  { value: 'pagada', label: 'Pagada', className: 'bg-[#E6F2F0] text-[#0B5E56] border-0' },
  { value: 'liquidada', label: 'Liquidada', className: 'bg-[#EAF0FB] text-[#1D4ED8] border-0' },
];

// Chips de estado de la barra del rediseño (mismo orden que el prototipo).
const ESTADOS_FILTRO: { value: string; label: string }[] = [
  { value: 'todos', label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'pagada', label: 'Pagadas' },
  { value: 'liquidada', label: 'Liquidadas' },
];

const ITEMS_PER_PAGE = 15;

const COLS_ORDENES =
  'grid-cols-[34px_minmax(0,132px)_92px_minmax(0,1.35fr)_minmax(0,1fr)_72px_108px_130px_96px_30px]';

type OrdenAgrupada = {
  id: string;
  fecha: string;
  numeroOrden: string;
  cliente: string;
  proveedor: string;
  total: number;
  estado: EstadoOrden;
  fechaPago?: string | null;
  comisionistaIds: string[];
  items: OrdenItem[];
};

type OrdenItemExtraido = Omit<OrdenItem, 'id'> & { id?: string };

function agruparOrdenes(
  ordenItems: OrdenItem[],
  sortField: 'fecha' | 'total' | 'numeroOrden',
  sortDir: 'asc' | 'desc'
): OrdenAgrupada[] {
  const map = new Map<string, OrdenAgrupada>();

  ordenItems.forEach((item) => {
    const id = item.ordenId || `${item.fecha}-${item.numeroOrden}-${item.clienteId || ''}`;
    const existente = map.get(id);
    const comisionistaIds = item.comisionistas.map(a => a.comisionistaId);
    if (existente) {
      const items = [...existente.items, item];
      const nuevosComisionistaIds = comisionistaIds.filter((cid) => !existente.comisionistaIds.includes(cid));
      map.set(id, {
        ...existente,
        total: existente.total + item.total,
        items,
        comisionistaIds: nuevosComisionistaIds.length > 0
          ? [...existente.comisionistaIds, ...nuevosComisionistaIds]
          : existente.comisionistaIds,
        estado: getEstadoOrdenAgrupada(items),
      });
      return;
    }

    map.set(id, {
      id,
      fecha: item.fecha,
      numeroOrden: item.numeroOrden,
      cliente: item.cliente?.nombre || '-',
      proveedor: item.proveedor?.trim() || '',
      total: item.total,
      estado: item.estado || 'pendiente',
      fechaPago: item.fechaPago || null,
      comisionistaIds,
      items: [item],
    });
  });

  const extraerNumero = (s: string) => { const m = s.match(/\d+/); return m ? parseInt(m[0], 10) : NaN; };

  return Array.from(map.values()).sort((a, b) => {
    // Las liquidadas siempre al fondo, sin importar el orden elegido
    const aLiq = a.estado === 'liquidada' ? 1 : 0;
    const bLiq = b.estado === 'liquidada' ? 1 : 0;
    if (aLiq !== bLiq) return aLiq - bLiq;

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
        className="flex items-center justify-between w-full min-h-10 px-3 py-2 rounded-xl border border-border bg-white text-sm text-[#0B1220] hover:border-[#C6CDD6] transition-colors disabled:cursor-not-allowed disabled:bg-[#FAFBFC] disabled:text-[#98A2B3]"
      >
        <span className={selectedIds.length === 0 ? 'text-[#98A2B3]' : ''}>
          {selectedIds.length === 0
            ? placeholder
            : (
              <span className="flex flex-wrap gap-1">
                {selectedNames.map((name, i) => (
                  <span key={selectedIds[i]} className="inline-flex items-center gap-0.5 bg-[#F0F2F5] px-1.5 py-0.5 rounded-md text-xs font-medium text-[#344054]">
                    {name}
                    <button
                      type="button"
                      className="ml-0.5 hover:text-[#B91C1C]"
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
        <ChevronDown className="h-4 w-4 text-[#98A2B3] shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute z-[9999] mt-1 w-full bg-white border border-border rounded-xl shadow-lg max-h-60 overflow-auto">
          {comisionistas.map(c => (
            <label
              key={c.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-[#FAFBFC] cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(c.id)}
                disabled={disabled}
                onChange={() => toggle(c.id)}
                className="h-4 w-4 rounded border-[#C6CDD6] text-[#0B1220] focus:ring-slate-900"
              />
              <span className="text-[#344054]">{c.nombre}</span>
            </label>
          ))}
          {comisionistas.length === 0 && (
            <div className="px-3 py-2 text-sm text-[#98A2B3]">No hay comisionistas</div>
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
  const nombreFincaSeleccionada = value
    ? (fincas || []).find((x: { id: string; nombre: string }) => x.id === value)?.nombre || 'Sector no encontrado'
    : 'Seleccionar sector';

  return (
    <Select value={value} onValueChange={(v) => {
      const id = v ?? '';
      const f = (fincas || []).find((x: { id: string; nombre: string }) => x.id === id);
      onChange(id, f?.nombre || '');
    }}>
      <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
        <SelectValue placeholder="Seleccionar sector">
          {nombreFincaSeleccionada}
        </SelectValue>
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
  const { comisionistas, ordenItems, addOrdenItems, updateOrdenItem, updateEstadoOrden, updateEstadoOrdenesMasivo, deleteOrdenItem, deleteOrdenItems, clearOrdenItems, assignComisionistasGlobal, clientes, productos, tarifasClienteProducto } = useApp();
  const [activeForm, setActiveForm] = useState<'manual' | 'pdf'>('manual');
  // La carga vive en un panel lateral (rediseño), no en una tarjeta siempre visible.
  const [sheetAbierto, setSheetAbierto] = useState(false);
  const [globalComisionistaIds, setGlobalComisionistaIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pdfPreviews, setPdfPreviews] = useState<{
    fileName: string;
    fecha: string;
    numeroOrden: string;
    proveedor: string;
    semana: string;
    items: OrdenItem[];
  }[]>([]);
  const [isProcessingPDF, setIsProcessingPDF] = useState(false);
  const [uploadType, setUploadType] = useState<'pdf' | 'imagen'>('pdf');
  const [pdfClienteId, setPdfClienteId] = useState<string>('');

  const initialFecha = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [manualHeader, setManualHeader] = useState({
    fecha: initialFecha,
    numeroOrden: '',
    clienteId: '',
    proveedor: '',
  });

  const [currentLine, setCurrentLine] = useState({
    fincaId: '',
    finca: '',
    productoId: '',
    producto: '',
    cantidad: '',
    unidad: 'kg',
    precioUnitario: '',
    comisionistaIds: [] as string[],
  });

  const [stagedItems, setStagedItems] = useState<OrdenItem[]>([]);

  const manualSelectedCliente = clientes.find(c => c.id === manualHeader.clienteId);
  const pdfSelectedCliente = clientes.find(c => c.id === pdfClienteId);
  const { data: fincasCliente } = useQuery({
    queryKey: ['fincas', manualHeader.clienteId],
    queryFn: () => fetchFincas(manualHeader.clienteId),
    enabled: !!manualHeader.clienteId && manualSelectedCliente?.tipo === 'grupo',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<OrdenItem>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Rastrea las expandidas: default vacío = todas cerradas (incluidas las nuevas)
  const [expandedOrdenIds, setExpandedOrdenIds] = useState<Set<string>>(new Set());
  const [selectedOrdenIds, setSelectedOrdenIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterFechaDesde, setFilterFechaDesde] = useState('');
  const [filterFechaHasta, setFilterFechaHasta] = useState('');
  const [filterComisionistaId, setFilterComisionistaId] = useState<string>('todos');
  // Marcar como pagada exige elegir la fecha: se pide en este diálogo (una o varias órdenes)
  const [pagoPendiente, setPagoPendiente] = useState<{ estado: EstadoOrden; ordenIds: string[]; masivo: boolean } | null>(null);
  const [fechaPagoInput, setFechaPagoInput] = useState('');
  const [sortField, setSortField] = useState<'fecha' | 'total' | 'numeroOrden'>('numeroOrden');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);

  const toggleCollapse = (id: string) => {
    setExpandedOrdenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSeleccionOrden = (id: string) => setSelectedOrdenIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const expandAll = () => {
    setExpandedOrdenIds(new Set(ordenesAgrupadas.map(o => o.id)));
  };

  const collapseAll = () => {
    setExpandedOrdenIds(new Set());
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

  const ordenesAgrupadas = agruparOrdenes(filteredOrdenItems, sortField, sortDir);
  const etiquetaFiltroEstado = filterEstado === 'todos'
    ? 'Todos los estados'
    : ESTADOS_ORDEN.find((estado) => estado.value === filterEstado)?.label || filterEstado;
  const etiquetaFiltroComisionista = filterComisionistaId === 'todos'
    ? 'Todos los comisionistas'
    : comisionistas.find((c) => c.id === filterComisionistaId)?.nombre || 'Comisionista no encontrado';
  const getEtiquetaEstado = (estado: EstadoOrden) =>
    ESTADOS_ORDEN.find((item) => item.value === estado)?.label || estado;

  const totalPages = Math.max(1, Math.ceil(ordenesAgrupadas.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedOrdenes = ordenesAgrupadas.slice(start, start + ITEMS_PER_PAGE);

  const ordenesSeleccionables = ordenesAgrupadas.filter(o => o.estado !== 'liquidada');
  const todasSeleccionadas = ordenesSeleccionables.length > 0 &&
    ordenesSeleccionables.every(o => selectedOrdenIds.has(o.id));
  const toggleSeleccionarTodas = () => {
    setSelectedOrdenIds(todasSeleccionadas ? new Set() : new Set(ordenesSeleccionables.map(o => o.id)));
  };
  const aplicarEstadoMasivo = (estado: EstadoOrden, fechaPago?: string | null) => {
    // Limpiar la selección solo si la mutación tiene éxito; el toast de error ya lo maneja el contexto
    updateEstadoOrdenesMasivo(Array.from(selectedOrdenIds), estado, fechaPago)
      .then(() => setSelectedOrdenIds(new Set()))
      .catch(() => {});
  };

  const hoy = () => new Date().toISOString().slice(0, 10);

  // Pendiente no lleva fecha; pagada y parcialmente pagada sí, y hay que elegirla.
  const pedirFechaDePago = (
    estado: EstadoOrden,
    ordenIds: string[],
    masivo: boolean,
    fechaActual?: string | null
  ) => {
    if (estado === 'pendiente') {
      if (masivo) aplicarEstadoMasivo(estado);
      else updateEstadoOrden(ordenIds[0], estado, null);
      return;
    }
    setFechaPagoInput(fechaActual || hoy());
    setPagoPendiente({ estado, ordenIds, masivo });
  };

  const confirmarFechaDePago = () => {
    if (!pagoPendiente || !fechaPagoInput) return;
    if (pagoPendiente.masivo) {
      aplicarEstadoMasivo(pagoPendiente.estado, fechaPagoInput);
    } else {
      updateEstadoOrden(pagoPendiente.ordenIds[0], pagoPendiente.estado, fechaPagoInput);
    }
    setPagoPendiente(null);
  };
  const handleEliminarMasivo = () => {
    const itemIds = ordenesAgrupadas
      .filter(o => selectedOrdenIds.has(o.id))
      .flatMap(o => o.items.map(item => item.id));
    if (!confirm(`¿Eliminar ${selectedOrdenIds.size} orden${selectedOrdenIds.size === 1 ? '' : 'es'} y sus productos?`)) return;
    deleteOrdenItems(itemIds)
      .then(() => setSelectedOrdenIds(new Set()))
      .catch(() => {});
  };

  const resetManualForm = () => {
    setManualHeader({
      fecha: typeof window !== 'undefined' ? new Date().toISOString().slice(0, 10) : '',
      numeroOrden: '',
      clienteId: '',
      proveedor: '',
    });
    setCurrentLine({
      fincaId: '',
      finca: '',
      productoId: '',
      producto: '',
      cantidad: '',
      unidad: 'kg',
      precioUnitario: '',
      comisionistaIds: [],
    });
    setStagedItems([]);
  };

  const handleAddLine = () => {
    const cantidad = parseFloat(currentLine.cantidad);
    const precio = parseFloat(currentLine.precioUnitario);
    if (!currentLine.producto || isNaN(cantidad) || isNaN(precio)) {
      toast.error('Complete los campos obligatorios del producto');
      return;
    }
    const total = cantidad * precio;
    const item: OrdenItem = {
      id: generarId(),
      fecha: manualHeader.fecha,
      numeroOrden: manualHeader.numeroOrden,
      finca: currentLine.finca || '-',
      producto: currentLine.producto,
      cantidad,
      unidad: currentLine.unidad,
      precioUnitario: precio,
      total,
      comisionistas: currentLine.comisionistaIds.map(id => ({ comisionistaId: id })),
      clienteId: manualHeader.clienteId || undefined,
      productoId: currentLine.productoId || undefined,
      fincaId: currentLine.fincaId || undefined,
      proveedor: manualHeader.proveedor || undefined,
    };
    setStagedItems(prev => [...prev, item]);
    setCurrentLine({
      fincaId: '',
      finca: manualSelectedCliente?.tipo === 'individual' ? manualSelectedCliente.nombre : '',
      productoId: '',
      producto: '',
      cantidad: '',
      unidad: 'kg',
      precioUnitario: '',
      comisionistaIds: [],
    });
  };

  const handleConfirmManual = () => {
    if (stagedItems.length === 0) return;
    if (!manualHeader.numeroOrden) {
      toast.error('Ingrese el número de factura/orden');
      return;
    }
    const itemsWithHeader = stagedItems.map(item => ({
      ...item,
      fecha: manualHeader.fecha,
      numeroOrden: manualHeader.numeroOrden,
      clienteId: manualHeader.clienteId || undefined,
      proveedor: manualHeader.proveedor || undefined,
    }));
    addOrdenItems(itemsWithHeader);
    resetManualForm();
  };

  const removeStagedItem = (id: string) => {
    setStagedItems(prev => prev.filter(item => item.id !== id));
  };

  function getNombreProducto(productoId: string) {
    return productos.find(p => p.id === productoId)?.nombre || '';
  }

  function getNombreFinca(fincaId: string) {
    return fincasCliente?.find((f: { id: string; nombre: string }) => f.id === fincaId)?.nombre || '';
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setIsProcessingPDF(true);
    let okCount = 0;
    let totalItems = 0;
    // ponytail: procesa archivos en serie; con cientos a la vez, paralelizar con Promise.all
    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      const isPdf = lowerName.endsWith('.pdf');
      const isImage = lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png');
      if (!isPdf && !isImage) {
        toast.error(`${file.name}: solo se permiten PDF o imágenes (JPG, PNG)`);
        continue;
      }
      setUploadType(isPdf ? 'pdf' : 'imagen');
      try {
        const result = isPdf ? await uploadPDF(file, pdfClienteId || undefined) : await uploadImage(file, pdfClienteId || undefined);
        setPdfPreviews(prev => [...prev, {
          fileName: file.name,
          fecha: result.fecha,
          numeroOrden: result.numeroOrden,
          proveedor: result.proveedor,
          semana: result.semana,
          items: (result.items as OrdenItemExtraido[]).map((item, idx) => ({
            ...item,
            id: item.id || `preview-${file.name}-${idx}`,
          })),
        }]);
        okCount++;
        totalItems += result.items.length;
      } catch (err) {
        console.error(err);
        toast.error(`Error al procesar ${file.name}. Verifica que sea una orden de compra válida.`);
      }
    }
    setIsProcessingPDF(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (okCount > 0) toast.success(`${okCount} orden(es), ${totalItems} productos extraídos`);
  };

  const handleConfirmPDF = () => {
    const itemsConCliente = pdfPreviews.flatMap(preview =>
      preview.items.map(item => ({
        ...item,
        clienteId: pdfClienteId || item.clienteId,
        proveedor: preview.proveedor || item.proveedor,
      }))
    );
    if (itemsConCliente.length === 0) return;
    addOrdenItems(itemsConCliente);
    setPdfPreviews([]);
    setPdfClienteId('');
  };

  const handleDiscardPDF = () => {
    setPdfPreviews([]);
    setPdfClienteId('');
  };

  const removePdfPreview = (fileName: string) => {
    setPdfPreviews(prev => prev.filter(p => p.fileName !== fileName));
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


  // Contadores por estado para los chips de la barra (sobre facturas, no ítems).
  const conteoPorEstado = useMemo(() => {
    const porOrden = new Map<string, EstadoOrden | undefined>();
    ordenItems.forEach(item => {
      const k = item.ordenId || `${item.fecha}-${item.numeroOrden}-${item.clienteId || ''}`;
      if (!porOrden.has(k)) porOrden.set(k, item.estado);
    });
    const estados = Array.from(porOrden.values());
    return {
      todos: estados.length,
      pendiente: estados.filter(e => e === 'pendiente').length,
      parcialmente_pagada: estados.filter(e => e === 'parcialmente_pagada').length,
      pagada: estados.filter(e => e === 'pagada').length,
      liquidada: estados.filter(e => e === 'liquidada').length,
    } as Record<string, number>;
  }, [ordenItems]);

  const chipsActivos = [
    filterEstado !== 'todos' && {
      label: `Estado: ${etiquetaFiltroEstado}`,
      quitar: () => { setFilterEstado('todos'); setCurrentPage(1); },
    },
    filterComisionistaId !== 'todos' && {
      label: etiquetaFiltroComisionista,
      quitar: () => { setFilterComisionistaId('todos'); setCurrentPage(1); },
    },
    filterFechaDesde && {
      label: `Desde ${filterFechaDesde}`,
      quitar: () => { setFilterFechaDesde(''); setCurrentPage(1); },
    },
    filterFechaHasta && {
      label: `Hasta ${filterFechaHasta}`,
      quitar: () => { setFilterFechaHasta(''); setCurrentPage(1); },
    },
    search && { label: `«${search}»`, quitar: () => { setSearch(''); setCurrentPage(1); } },
  ].filter(Boolean) as { label: string; quitar: () => void }[];

  const toggleSort = (field: 'fecha' | 'total' | 'numeroOrden') => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  return (
    <div className="flex max-w-[1360px] flex-col gap-3.5">
      {/* Carga de facturas: panel lateral (rediseño) */}
      <Sheet open={sheetAbierto} onOpenChange={setSheetAbierto}>
        {/* La variante por defecto limita a max-w-sm; se sobreescribe con el mismo
            selector para que tailwind-merge la deduplique y respete los 660px. */}
        <SheetContent className="data-[side=right]:w-[660px] data-[side=right]:max-w-[92vw] data-[side=right]:sm:max-w-[92vw]">
          <SheetHeader>
            <SheetTitle>Nueva factura</SheetTitle>
            <SheetDescription>Carga manual o extracción desde PDF o imagen.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <div className="mb-5 flex rounded-[10px] bg-[#F2F4F6] p-[3px]">
            {([
              { k: 'manual', label: 'Carga manual' },
              { k: 'pdf', label: 'PDF o imagen' },
            ] as const).map((m) => (
              <button
                key={m.k}
                type="button"
                onClick={() => setActiveForm(m.k)}
                className={`h-[34px] flex-1 rounded-lg text-[13px] font-medium transition ${
                  activeForm === m.k ? 'bg-white text-[#0B1220] shadow-sm' : 'text-[#6B7684]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {activeForm === 'manual' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#7A8798]">Fecha</Label>
                  <Input type="date" value={manualHeader.fecha} onChange={e => setManualHeader({...manualHeader, fecha: e.target.value})} className="bg-white border-border rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#7A8798]">Factura / Orden *</Label>
                  <Input placeholder="#001" value={manualHeader.numeroOrden} onChange={e => setManualHeader({...manualHeader, numeroOrden: e.target.value})} className="bg-white border-border rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#7A8798]">Cliente</Label>
                  <Select value={manualHeader.clienteId} onValueChange={(value) => {
                    const cliente = clientes.find(c => c.id === value);
                    setManualHeader({...manualHeader, clienteId: value || ''});
                    setCurrentLine({...currentLine, fincaId: '', finca: cliente?.tipo === 'individual' ? cliente.nombre : ''});
                  }}>
                    <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
                      <SelectValue placeholder="Seleccionar cliente">
                        {manualHeader.clienteId ? (clientes.find(c => c.id === manualHeader.clienteId)?.nombre || 'Cliente no encontrado') : 'Seleccionar cliente'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#7A8798]">Proveedor</Label>
                  <Input placeholder="Proveedor" value={manualHeader.proveedor} onChange={e => setManualHeader({...manualHeader, proveedor: e.target.value})} className="bg-white border-border rounded-xl" />
                </div>
              </div>

              <div className="border-t border-[#EDEFF2] pt-4">
                <p className="text-sm font-medium text-[#344054] mb-3">Agregar productos</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {manualSelectedCliente?.tipo === 'grupo' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-[#7A8798]">Sector</Label>
                      <Select value={currentLine.fincaId} onValueChange={(value) => {
                        const v = value ?? '';
                        const nombre = getNombreFinca(v);
                        setCurrentLine({ ...currentLine, fincaId: v, finca: nombre || currentLine.finca });
                      }}>
                        <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
                          <SelectValue placeholder="Seleccionar sector">
                            {currentLine.fincaId ? ((fincasCliente || []).find((f: { id: string; nombre: string }) => f.id === currentLine.fincaId)?.nombre || 'Sector no encontrado') : 'Seleccionar sector'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(fincasCliente || []).map((f: { id: string; nombre: string }) => (
                            <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {manualSelectedCliente?.tipo !== 'grupo' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-[#7A8798]">Sector</Label>
                      <Input placeholder="Sector A" value={currentLine.finca} onChange={e => setCurrentLine({...currentLine, finca: e.target.value})} className="bg-white border-border rounded-xl" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#7A8798]">Producto *</Label>
                    <Select value={currentLine.productoId} onValueChange={(value) => {
                      const v = value ?? '';
                      const nombre = getNombreProducto(v);
                      setCurrentLine({ ...currentLine, productoId: v, producto: nombre || currentLine.producto });
                    }}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
                        <SelectValue placeholder="Seleccionar producto">
                          {currentLine.productoId ? (productos.find(p => p.id === currentLine.productoId)?.nombre || 'Producto no encontrado') : 'Seleccionar producto'}
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
                    <Label className="text-xs text-[#7A8798]">Producto (texto libre)</Label>
                    <Input placeholder="Producto" value={currentLine.producto} onChange={e => setCurrentLine({...currentLine, producto: e.target.value})} className="bg-white border-border rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#7A8798]">Cantidad *</Label>
                    <Input type="number" step="0.01" placeholder="0" value={currentLine.cantidad} onChange={e => setCurrentLine({...currentLine, cantidad: e.target.value})} className="bg-white border-border rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#7A8798]">Unidad</Label>
                    <Select value={currentLine.unidad} onValueChange={(value) => setCurrentLine({...currentLine, unidad: value ?? 'kg'})}>
                      <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
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
                    <Label className="text-xs text-[#7A8798]">Precio Unit. *</Label>
                    <Input type="number" step="0.01" placeholder="0.00" value={currentLine.precioUnitario} onChange={e => setCurrentLine({...currentLine, precioUnitario: e.target.value})} className="bg-white border-border rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#7A8798]">Comisionistas</Label>
                    <MultiSelectComisionistas
                      comisionistas={comisionistas}
                      selectedIds={currentLine.comisionistaIds}
                      onChange={ids => setCurrentLine({...currentLine, comisionistaIds: ids})}
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button type="button" onClick={handleAddLine} className="btn-primary-dark rounded-xl">
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar línea
                  </Button>
                </div>
              </div>

              {stagedItems.length > 0 && (
                <div className="space-y-4">
                  <div className="bg-[#FAFBFC] rounded-xl p-4 border border-border">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-[#0B1220]">Orden {manualHeader.numeroOrden || '—'}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[#475467]">
                          <span><strong>Fecha:</strong> {manualHeader.fecha}</span>
                          {manualHeader.proveedor && <span><strong>Proveedor:</strong> {manualHeader.proveedor}</span>}
                          {manualSelectedCliente && <span><strong>Cliente:</strong> {manualSelectedCliente.nombre}</span>}
                        </div>
                      </div>
                      <Chip>{stagedItems.length} producto{stagedItems.length !== 1 ? 's' : ''}</Chip>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-border rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-[#FAFBFC] border-b border-border">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-[#475467]">Sector</th>
                          <th className="text-left px-3 py-2 font-medium text-[#475467]">Producto</th>
                          <th className="text-right px-3 py-2 font-medium text-[#475467]">Cantidad</th>
                          <th className="text-right px-3 py-2 font-medium text-[#475467]">Precio Unit.</th>
                          <th className="text-right px-3 py-2 font-medium text-[#475467]">Total</th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F2F4F6]">
                        {stagedItems.map(item => (
                          <tr key={item.id} className="hover:bg-[#FAFBFC] transition-colors">
                            <td className="px-3 py-2 text-[#344054]">{item.finca}</td>
                            <td className="px-3 py-2 text-[#0B1220] font-medium">{item.producto}</td>
                            <td className="px-3 py-2 text-right text-[#344054]">{item.cantidad.toLocaleString('es-ES')} {item.unidad}</td>
                            <td className="px-3 py-2 text-right text-[#344054]">${item.precioUnitario.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium text-[#0B1220]">${item.total.toFixed(2)}</td>
                            <td className="px-3 py-2">
                              <Button variant="ghost" size="icon-xs" onClick={() => removeStagedItem(item.id)} className="text-[#98A2B3] hover:text-[#B91C1C] hover:bg-[#FDECEC]">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={resetManualForm} className="rounded-xl border-border">
                      <X className="h-4 w-4 mr-2" />
                      Descartar
                    </Button>
                    <Button onClick={handleConfirmManual} className="btn-primary-dark rounded-xl">
                      <Check className="h-4 w-4 mr-2" />
                      Confirmar y Agregar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#7A8798]">Cliente (opcional)</Label>
                <Select value={pdfClienteId} onValueChange={(value) => setPdfClienteId(value ?? '')}>
                  <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
                    <span className={`flex flex-1 truncate text-left ${pdfClienteId ? '' : 'text-[#98A2B3]'}`}>
                      {pdfClienteId
                        ? (pdfSelectedCliente?.nombre || 'Cliente no encontrado')
                        : 'Seleccionar cliente para vincular sectores...'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {pdfPreviews.length === 0 ? (
                <>
                  <div
                    className="border-2 border-dashed border-border rounded-2xl p-8 text-center hover:border-slate-400 hover:bg-[#FAFBFC] transition-all cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileUp className="h-10 w-10 text-[#98A2B3] mx-auto mb-3" />
                    <p className="text-sm font-medium text-[#344054]">Haz clic para subir uno o varios PDF o imágenes de órdenes de compra</p>
                    <p className="text-xs text-[#7A8798] mt-1">Soporta órdenes de compra tipo INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  {isProcessingPDF && (
                    <div className="text-center py-4">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-slate-900 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
                      <p className="text-sm text-[#7A8798] mt-2">{uploadType === 'pdf' ? 'Procesando PDF...' : 'Procesando imagen...'}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  {pdfPreviews.map(preview => (
                    <div key={preview.fileName} className="space-y-3">
                      <div className="bg-[#FAFBFC] rounded-xl p-4 border border-border">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-[#0B1220]">{preview.fileName}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[#475467]">
                              <span><strong>Orden:</strong> {preview.numeroOrden}</span>
                              <span><strong>Fecha:</strong> {preview.fecha}</span>
                              {preview.semana && <span><strong>Semana:</strong> {preview.semana}</span>}
                              {preview.proveedor && <span><strong>Proveedor:</strong> {preview.proveedor}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Chip>{preview.items.length} productos</Chip>
                            <Button variant="ghost" size="sm" onClick={() => removePdfPreview(preview.fileName)} className="rounded-lg text-[#7A8798] hover:text-[#B91C1C]">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto border border-border rounded-xl">
                        <table className="w-full text-sm">
                          <thead className="bg-[#FAFBFC] border-b border-border">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-[#475467]">Sector</th>
                              <th className="text-left px-3 py-2 font-medium text-[#475467]">Producto</th>
                              <th className="text-right px-3 py-2 font-medium text-[#475467]">Cantidad</th>
                              <th className="text-right px-3 py-2 font-medium text-[#475467]">Precio Unit.</th>
                              <th className="text-right px-3 py-2 font-medium text-[#475467]">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F2F4F6]">
                            {preview.items.map(item => (
                              <tr key={item.id} className="hover:bg-[#FAFBFC] transition-colors">
                                <td className="px-3 py-2 text-[#344054]">{item.finca}</td>
                                <td className="px-3 py-2 text-[#0B1220] font-medium">{item.producto}</td>
                                <td className="px-3 py-2 text-right text-[#344054]">{item.cantidad.toLocaleString('es-ES')} {item.unidad}</td>
                                <td className="px-3 py-2 text-right text-[#344054]">${item.precioUnitario.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-medium text-[#0B1220]">${item.total.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {isProcessingPDF && (
                    <div className="text-center py-4">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-slate-900 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
                      <p className="text-sm text-[#7A8798] mt-2">{uploadType === 'pdf' ? 'Procesando PDF...' : 'Procesando imagen...'}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleDiscardPDF} className="rounded-xl border-border">
                      <X className="h-4 w-4 mr-2" />
                      Descartar todo
                    </Button>
                    <Button onClick={handleConfirmPDF} disabled={isProcessingPDF} className="btn-primary-dark rounded-xl">
                      <Check className="h-4 w-4 mr-2" />
                      Confirmar y Agregar ({pdfPreviews.reduce((n, p) => n + p.items.length, 0)})
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Barra de filtros del listado */}
      <BarraAcciones>
        <Buscador
          value={search}
          onChange={(v) => {
            setSearch(v);
            setCurrentPage(1);
          }}
          placeholder="Buscar factura, cliente o producto…"
        />
        {ESTADOS_FILTRO.map((e) => (
          <BotonFiltro
            key={e.value}
            activo={filterEstado === e.value}
            contador={conteoPorEstado[e.value]}
            onClick={() => {
              setFilterEstado(e.value);
              setCurrentPage(1);
            }}
          >
            {e.label}
          </BotonFiltro>
        ))}
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-dashed border-[#C6CDD6] bg-white px-3 text-[12.5px] font-medium text-[#475467] transition hover:border-primary hover:text-primary"
        >
          + Filtro
        </button>
        <div className="flex-1" />
        <BotonPrimario onClick={() => setSheetAbierto(true)}>
          <Plus className="size-3.5" /> Nueva factura
        </BotonPrimario>
      </BarraAcciones>

      {/* Chips de filtros activos */}
      {chipsActivos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#7A8798]">Filtros activos:</span>
          {chipsActivos.map((c) => (
            <span
              key={c.label}
              className="inline-flex h-[26px] items-center gap-[7px] rounded-full border border-[#CFE3E0] bg-[#EAF2F1] pl-2.5 pr-1.5 text-xs font-medium text-[#0B5E56]"
            >
              {c.label}
              <button
                type="button"
                onClick={c.quitar}
                aria-label={`Quitar filtro ${c.label}`}
                className="px-0.5 text-[13px] leading-none opacity-60 transition hover:opacity-100"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-[#7A8798] underline"
          >
            Limpiar
          </button>
        </div>
      )}

      {ordenItems.length > 0 && (
        <Panel className="flex flex-col gap-3 p-3.5">
          {showFilters && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-[11.5px] font-semibold text-[#475467]">Fecha desde</Label>
                <Input type="date" value={filterFechaDesde} onChange={e => { setFilterFechaDesde(e.target.value); setCurrentPage(1); }} className="h-9 rounded-[9px] text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11.5px] font-semibold text-[#475467]">Fecha hasta</Label>
                <Input type="date" value={filterFechaHasta} onChange={e => { setFilterFechaHasta(e.target.value); setCurrentPage(1); }} className="h-9 rounded-[9px] text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11.5px] font-semibold text-[#475467]">Comisionista</Label>
                <Select value={filterComisionistaId} onValueChange={v => { setFilterComisionistaId(v ?? 'todos'); setCurrentPage(1); }}>
                  <SelectTrigger className="h-9 rounded-[9px] text-sm">
                    <SelectValue>
                      {etiquetaFiltroComisionista}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los comisionistas</SelectItem>
                    {comisionistas.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <BotonSecundario onClick={collapseAll} className="h-9">Colapsar todo</BotonSecundario>
                <BotonSecundario onClick={expandAll} className="h-9">Expandir todo</BotonSecundario>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 border-t border-[#EDEFF2] pt-3">
            <UserCheck className="size-4 shrink-0 text-[#98A2B3]" />
            <div className="min-w-0 flex-1">
              <Label className="text-[11.5px] font-semibold text-[#475467]">Asignar comisionistas a todas las facturas</Label>
              <div className="mt-1 flex gap-2">
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
                  className="shrink-0 rounded-lg"
                >
                  Asignar
                </Button>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#7A8798]">
                  {cantidadOrdenes} factura{cantidadOrdenes === 1 ? '' : 's'} · {ordenItems.length} productos
                </p>
                <p className="cifra text-xl font-semibold text-[#0B1220]">{money(totalGeneral)}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={hayItemsLiquidados}
                onClick={clearOrdenItems}
                className="rounded-lg text-[#B91C1C] hover:bg-[#FDECEC] disabled:text-[#98A2B3]"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Limpiar
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {ordenesAgrupadas.length > 0 && (
        <Panel>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[#FAFBFC] px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="checkbox"
                  className="size-[15px] cursor-pointer accent-primary"
                  checked={todasSeleccionadas}
                  onChange={toggleSeleccionarTodas}
                  aria-label="Seleccionar todas las facturas"
                />
                <span className="th-tabla">
                  {filteredOrdenItems.length === ordenItems.length
                    ? `${cantidadOrdenes} factura${cantidadOrdenes === 1 ? '' : 's'}`
                    : `${ordenesAgrupadas.length} de ${cantidadOrdenes} factura${cantidadOrdenes === 1 ? '' : 's'}`
                  }
                </span>
                {selectedOrdenIds.size > 0 && (
                  <Select
                    value={null}
                    onValueChange={(value) => value && pedirFechaDePago(value as EstadoOrden, Array.from(selectedOrdenIds), true)}
                  >
                    <SelectTrigger className="btn-primary-dark rounded-lg h-7 text-xs border-0 gap-1 text-white [&_svg]:text-white">
                      <SelectValue>
                        {`Marcar como... (${selectedOrdenIds.size})`}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_ORDEN.filter((estado) => estado.value !== 'liquidada').map((estado) => (
                        <SelectItem key={estado.value} value={estado.value}>
                          {estado.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedOrdenIds.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleEliminarMasivo} className="h-7 text-xs text-[#B91C1C] hover:text-[#991B1B] hover:bg-[#FDECEC] rounded-lg">
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {`Eliminar (${selectedOrdenIds.size})`}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => toggleSort('fecha')} className="h-7 rounded-lg text-xs text-[#6B7684]">
                  <Calendar className="mr-1 h-3.5 w-3.5" />
                  Fecha{sortField === 'fecha' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleSort('numeroOrden')} className="h-7 rounded-lg text-xs text-[#6B7684]">
                  <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
                  №{sortField === 'numeroOrden' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleSort('total')} className="h-7 rounded-lg text-xs text-[#6B7684]">
                  <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
                  Total{sortField === 'total' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                </Button>
              </div>
            </div>

            {/* Cabecera de columnas del listado */}
            <div className={`th-tabla hidden ${COLS_ORDENES} items-center gap-2.5 border-b border-border bg-[#FAFBFC] px-4 py-2.5 lg:grid`}>
              <div />
              <div>Factura</div>
              <div>Fecha</div>
              <div>Cliente</div>
              <div>Razón social</div>
              <div className="text-right">Reg.</div>
              <div className="text-right">Total</div>
              <div>Comisionistas</div>
              <div>Estado</div>
              <div />
            </div>

            <div>
              {paginatedOrdenes.map(orden => {
                const collapsed = !expandedOrdenIds.has(orden.id);
                return (
                  <div key={orden.id} className="group">
                    <div
                      className={`grid ${COLS_ORDENES} cursor-pointer items-center gap-2.5 border-b border-[#F2F4F6] px-4 py-3 transition-colors hover:bg-[#FAFBFC] ${collapsed ? '' : 'bg-[#F7FBFA]'}`}
                      onClick={() => toggleCollapse(orden.id)}
                    >
                      <div>
                        <input
                          type="checkbox"
                          className="size-[15px] cursor-pointer accent-primary align-middle"
                          checked={selectedOrdenIds.has(orden.id)}
                          disabled={orden.estado === 'liquidada'}
                          onChange={() => toggleSeleccionOrden(orden.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Seleccionar factura ${orden.numeroOrden}`}
                        />
                      </div>
                      <div className="cifra truncate text-[12.5px] font-medium text-[#0B1220]">
                        {orden.numeroOrden}
                      </div>
                      <div className="cifra text-[12.5px] text-[#6B7684]">
                        {orden.fecha}
                        {orden.fechaPago && (
                          <span className="ml-1 text-[10.5px] text-primary" title={`Pagada el ${orden.fechaPago}`}>
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[13px] text-[#0B1220]" title={orden.cliente}>
                        {orden.cliente}
                      </div>
                      <div className="truncate text-[12.5px] text-[#6B7684]" title={orden.proveedor}>
                        {orden.proveedor || '—'}
                      </div>
                      <div className="cifra text-right text-[12.5px] text-[#6B7684]">
                        {orden.items.length}
                      </div>
                      <div className="cifra text-right text-[13px] font-semibold text-[#0B1220]">
                        {money(orden.total)}
                      </div>
                      <div className="flex items-center">
                        {orden.comisionistaIds.length === 0 ? (
                          <span className="text-[11px] text-[#98A2B3]">Sin asignar</span>
                        ) : (
                          <>
                            {orden.comisionistaIds.slice(0, 3).map((cid, i) => {
                              const com = comisionistas.find(c => c.id === cid);
                              return com ? (
                                <Avatar
                                  key={cid}
                                  nombre={com.nombre}
                                  id={cid}
                                  className={`border-[1.5px] border-white ${i > 0 ? '-ml-1.5' : ''}`}
                                />
                              ) : null;
                            })}
                            {orden.comisionistaIds.length > 3 && (
                              <span className="cifra -ml-1.5 flex size-6 items-center justify-center rounded-full border-[1.5px] border-white bg-[#F0F2F5] text-[10px] font-semibold text-[#475467]">
                                +{orden.comisionistaIds.length - 3}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <div>
                        <ChipEstado estado={orden.estado} />
                      </div>
                      <div className="text-right text-[11px] text-[#98A2B3]">
                        {collapsed ? '▸' : '▾'}
                      </div>
                    </div>

                    {!collapsed && (
                      <div className="border-b border-[#F2F4F6] bg-[#FBFCFD] px-4 pb-3.5 pt-1 pl-4 lg:pl-[50px]">
                        <div className="overflow-x-auto">
                          <div className="min-w-[720px]">
                            <div className="th-tabla grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_92px_100px_108px_minmax(0,150px)_64px] gap-2.5 px-3 py-2.5">
                              <div>Producto</div>
                              <div>Sector</div>
                              <div className="text-right">Cantidad</div>
                              <div className="text-right">P. unit.</div>
                              <div className="text-right">Total</div>
                              <div className="text-right">Comisionistas</div>
                              <div />
                            </div>
                            {orden.items.map(item => {
                              const grupoBloqueado = orden.estado === 'liquidada' || orden.items.some((ordenItem) => ordenItem.estado === 'liquidada');
                              return (
                                <div
                                  key={item.id}
                                  className="mb-1.5 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_92px_100px_108px_minmax(0,150px)_64px] items-center gap-2.5 rounded-lg border border-[#EDEFF2] bg-white px-3 py-2.5"
                                >
                                  <div className="truncate text-[12.5px] text-[#0B1220]" title={item.productoRel?.nombre || item.producto}>
                                    {item.productoRel?.nombre || item.producto}
                                  </div>
                                  <div className="truncate text-[12.5px] text-[#6B7684]">
                                    {item.fincaRel?.nombre || item.finca}
                                  </div>
                                  <div className="cifra text-right text-[12.5px] text-[#344054]">
                                    {num(item.cantidad, 0)} <span className="text-[11px] text-[#98A2B3]">{item.unidad}</span>
                                  </div>
                                  <div className="cifra text-right text-[12.5px] text-[#6B7684]">
                                    {money(item.precioUnitario)}
                                  </div>
                                  <div className="cifra text-right text-[12.5px] font-medium text-[#0B1220]">
                                    {money(item.total)}
                                  </div>
                                  <div className="flex flex-wrap justify-end gap-1.5">
                                    {item.comisionistas.length === 0 ? (
                                      <span className="text-[11px] text-[#98A2B3]">Sin asignar</span>
                                    ) : (
                                      item.comisionistas.map(a => {
                                        const com = comisionistas.find(c => c.id === a.comisionistaId);
                                        const tieneTarifa = item.clienteId && item.productoId && encontrarTarifaEspecifica(item, a.comisionistaId, tarifasClienteProducto);
                                        const nombre = com?.nombre || a.comisionistaId;
                                        return (
                                          <Chip
                                            key={a.comisionistaId}
                                            tono={tieneTarifa ? 'acento' : 'ambar'}
                                            className="rounded-md font-medium"
                                            title={tieneTarifa ? nombre : `${nombre} — sin tarifa específica configurada`}
                                          >
                                            {nombre.split(' ')[0]}
                                          </Chip>
                                        );
                                      })
                                    )}
                                  </div>
                                  <div className="flex justify-end gap-1">
                                    <Button variant="ghost" size="icon-xs" disabled={grupoBloqueado} className="text-[#98A2B3] hover:text-[#0B1220] disabled:opacity-40" onClick={() => handleEdit(item)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon-xs" disabled={grupoBloqueado} className="text-[#98A2B3] hover:text-[#B91C1C] disabled:opacity-40" onClick={() => deleteOrdenItem(item.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Select
                              value={orden.estado}
                              onValueChange={(value) => pedirFechaDePago(value as EstadoOrden, [orden.id], false, orden.fechaPago)}
                              disabled={orden.estado === 'liquidada' || orden.items.some(item => item.estado === 'liquidada')}
                            >
                              <SelectTrigger className="h-7 w-40 rounded-lg border-border bg-white text-xs">
                                <SelectValue>
                                  {getEtiquetaEstado(orden.estado)}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {ESTADOS_ORDEN.filter((estado) => estado.value !== 'liquidada').map((estado) => (
                                  <SelectItem key={estado.value} value={estado.value}>
                                    {estado.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {orden.estado !== 'pendiente' && (
                              <label className="flex items-center gap-1.5 text-xs text-[#475467]">
                                Pagada el
                                <input
                                  type="date"
                                  value={orden.fechaPago || ''}
                                  disabled={orden.estado === 'liquidada'}
                                  onChange={(e) => e.target.value && updateEstadoOrden(orden.id, orden.estado, e.target.value)}
                                  className="h-7 rounded-lg border border-border bg-white px-2 text-xs text-[#344054] disabled:opacity-50"
                                />
                              </label>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" disabled={orden.estado === 'liquidada' || orden.items.some(item => item.estado === 'liquidada')} className="text-[#B91C1C] hover:text-[#991B1B] hover:bg-[#FDECEC] rounded-lg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-red-300" onClick={() => {
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
              <div className="flex items-center justify-between bg-[#FAFBFC] px-4 py-3">
                <p className="text-xs text-[#7A8798]">
                  Mostrando <span className="cifra text-[#344054]">{(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, ordenesAgrupadas.length)}</span> de <span className="cifra text-[#344054]">{ordenesAgrupadas.length}</span> facturas
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-xs" disabled={safePage === 1} onClick={() => setCurrentPage(p => p - 1)} className="rounded-lg">
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
                      <Button key={page} variant={page === safePage ? 'default' : 'outline'} size="icon-xs" onClick={() => setCurrentPage(page)} className={page === safePage ? 'cifra rounded-lg border-[#0B1220] bg-[#0B1220] text-white' : 'cifra rounded-lg'}>
                        {page}
                      </Button>
                    );
                  })}
                  <Button variant="outline" size="icon-xs" disabled={safePage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="rounded-lg">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}

      {ordenItems.length === 0 && pdfPreviews.length === 0 && (
        <Vacio
          icono={Calculator}
          titulo="Sin facturas cargadas"
          nota="Carga un PDF o una imagen de la factura, o agrega los registros manualmente."
          accion={
            <div className="flex gap-2.5">
              <BotonSecundario onClick={() => { setActiveForm('manual'); setSheetAbierto(true); }}>
                <Plus className="size-3.5" /> Agregar manual
              </BotonSecundario>
              <BotonPrimario onClick={() => { setActiveForm('pdf'); setSheetAbierto(true); }}>
                <FileUp className="size-3.5" /> Cargar archivo
              </BotonPrimario>
            </div>
          }
        />
      )}

      <Dialog open={pagoPendiente !== null} onOpenChange={(abierto) => !abierto && setPagoPendiente(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Cuándo se pagó?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[#475467]">
              {pagoPendiente?.ordenIds.length === 1
                ? `Marcar la orden como ${getEtiquetaEstado(pagoPendiente.estado).toLowerCase()}.`
                : `Marcar ${pagoPendiente?.ordenIds.length} órdenes como ${pagoPendiente ? getEtiquetaEstado(pagoPendiente.estado).toLowerCase() : ''}.`}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="fecha-pago">Fecha de pago</Label>
              <Input
                id="fecha-pago"
                type="date"
                required
                value={fechaPagoInput}
                onChange={(e) => setFechaPagoInput(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setPagoPendiente(null)}>Cancelar</Button>
              <Button className="btn-primary-dark" disabled={!fechaPagoInput} onClick={confirmarFechaDePago}>
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Registro</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#7A8798]">Fecha</Label>
                <Input type="date" value={editForm.fecha || ''} onChange={e => setEditForm({...editForm, fecha: e.target.value})} className="bg-white border-border rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#7A8798]">Factura/Orden</Label>
                <Input value={editForm.numeroOrden || ''} onChange={e => setEditForm({...editForm, numeroOrden: e.target.value})} className="bg-white border-border rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#7A8798]">Cliente</Label>
                <Select value={editForm.clienteId || ''} onValueChange={(value) => {
                  const cliente = clientes.find(c => c.id === value);
                  setEditForm({
                    ...editForm,
                    clienteId: value || undefined,
                    fincaId: undefined,
                    finca: cliente?.tipo === 'individual' ? cliente.nombre : editForm.finca,
                  });
                }}>
                  <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
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
                  <Label className="text-xs text-[#7A8798]">Sector</Label>
                  <EditFincaSelect
                    clienteId={editForm.clienteId || ''}
                    value={editForm.fincaId || ''}
                    onChange={(value, nombre) => setEditForm({ ...editForm, fincaId: value || undefined, finca: nombre || editForm.finca })}
                  />
                </div>
              )}
              {!(clientes.find(c => c.id === editForm.clienteId)?.tipo === 'grupo') && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#7A8798]">Sector</Label>
                  <Input value={editForm.finca || ''} onChange={e => setEditForm({...editForm, finca: e.target.value})} className="bg-white border-border rounded-xl" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-[#7A8798]">Producto</Label>
                <Select value={editForm.productoId || ''} onValueChange={(value) => {
                  const nombre = productos.find(p => p.id === value)?.nombre;
                  setEditForm({ ...editForm, productoId: value || undefined, producto: nombre || editForm.producto });
                }}>
                  <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
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
                <Label className="text-xs text-[#7A8798]">Producto (texto libre)</Label>
                <Input value={editForm.producto || ''} onChange={e => setEditForm({...editForm, producto: e.target.value})} className="bg-white border-border rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#7A8798]">Cantidad</Label>
                <Input type="number" step="0.01" value={editForm.cantidad || ''} onChange={e => setEditForm({...editForm, cantidad: parseFloat(e.target.value) || 0})} className="bg-white border-border rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#7A8798]">Unidad</Label>
                <Select value={editForm.unidad || 'kg'} onValueChange={(value) => setEditForm({...editForm, unidad: value ?? 'kg'})}>
                  <SelectTrigger className="w-full rounded-xl border-border bg-white h-10 text-sm text-[#0B1220]">
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
                <Label className="text-xs text-[#7A8798]">Precio Unit.</Label>
                <Input type="number" step="0.01" value={editForm.precioUnitario || ''} onChange={e => setEditForm({...editForm, precioUnitario: parseFloat(e.target.value) || 0})} className="bg-white border-border rounded-xl" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-[#7A8798]">Comisionistas</Label>
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
              <Button variant="outline" onClick={() => setEditOpen(false)} className="rounded-xl border-border">Cancelar</Button>
              <Button onClick={handleSaveEdit} className="btn-primary-dark rounded-xl">Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
