'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Filter,
  FileText,
  FileSpreadsheet,
  BarChart3,
  DollarSign,
  Package,
  Users,
  TrendingUp,
  CalendarDays,
  MapPin,
  Fish,
  UserCheck,
  GitCompare,
  LineChart,
  ChevronDown,
  Play,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { OrdenItem, TarifaClienteProducto } from '@/types';
import { fetchOrdenes, fetchTarifasClienteProducto } from '@/lib/api';
import {
  filtrarItems,
  agruparPorFinca,
  agruparPorProducto,
  agruparPorComisionista,
  agruparPorCliente,
  trimestreRango,
  semestreRango,
  anioRango,
  exportarReportePDF,
  exportarReporteExcel,
  calcularComisionTotalItem,
} from '@/lib/export-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

// Selector multi con buscador para listas grandes (productos, comisionistas).
function MultiSelect({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Posición del panel: se renderiza en un portal a document.body con position:fixed
  // para escapar de cualquier overflow/stacking de las tarjetas (bug de z-index).
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const actualizar = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    actualizar();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', actualizar, true);
    window.addEventListener('resize', actualizar);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', actualizar, true);
      window.removeEventListener('resize', actualizar);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const filtradas = query
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  };

  const resumen = selected.length === 0
    ? 'Todos'
    : selected.length === 1
    ? selected[0]
    : `${selected.length} seleccionados`;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-500 flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </Label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-left"
      >
        <span className={`truncate ${selected.length ? 'text-slate-800' : 'text-slate-400'}`}>{resumen}</span>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
      </button>
      {open && coords && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 1000 }}
          className="min-w-[220px] rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="w-full h-8 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtradas.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-slate-400">Sin resultados</div>
            ) : (
              filtradas.map(opt => (
                <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-slate-100 flex justify-between">
              <button type="button" onClick={() => onChange([])} className="text-xs text-slate-500 hover:text-slate-700">Limpiar selección</button>
              <span className="text-xs text-slate-400">{selected.length} de {options.length}</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export function ReportesTab() {
  const { comisionistas } = useApp();

  const now = useMemo(() => new Date(), []);
  const anioActual = now.getFullYear();
  const trimActual = Math.floor(now.getMonth() / 3) + 1;
  // Años seleccionables: los últimos 4 hasta el actual (cubre todo el histórico real).
  const aniosDisponibles = useMemo(
    () => Array.from({ length: 5 }, (_, i) => anioActual - i),
    [anioActual]
  );

  // ponytail: sin rango por defecto para no ocultar liquidaciones fuera del trimestre
  // actual; el usuario acota con el selector de periodo. Si el histórico crece mucho,
  // poner un default tipo "año actual" en vez de traer todo.
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [anioSel, setAnioSel] = useState(anioActual);
  const [fincasSel, setFincasSel] = useState<string[]>([]);
  const [productosSel, setProductosSel] = useState<string[]>([]);
  const [comisionistasSel, setComisionistasSel] = useState<string[]>([]);
  const [clientesSel, setClientesSel] = useState<string[]>([]);

  // Comparación de periodos (feature "comparar trimestres"). B siempre es un trimestre.
  const [comparar, setComparar] = useState(false);
  const [anioB, setAnioB] = useState(anioActual);
  const [trimB, setTrimB] = useState(trimActual);

  // Filtros APLICADOS: solo cambian al pulsar "Generar reporte" (el usuario no confía
  // en el filtrado automático). Todo el reporte se deriva de aquí, no del borrador.
  const [aplicado, setAplicado] = useState({
    fechaDesde: '',
    fechaHasta: '',
    clientes: [] as string[],
    fincas: [] as string[],
    productos: [] as string[],
    comisionistas: [] as string[],
    comparar: false,
    anioB: anioActual,
    trimB: trimActual,
  });

  const generar = () => setAplicado({
    fechaDesde, fechaHasta,
    clientes: clientesSel, fincas: fincasSel, productos: productosSel, comisionistas: comisionistasSel,
    comparar, anioB, trimB,
  });

  const limpiar = () => {
    setFechaDesde(''); setFechaHasta('');
    setFincasSel([]); setProductosSel([]); setComisionistasSel([]); setClientesSel([]);
    setComparar(false);
    setAplicado({ fechaDesde: '', fechaHasta: '', clientes: [], fincas: [], productos: [], comisionistas: [], comparar: false, anioB: anioActual, trimB: trimActual });
  };

  const draftActual = { fechaDesde, fechaHasta, clientes: clientesSel, fincas: fincasSel, productos: productosSel, comisionistas: comisionistasSel, comparar, anioB, trimB };
  const hayCambios = JSON.stringify(draftActual) !== JSON.stringify(aplicado);

  // Trimestre actualmente aplicado en A (para reflejarlo en el selector), o '' si es
  // un rango custom / sin filtro.
  const trimAplicado = useMemo(() => {
    for (let t = 1; t <= 4; t++) {
      const r = trimestreRango(anioSel, t);
      if (r.inicio === fechaDesde && r.fin === fechaHasta) return String(t);
    }
    return '';
  }, [anioSel, fechaDesde, fechaHasta]);

  const aplicarTrimestre = (t: number) => {
    const r = trimestreRango(anioSel, t);
    setFechaDesde(r.inicio);
    setFechaHasta(r.fin);
  };

  const { data: ordenesData } = useQuery({
    queryKey: ['ordenes', 'reportes', aplicado.fechaDesde, aplicado.fechaHasta],
    queryFn: () => fetchOrdenes({
      fechaDesde: aplicado.fechaDesde || undefined,
      fechaHasta: aplicado.fechaHasta || undefined,
    }),
  });

  const { data: tarifasData } = useQuery({
    queryKey: ['tarifas-cliente-producto', 'reportes'],
    queryFn: () => fetchTarifasClienteProducto(),
  });

  const ordenItems: OrdenItem[] = (ordenesData ?? []).filter((item: OrdenItem) => item.estado === 'liquidada');
  const tarifasEspecificas: TarifaClienteProducto[] = tarifasData ?? [];

  const fincasUnicas = useMemo(() =>
    Array.from(new Set(ordenItems.map(i => i.fincaRel?.nombre || i.finca).filter(Boolean))).sort(),
    [ordenItems]
  );

  const productosUnicos = useMemo(() =>
    Array.from(new Set(ordenItems.map(i => i.productoRel?.nombre || i.producto).filter(Boolean))).sort(),
    [ordenItems]
  );

  const clientesUnicos = useMemo(() =>
    Array.from(new Set(ordenItems.map(i => i.cliente?.nombre).filter(Boolean) as string[])).sort(),
    [ordenItems]
  );

  const comisionistaNombreAId = (nombre: string) => comisionistas.find(c => c.nombre === nombre)?.id || '';

  const filtros = useMemo(() => ({
    fechaDesde: aplicado.fechaDesde,
    fechaHasta: aplicado.fechaHasta,
    fincas: aplicado.fincas,
    productos: aplicado.productos,
    comisionistas: aplicado.comisionistas.map(comisionistaNombreAId).filter(Boolean),
    clientes: aplicado.clientes,
  }), [aplicado, comisionistas]);

  const itemsFiltrados = useMemo(() =>
    filtrarItems(ordenItems, filtros),
    [ordenItems, filtros]
  );

  const resumenFincas = useMemo(() => agruparPorFinca(itemsFiltrados, comisionistas, tarifasEspecificas), [itemsFiltrados, comisionistas, tarifasEspecificas]);
  const resumenProductos = useMemo(() => agruparPorProducto(itemsFiltrados, comisionistas, tarifasEspecificas), [itemsFiltrados, comisionistas, tarifasEspecificas]);
  const resumenComisionistas = useMemo(() => agruparPorComisionista(itemsFiltrados, comisionistas, tarifasEspecificas, filtros.comisionistas), [itemsFiltrados, comisionistas, tarifasEspecificas, filtros.comisionistas]);
  const resumenClientes = useMemo(() => agruparPorCliente(itemsFiltrados, comisionistas, tarifasEspecificas), [itemsFiltrados, comisionistas, tarifasEspecificas]);

  const totalOrden = itemsFiltrados.reduce((s, i) => s + i.total, 0);
  const totalComision = itemsFiltrados.reduce((s, i) => s + calcularComisionTotalItem(i, comisionistas, tarifasEspecificas), 0);
  // Total de la tabla "Por Comisionista": suma solo las filas mostradas (importa al
  // filtrar por comisionista). Sin filtro coincide con totalComision.
  const totalComisionComisionistas = resumenComisionistas.reduce((s, c) => s + c.totalComision, 0);
  const comisionistasInvolucrados = new Set(
    itemsFiltrados.flatMap(i => i.comisionistas.map(a => a.comisionistaId))
  ).size;

  // ----- Periodo B (comparación) -----
  const rangoB = useMemo(() => trimestreRango(aplicado.anioB, aplicado.trimB), [aplicado.anioB, aplicado.trimB]);

  const { data: ordenesDataB } = useQuery({
    queryKey: ['ordenes', 'reportes-b', rangoB.inicio, rangoB.fin],
    queryFn: () => fetchOrdenes({ fechaDesde: rangoB.inicio, fechaHasta: rangoB.fin }),
    enabled: aplicado.comparar,
  });

  const ordenItemsB: OrdenItem[] = (ordenesDataB ?? []).filter((item: OrdenItem) => item.estado === 'liquidada');
  // B usa los mismos filtros no-temporales que A, con su propio rango.
  const filtrosB = useMemo(() => ({ ...filtros, fechaDesde: rangoB.inicio, fechaHasta: rangoB.fin }), [filtros, rangoB]);
  const itemsFiltradosB = useMemo(() => filtrarItems(ordenItemsB, filtrosB), [ordenItemsB, filtrosB]);
  const resumenComisionistasB = useMemo(() => agruparPorComisionista(itemsFiltradosB, comisionistas, tarifasEspecificas, filtrosB.comisionistas), [itemsFiltradosB, comisionistas, tarifasEspecificas, filtrosB.comisionistas]);
  const totalComisionB = itemsFiltradosB.reduce((s, i) => s + calcularComisionTotalItem(i, comisionistas, tarifasEspecificas), 0);
  const totalOrdenB = itemsFiltradosB.reduce((s, i) => s + i.total, 0);

  const variacion = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100);

  // Comisión A vs B por comisionista (unión de ambos periodos).
  const comparativaComisionistas = useMemo(() => {
    const mapB = new Map(resumenComisionistasB.map(c => [c.nombre, c.totalComision]));
    const nombres = new Set<string>([...resumenComisionistas.map(c => c.nombre), ...resumenComisionistasB.map(c => c.nombre)]);
    return Array.from(nombres).map(nombre => {
      const a = resumenComisionistas.find(c => c.nombre === nombre)?.totalComision ?? 0;
      const b = mapB.get(nombre) ?? 0;
      return { nombre, a, b, delta: variacion(a, b) };
    }).sort((x, y) => y.a - x.a);
  }, [resumenComisionistas, resumenComisionistasB]);

  // ----- Tendencia mensual (feature "más desglose") -----
  const tendenciaMensual = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of itemsFiltrados) {
      const mes = (i.fecha || '').slice(0, 7); // YYYY-MM
      if (!mes) continue;
      map.set(mes, (map.get(mes) || 0) + calcularComisionTotalItem(i, comisionistas, tarifasEspecificas));
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, comision]) => ({ mes, comision: Math.round(comision * 100) / 100 }));
  }, [itemsFiltrados, comisionistas, tarifasEspecificas]);

  const handleExportPDF = () => {
    if (itemsFiltrados.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    exportarReportePDF(itemsFiltrados, comisionistas, 'Reporte_Comisiones', filtros, tarifasEspecificas);
    toast.success('PDF generado');
  };

  const handleExportExcel = () => {
    if (itemsFiltrados.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    exportarReporteExcel(itemsFiltrados, comisionistas, 'Reporte_Comisiones', filtros, tarifasEspecificas);
    toast.success('Excel generado');
  };

  const chartData = resumenFincas.length > 0
    ? resumenFincas.map(f => ({ name: f.nombre.length > 14 ? f.nombre.slice(0, 14) + '…' : f.nombre, comision: Math.round(f.comision * 100) / 100 }))
    : resumenProductos.length > 0
    ? resumenProductos.map(p => ({ name: p.nombre.length > 14 ? p.nombre.slice(0, 14) + '…' : p.nombre, comision: Math.round(p.comision * 100) / 100 }))
    : [];

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card className="card-elevated rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-slate-900">
            <Filter className="h-4 w-4 text-slate-700" />
            Filtros del Reporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Desde
              </Label>
              <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="bg-white border-slate-200 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Hasta
              </Label>
              <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="bg-white border-slate-200 rounded-xl" />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Año</Label>
                <select
                  value={anioSel}
                  onChange={e => setAnioSel(Number(e.target.value))}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700"
                >
                  {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Trimestre</Label>
                <select
                  value={trimAplicado}
                  onChange={e => { if (e.target.value) aplicarTrimestre(Number(e.target.value)); }}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700"
                >
                  <option value="">—</option>
                  <option value="1">T1 · Ene–Mar</option>
                  <option value="2">T2 · Abr–Jun</option>
                  <option value="3">T3 · Jul–Sep</option>
                  <option value="4">T4 · Oct–Dic</option>
                </select>
              </div>
              <Button variant="outline" size="sm" onClick={() => { const r = anioRango(anioSel); setFechaDesde(r.inicio); setFechaHasta(r.fin); }} className="rounded-lg border-slate-200 text-slate-600">Año {anioSel}</Button>
              <Button variant="outline" size="sm" onClick={() => { const r = semestreRango(anioSel, 1); setFechaDesde(r.inicio); setFechaHasta(r.fin); }} className="rounded-lg border-slate-200 text-slate-600">S1</Button>
              <Button variant="outline" size="sm" onClick={() => { const r = semestreRango(anioSel, 2); setFechaDesde(r.inicio); setFechaHasta(r.fin); }} className="rounded-lg border-slate-200 text-slate-600">S2</Button>
              <Button variant="outline" size="sm" onClick={limpiar} className="rounded-lg border-slate-200 text-slate-600">Limpiar</Button>
            </div>
          </div>

          {/* Comparar periodos */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer w-fit">
              <input type="checkbox" checked={comparar} onChange={e => setComparar(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              <GitCompare className="h-4 w-4 text-slate-500" />
              Comparar con otro trimestre
            </label>
            {comparar && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Año (B)</Label>
                  <select value={anioB} onChange={e => setAnioB(Number(e.target.value))} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700">
                    {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Trimestre (B)</Label>
                  <select value={trimB} onChange={e => setTrimB(Number(e.target.value))} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700">
                    <option value={1}>T1 · Ene–Mar</option>
                    <option value={2}>T2 · Abr–Jun</option>
                    <option value={3}>T3 · Jul–Sep</option>
                    <option value={4}>T4 · Oct–Dic</option>
                  </select>
                </div>
                <span className="text-xs text-slate-400 pb-2">Compara el periodo A (arriba) contra B.</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
            <MultiSelect label="Clientes" icon={Users} options={clientesUnicos} selected={clientesSel} onChange={setClientesSel} />
            <MultiSelect label="Sectores" icon={MapPin} options={fincasUnicas} selected={fincasSel} onChange={setFincasSel} />
            <MultiSelect label="Productos" icon={Fish} options={productosUnicos} selected={productosSel} onChange={setProductosSel} />
            <MultiSelect label="Comisionistas" icon={UserCheck} options={comisionistas.map(c => c.nombre)} selected={comisionistasSel} onChange={setComisionistasSel} />
          </div>

          {/* Generar: el reporte no se actualiza hasta pulsar este botón */}
          <div className="mt-4 flex items-center justify-end gap-3">
            {hayCambios && <span className="text-xs text-amber-600">Hay cambios sin aplicar</span>}
            <Button onClick={generar} className="rounded-xl bg-slate-900 text-white hover:bg-slate-800">
              <Play className="h-4 w-4 mr-2" />
              Generar reporte
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Package className="h-3.5 w-3.5" />
              Registros liquidados
            </div>
            <p className="text-2xl font-bold text-slate-900">{itemsFiltrados.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Users className="h-3.5 w-3.5" />
              Comisionistas
            </div>
            <p className="text-2xl font-bold text-slate-900">{comisionistasInvolucrados}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              Total Orden
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">${totalOrden.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 text-white rounded-2xl border-0 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Comisión Total
            </div>
            <p className="text-2xl font-bold tabular-nums">${totalComision.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Comparación de periodos */}
      {aplicado.comparar && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">
                Comparación — A ({aplicado.fechaDesde || 'todo'} → {aplicado.fechaHasta || 'todo'}) vs B (T{aplicado.trimB} {aplicado.anioB})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'Registros', a: itemsFiltrados.length, b: itemsFiltradosB.length, money: false },
                { label: 'Total Orden', a: totalOrden, b: totalOrdenB, money: true },
                { label: 'Comisión Total', a: totalComision, b: totalComisionB, money: true },
              ].map(m => {
                const d = variacion(m.a, m.b);
                const fmt = (v: number) => (m.money ? `$${v.toFixed(2)}` : String(v));
                return (
                  <div key={m.label} className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs text-slate-500 mb-1">{m.label}</div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-lg font-bold text-slate-900 tabular-nums">{fmt(m.a)}</span>
                      <span className="text-xs text-slate-400">vs {fmt(m.b)}</span>
                    </div>
                    <div className={`text-xs font-medium ${d >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Comisionista</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">A</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">B</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Variación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparativaComisionistas.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No hay datos</td></tr>
                  ) : comparativaComisionistas.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2 text-slate-900 font-medium">{c.nombre}</td>
                      <td className="px-4 py-2 text-right text-slate-700">${c.a.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-slate-700">${c.b.toFixed(2)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${c.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {c.delta >= 0 ? '▲' : '▼'} {Math.abs(c.delta).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleExportPDF} className="rounded-xl border-slate-200">
          <FileText className="h-4 w-4 mr-2 text-red-500" />
          Exportar PDF
        </Button>
        <Button variant="outline" onClick={handleExportExcel} className="rounded-xl border-slate-200">
          <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />
          Exportar Excel
        </Button>
      </div>

      {/* Gráfico */}
      {chartData.length > 0 && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">
                Comisión por {resumenFincas.length > 0 ? 'Sector' : 'Producto'}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${v.toLocaleString('es-ES')}`}
                  />
                  <Tooltip
                    formatter={(value: any) => {
                      const num = typeof value === 'number' ? value : Number(value);
                      return [`$${num.toFixed(2)}`, 'Comisión'];
                    }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="comision" fill="#0f172a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tendencia mensual */}
      {tendenciaMensual.length > 0 && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">Tendencia mensual de comisión</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tendenciaMensual} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toLocaleString('es-ES')}`} />
                  <Tooltip
                    formatter={(value: any) => {
                      const num = typeof value === 'number' ? value : Number(value);
                      return [`$${num.toFixed(2)}`, 'Comisión'];
                    }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="comision" fill="#0f172a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tablas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por Cliente */}
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">Por Cliente</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Cliente</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Órdenes</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Cantidad</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumenClientes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No hay datos</td>
                    </tr>
                  ) : (
                    resumenClientes.map((c, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2 text-slate-900 font-medium">{c.nombre}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{c.ordenes}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{c.cantidad.toLocaleString('es-ES')}</td>
                        <td className="px-4 py-2 text-right text-slate-700">${c.total.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">${c.comision.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {resumenClientes.length > 0 && (
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-2 font-medium text-slate-700">Totales</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenClientes.reduce((s, c) => s + c.ordenes, 0)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenClientes.reduce((s, c) => s + c.cantidad, 0).toLocaleString('es-ES')}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenClientes.reduce((s, c) => s + c.total, 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenClientes.reduce((s, c) => s + c.comision, 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Por Sector */}
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">Por Sector</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Sector</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Órdenes</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Cantidad</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumenFincas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No hay datos</td>
                    </tr>
                  ) : (
                    resumenFincas.map((f, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2 text-slate-900 font-medium">{f.nombre}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{f.ordenes}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{f.cantidad.toLocaleString('es-ES')}</td>
                        <td className="px-4 py-2 text-right text-slate-700">${f.total.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">${f.comision.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {resumenFincas.length > 0 && (
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-2 font-medium text-slate-700">Totales</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenFincas.reduce((s, f) => s + f.ordenes, 0)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenFincas.reduce((s, f) => s + f.cantidad, 0).toLocaleString('es-ES')}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenFincas.reduce((s, f) => s + f.total, 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenFincas.reduce((s, f) => s + f.comision, 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Por Producto */}
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Fish className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-base text-slate-900">Por Producto</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Producto</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Órdenes</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Cantidad</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumenProductos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No hay datos</td>
                    </tr>
                  ) : (
                    resumenProductos.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2 text-slate-900 font-medium">{p.nombre}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{p.ordenes}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{p.cantidad.toLocaleString('es-ES')}</td>
                        <td className="px-4 py-2 text-right text-slate-700">${p.total.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">${p.comision.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {resumenProductos.length > 0 && (
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-2 font-medium text-slate-700">Totales</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenProductos.reduce((s, p) => s + p.ordenes, 0)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">{resumenProductos.reduce((s, p) => s + p.cantidad, 0).toLocaleString('es-ES')}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenProductos.reduce((s, p) => s + p.total, 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-900">${resumenProductos.reduce((s, p) => s + p.comision, 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Por Comisionista */}
      <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base text-slate-900">Por Comisionista</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Comisionista</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Tarifas</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Órdenes</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Total Orden</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Comisión</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">% del total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resumenComisionistas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No hay datos</td>
                  </tr>
                ) : (
                  resumenComisionistas.map((c, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-900 font-medium">{c.nombre}</td>
                      <td className="px-4 py-3 text-slate-500">{c.tarifas}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{c.ordenes}</td>
                      <td className="px-4 py-3 text-right text-slate-700">${c.totalOrden.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">${c.totalComision.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {totalComisionComisionistas > 0 ? ((c.totalComision / totalComisionComisionistas) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {resumenComisionistas.length > 0 && (
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-medium text-slate-700">Totales</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{resumenComisionistas.reduce((s, c) => s + c.ordenes, 0)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">${resumenComisionistas.reduce((s, c) => s + c.totalOrden, 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">${totalComisionComisionistas.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
