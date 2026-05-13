'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Upload, Trash2, Pencil, UserCheck, Calculator, FileUp, Check, X, Sparkles, Search, ChevronDown } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { OrdenItem } from '@/types';
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
import { extractOrdenFromPDF } from '@/lib/pdf-extractor';
import { generarId } from '@/lib/id';

function MultiSelectComisionistas({
  comisionistas,
  selectedIds,
  onChange,
  placeholder = 'Seleccionar comisionistas...',
}: {
  comisionistas: { id: string; nombre: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
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
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(sid => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 hover:border-slate-300 transition-colors"
      >
        <span className={selectedIds.length === 0 ? 'text-slate-400' : ''}>
          {selectedIds.length === 0
            ? placeholder
            : `${selectedIds.length} seleccionado${selectedIds.length > 1 ? 's' : ''}`}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
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

export function OrdenesTab() {
  const { comisionistas, ordenItems, addOrdenItems, updateOrdenItem, deleteOrdenItem, clearOrdenItems, assignComisionistasGlobal } = useApp();
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

  const [form, setForm] = useState({
    fecha: '',
    numeroOrden: '',
    finca: '',
    producto: '',
    cantidad: '',
    unidad: 'kg',
    precioUnitario: '',
    comisionistaIds: [] as string[],
  });

  useEffect(() => {
    setForm(prev => ({ ...prev, fecha: new Date().toISOString().slice(0, 10) }));
  }, []);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<OrdenItem>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOrdenItems = useMemo(() => {
    if (!search.trim()) return ordenItems;
    const q = search.toLowerCase();
    return ordenItems.filter(item =>
      item.producto.toLowerCase().includes(q) ||
      item.numeroOrden.toLowerCase().includes(q) ||
      item.finca.toLowerCase().includes(q) ||
      item.comisionistas.some(a => comisionistas.find(c => c.id === a.comisionistaId)?.nombre.toLowerCase().includes(q))
    );
  }, [ordenItems, search, comisionistas]);

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
    };
    addOrdenItems([item]);
    resetForm();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Solo se permiten archivos PDF');
      return;
    }

    setIsProcessingPDF(true);
    try {
      const result = await extractOrdenFromPDF(file);
      setPdfPreview({
        fileName: file.name,
        fecha: result.fecha,
        numeroOrden: result.numeroOrden,
        proveedor: result.proveedor,
        semana: result.semana,
        items: result.items,
      });
      toast.success(`${result.items.length} productos extraídos del PDF`);
    } catch (err) {
      console.error(err);
      toast.error('Error al procesar el PDF. Verifica que sea una orden de compra válida.');
    } finally {
      setIsProcessingPDF(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmPDF = () => {
    if (!pdfPreview || pdfPreview.items.length === 0) return;
    addOrdenItems(pdfPreview.items);
    setPdfPreview(null);
  };

  const handleDiscardPDF = () => {
    setPdfPreview(null);
  };

  const handleEdit = (item: OrdenItem) => {
    setEditingId(item.id);
    setEditForm({ ...item });
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    if (editForm.cantidad && editForm.precioUnitario) {
      editForm.total = editForm.cantidad * editForm.precioUnitario;
    }
    updateOrdenItem(editingId, editForm);
    setEditOpen(false);
    setEditingId(null);
  };

  const totalGeneral = ordenItems.reduce((s, i) => s + i.total, 0);

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
              Cargar PDF
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
                <Label className="text-xs text-slate-500">Finca / Sector</Label>
                <Input placeholder="Finca A" value={form.finca} onChange={e => setForm({...form, finca: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Producto *</Label>
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
              {!pdfPreview ? (
                <>
                  <div
                    className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-slate-400 hover:bg-slate-50 transition-all cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileUp className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">Haz clic para subir el PDF de la orden de compra</p>
                    <p className="text-xs text-slate-500 mt-1">Soporta órdenes de compra tipo INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setIsProcessingPDF(true);
                        try {
                          const res = await fetch('/orden-demo.pdf');
                          const blob = await res.blob();
                          const file = new File([blob], 'orden-demo.pdf', { type: 'application/pdf' });
                          const result = await extractOrdenFromPDF(file);
                          setPdfPreview({
                            fileName: file.name,
                            fecha: result.fecha,
                            numeroOrden: result.numeroOrden,
                            proveedor: result.proveedor,
                            semana: result.semana,
                            items: result.items,
                          });
                          toast.success(`${result.items.length} productos extraídos del PDF de ejemplo`);
                        } catch (err) {
                          console.error(err);
                          toast.error('Error al cargar el PDF de ejemplo');
                        } finally {
                          setIsProcessingPDF(false);
                        }
                      }}
                      className="rounded-xl border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    >
                      <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
                      Cargar orden de ejemplo
                    </Button>
                  </div>
                  {isProcessingPDF && (
                    <div className="text-center py-4">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-slate-900 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
                      <p className="text-sm text-slate-500 mt-2">Procesando PDF...</p>
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar producto, factura..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-white border-slate-200 rounded-xl text-sm"
            />
          </div>
          <div className="flex items-center gap-3 flex-1">
            <UserCheck className="h-5 w-5 text-slate-400" />
            <div className="flex-1 min-w-0">
              <Label className="text-xs text-slate-500">Asignar comisionistas a todos</Label>
              <div className="flex gap-2 mt-1">
                <MultiSelectComisionistas
                  comisionistas={comisionistas}
                  selectedIds={globalComisionistaIds}
                  onChange={setGlobalComisionistaIds}
                  placeholder="Seleccionar..."
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (globalComisionistaIds.length === 0) {
                      toast.error('Selecciona al menos un comisionista');
                      return;
                    }
                    assignComisionistasGlobal(globalComisionistaIds);
                  }}
                  className="border-slate-200 rounded-lg shrink-0"
                >
                  Asignar
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-slate-500">Total Orden</p>
              <p className="text-xl font-bold text-slate-900 tabular-nums">${totalGeneral.toFixed(2)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={clearOrdenItems} className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border-slate-200">
              <Trash2 className="h-4 w-4 mr-1" />
              Limpiar
            </Button>
          </div>
        </div>
      )}

      {ordenItems.length > 0 && (
        <Card className="card-elevated rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Factura</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Finca</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Producto</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Cantidad</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Precio</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Comisionistas</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600 w-20">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrdenItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-500">{item.fecha}</td>
                      <td className="px-4 py-3 text-slate-900 font-medium">{item.numeroOrden}</td>
                      <td className="px-4 py-3 text-slate-500">{item.finca}</td>
                      <td className="px-4 py-3 text-slate-700">{item.producto}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {item.cantidad.toLocaleString('es-ES')} <span className="text-xs text-slate-400">{item.unidad}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">${item.precioUnitario.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">${item.total.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {item.comisionistas.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.comisionistas.map(a => {
                              const com = comisionistas.find(c => c.id === a.comisionistaId);
                              return com ? (
                                <Badge key={a.comisionistaId} variant="secondary" className="text-xs bg-slate-100 text-slate-700 border-0">
                                  {com.nombre}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" onClick={() => handleEdit(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={() => deleteOrdenItem(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              Cargar PDF
            </Button>
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
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
                <Label className="text-xs text-slate-500">Finca</Label>
                <Input value={editForm.finca || ''} onChange={e => setEditForm({...editForm, finca: e.target.value})} className="bg-white border-slate-200 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Producto</Label>
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
