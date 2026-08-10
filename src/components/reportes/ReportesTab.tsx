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
  FileText,
  FileSpreadsheet,
  DollarSign,
  Package,
  Users,
  TrendingUp,
  MapPin,
  Fish,
  UserCheck,
  GitCompare,
  ChevronDown,
  Play,
} from 'lucide-react';
import {
  BarraProgreso,
  BotonFiltro,
  BotonPrimario,
  BotonSecundario,
  Panel,
  PanelTitulo,
  Segmentado,
  money,
  num,
} from '@/components/ui/dc';
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
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const DIMENSIONES = [
  { valor: 'cliente', label: 'Cliente' },
  { valor: 'sector', label: 'Sector' },
  { valor: 'producto', label: 'Producto' },
  { valor: 'comisionista', label: 'Comisionista' },
] as const;

type Dimension = (typeof DIMENSIONES)[number]['valor'];

const COLS_DESGLOSE = 'grid-cols-[minmax(0,1.6fr)_90px_120px_130px_130px_150px]';

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
      <Label className="flex items-center gap-1 text-[11.5px] font-semibold text-[#475467]">
        <Icon className="h-3 w-3" />
        {label}
      </Label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-[9px] border border-[#E0E4E9] bg-white px-2.5 text-left text-[12.5px]"
      >
        <span className={`truncate ${selected.length ? 'text-[#0B1220]' : 'text-[#98A2B3]'}`}>{resumen}</span>
        <ChevronDown className="size-3.5 shrink-0 text-[#98A2B3]" />
      </button>
      {open && coords && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 1000 }}
          className="min-w-[220px] rounded-xl border border-border bg-white shadow-lg"
        >
          <div className="p-2 border-b border-[#EDEFF2]">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="w-full h-8 rounded-lg border border-border px-2 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtradas.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-[#98A2B3]">Sin resultados</div>
            ) : (
              filtradas.map(opt => (
                <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#FAFBFC] cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="h-4 w-4 rounded border-[#C6CDD6]"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-[#EDEFF2] flex justify-between">
              <button type="button" onClick={() => onChange([])} className="text-xs text-[#7A8798] hover:text-[#344054]">Limpiar selección</button>
              <span className="text-xs text-[#98A2B3]">{selected.length} de {options.length}</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export function ReportesTab() {
  const { comisionistas, retenciones } = useApp();

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

  // Dimensión del desglose (una sola tabla conmutada, como en el prototipo).
  const [dimension, setDimension] = useState<Dimension>('cliente');

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

  // retenciones se agrega a las dependencias porque agruparPor* calcula comisiones vía
  // calcularComisionTotalItem, que lee el estado de módulo de export-utils que
  // retenciones puebla; sin esto el memo no se recalcula cuando llegan los periodos.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resumenFincas = useMemo(() => agruparPorFinca(itemsFiltrados, comisionistas, tarifasEspecificas), [itemsFiltrados, comisionistas, tarifasEspecificas, retenciones]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resumenProductos = useMemo(() => agruparPorProducto(itemsFiltrados, comisionistas, tarifasEspecificas), [itemsFiltrados, comisionistas, tarifasEspecificas, retenciones]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resumenComisionistas = useMemo(() => agruparPorComisionista(itemsFiltrados, comisionistas, tarifasEspecificas, filtros.comisionistas), [itemsFiltrados, comisionistas, tarifasEspecificas, filtros.comisionistas, retenciones]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resumenClientes = useMemo(() => agruparPorCliente(itemsFiltrados, comisionistas, tarifasEspecificas), [itemsFiltrados, comisionistas, tarifasEspecificas, retenciones]);

  const totalOrden = itemsFiltrados.reduce((s, i) => s + i.total, 0);
  const totalComision = itemsFiltrados.reduce((s, i) => s + calcularComisionTotalItem(i, comisionistas, tarifasEspecificas), 0);
  // Total de la tabla "Por Comisionista": suma solo las filas mostradas (importa al
  // filtrar por comisionista). Sin filtro coincide con totalComision.

  // Las cuatro agrupaciones normalizadas a una sola forma de fila, para el
  // desglose conmutable del rediseño. `cantidad: null` = la dimensión no la tiene.
  const filasDesglose = useMemo(() => {
    const base =
      dimension === 'sector'
        ? resumenFincas.map((f) => ({ nombre: f.nombre, ordenes: f.ordenes, cantidad: f.cantidad, total: f.total, comision: f.comision, nota: undefined as string | undefined }))
        : dimension === 'producto'
          ? resumenProductos.map((p) => ({ nombre: p.nombre, ordenes: p.ordenes, cantidad: p.cantidad, total: p.total, comision: p.comision, nota: undefined as string | undefined }))
          : dimension === 'comisionista'
            ? resumenComisionistas.map((c) => ({
                nombre: c.nombre,
                ordenes: c.ordenes,
                cantidad: null as number | null,
                total: c.totalOrden,
                comision: c.totalComision,
                nota: c.tarifas,
              }))
            : resumenClientes.map((c) => ({ nombre: c.nombre, ordenes: c.ordenes, cantidad: c.cantidad, total: c.total, comision: c.comision, nota: undefined as string | undefined }));
    return [...base].sort((a, b) => b.comision - a.comision);
  }, [dimension, resumenClientes, resumenFincas, resumenProductos, resumenComisionistas]);

  const etiquetaDimension = DIMENSIONES.find((d) => d.valor === dimension)!.label;
  const totalComisionDesglose = filasDesglose.reduce((s, f) => s + f.comision, 0);
  const maxComisionDesglose = Math.max(0, ...filasDesglose.map((f) => f.comision));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resumenComisionistasB = useMemo(() => agruparPorComisionista(itemsFiltradosB, comisionistas, tarifasEspecificas, filtrosB.comisionistas), [itemsFiltradosB, comisionistas, tarifasEspecificas, filtrosB.comisionistas, retenciones]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsFiltrados, comisionistas, tarifasEspecificas, retenciones]);

  const handleExportPDF = async () => {
    if (itemsFiltrados.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    try {
      await exportarReportePDF(itemsFiltrados, comisionistas, 'Reporte_Comisiones', filtros, tarifasEspecificas);
      toast.success('PDF generado');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo generar el PDF');
    }
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
    <div className="flex max-w-[1360px] flex-col gap-3.5">
      {/* Filtros del reporte */}
      <Panel className="flex flex-col gap-3 p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmentado
            valor={String(trimAplicado || '')}
            opciones={[
              { valor: '1', label: 'T1' },
              { valor: '2', label: 'T2' },
              { valor: '3', label: 'T3' },
              { valor: '4', label: 'T4' },
            ]}
            onChange={(v) => aplicarTrimestre(Number(v))}
          />
          <BotonSecundario
            onClick={() => {
              const r = semestreRango(anioSel, 1);
              setFechaDesde(r.inicio);
              setFechaHasta(r.fin);
            }}
          >
            S1
          </BotonSecundario>
          <BotonSecundario
            onClick={() => {
              const r = semestreRango(anioSel, 2);
              setFechaDesde(r.inicio);
              setFechaHasta(r.fin);
            }}
          >
            S2
          </BotonSecundario>
          <BotonSecundario
            onClick={() => {
              const r = anioRango(anioSel);
              setFechaDesde(r.inicio);
              setFechaHasta(r.fin);
            }}
          >
            Año {anioSel}
          </BotonSecundario>
          <select
            value={anioSel}
            onChange={(e) => setAnioSel(Number(e.target.value))}
            className="h-9 rounded-[9px] border border-[#E0E4E9] bg-white px-2 text-[12.5px] text-[#475467]"
            aria-label="Año del periodo"
          >
            {aniosDisponibles.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <div className="flex h-9 items-center gap-2 rounded-[9px] border border-[#E0E4E9] bg-white px-3">
            <span className="text-[11.5px] text-[#7A8798]">Desde</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="cifra bg-transparent text-[12.5px] text-[#0B1220] outline-none"
            />
            <span className="text-[#C6CDD6]">→</span>
            <span className="text-[11.5px] text-[#7A8798]">Hasta</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="cifra bg-transparent text-[12.5px] text-[#0B1220] outline-none"
            />
          </div>

          <BotonFiltro activo={comparar} onClick={() => setComparar(!comparar)}>
            <GitCompare className="size-3.5" /> Comparar periodos
          </BotonFiltro>
          <BotonSecundario onClick={limpiar}>Limpiar</BotonSecundario>

          <div className="flex-1" />
          <BotonSecundario onClick={handleExportPDF}>
            <FileText className="size-3.5 text-[#B91C1C]" /> PDF
          </BotonSecundario>
          <BotonSecundario onClick={handleExportExcel}>
            <FileSpreadsheet className="size-3.5 text-primary" /> Excel
          </BotonSecundario>
        </div>

        {comparar && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-border bg-[#FAFBFC] px-3 py-2.5">
            <span className="text-[11.5px] text-[#7A8798]">Periodo B</span>
            <select
              value={anioB}
              onChange={(e) => setAnioB(Number(e.target.value))}
              className="h-8 rounded-lg border border-[#E0E4E9] bg-white px-2 text-[12.5px] text-[#475467]"
              aria-label="Año del periodo B"
            >
              {aniosDisponibles.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select
              value={trimB}
              onChange={(e) => setTrimB(Number(e.target.value))}
              className="h-8 rounded-lg border border-[#E0E4E9] bg-white px-2 text-[12.5px] text-[#475467]"
              aria-label="Trimestre del periodo B"
            >
              <option value={1}>T1 · Ene–Mar</option>
              <option value={2}>T2 · Abr–Jun</option>
              <option value={3}>T3 · Jul–Sep</option>
              <option value={4}>T4 · Oct–Dic</option>
            </select>
            <span className="text-[11.5px] text-[#98A2B3]">
              Compara el periodo A (arriba) contra B.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <MultiSelect label="Clientes" icon={Users} options={clientesUnicos} selected={clientesSel} onChange={setClientesSel} />
          <MultiSelect label="Sectores" icon={MapPin} options={fincasUnicas} selected={fincasSel} onChange={setFincasSel} />
          <MultiSelect label="Productos" icon={Fish} options={productosUnicos} selected={productosSel} onChange={setProductosSel} />
          <MultiSelect label="Comisionistas" icon={UserCheck} options={comisionistas.map(c => c.nombre)} selected={comisionistasSel} onChange={setComisionistasSel} />
        </div>

        {/* Generar: el reporte no se actualiza hasta pulsar este botón */}
        <div className="flex items-center justify-end gap-3">
          {hayCambios && <span className="text-xs text-[#B45309]">Hay cambios sin aplicar</span>}
          <BotonPrimario onClick={generar}>
            <Play className="size-3.5" /> Generar reporte
          </BotonPrimario>
        </div>
      </Panel>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Registros liquidados', valor: String(itemsFiltrados.length), icono: Package },
          { label: 'Comisionistas', valor: String(comisionistasInvolucrados), icono: Users },
          { label: 'Total facturado', valor: money(totalOrden), icono: DollarSign },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-white px-4 py-[15px]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#7A8798]">
              <k.icono className="size-3.5" />
              {k.label}
            </div>
            <div className="cifra mt-2.5 text-2xl font-semibold text-[#0B1220]">{k.valor}</div>
          </div>
        ))}
        <div className="rounded-xl bg-[#0B1220] px-4 py-[15px] text-white">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#8394AA]">
            <TrendingUp className="size-3.5" />
            Comisión total
          </div>
          <div className="cifra mt-2.5 text-2xl font-semibold">{money(totalComision)}</div>
        </div>
      </div>

      {/* Comparación de periodos */}
      {aplicado.comparar && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: `Periodo A · ${aplicado.fechaDesde || 'todo'} → ${aplicado.fechaHasta || 'todo'}`,
                valor: money(totalComision),
                nota: `${itemsFiltrados.length} registros · ${money(totalOrden)} facturado`,
                marca: '#0B1220',
                borde: '#E5E8EC',
              },
              {
                label: `Periodo B · T${aplicado.trimB} ${aplicado.anioB}`,
                valor: money(totalComisionB),
                nota: `${itemsFiltradosB.length} registros · ${money(totalOrdenB)} facturado`,
                marca: '#0F766E',
                borde: '#CFE3E0',
              },
              {
                label: 'Variación',
                valor: `${variacion(totalComision, totalComisionB) >= 0 ? '+' : '−'}${num(Math.abs(variacion(totalComision, totalComisionB)), 1)} %`,
                nota: 'Comisión total A → B',
                marca: '#B45309',
                borde: '#F5E3B8',
              },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border bg-white px-[17px] py-[15px]"
                style={{ borderColor: c.borde, borderLeft: `3px solid ${c.marca}` }}
              >
                <div className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-[#7A8798]">
                  {c.label}
                </div>
                <div className="cifra mt-2 text-[26px] font-semibold text-[#0B1220]">{c.valor}</div>
                <div className="mt-1 text-xs text-[#7A8798]">{c.nota}</div>
              </div>
            ))}
          </div>

          <Panel>
            <PanelTitulo titulo="Comisión por comisionista — A vs B" />
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="th-tabla grid grid-cols-[minmax(0,1.6fr)_130px_130px_130px] gap-3 border-b border-[#EDEFF2] bg-[#FAFBFC] px-5 py-2.5">
                  <div>Comisionista</div>
                  <div className="text-right">A</div>
                  <div className="text-right">B</div>
                  <div className="text-right">Variación</div>
                </div>
                {comparativaComisionistas.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-[#98A2B3]">No hay datos</div>
                ) : (
                  comparativaComisionistas.map((c, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(0,1.6fr)_130px_130px_130px] items-center gap-3 border-b border-[#F2F4F6] px-5 py-2.5 transition-colors hover:bg-[#FAFBFC]"
                    >
                      <div className="truncate text-[13px] text-[#0B1220]">{c.nombre}</div>
                      <div className="cifra text-right text-[12.5px] text-[#344054]">{money(c.a)}</div>
                      <div className="cifra text-right text-[12.5px] text-[#6B7684]">{money(c.b)}</div>
                      <div
                        className="cifra text-right text-[12.5px] font-semibold"
                        style={{ color: c.delta >= 0 ? '#0F766E' : '#B45309' }}
                      >
                        {c.delta >= 0 ? '▲' : '▼'} {num(Math.abs(c.delta), 1)} %
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Panel>
        </>
      )}

      {/* Gráfico */}
      {chartData.length > 0 && (
        <Panel>
          <PanelTitulo titulo={`Comisión por ${resumenFincas.length > 0 ? 'sector' : 'producto'}`} />
          <div className="px-5 py-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDEFF2" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#7A8798', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#7A8798', fontSize: 12 }}
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
                      border: '1px solid #E5E8EC',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="comision" fill="#0F766E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Panel>
      )}

      {/* Tendencia mensual */}
      {tendenciaMensual.length > 0 && (
        <Panel>
          <PanelTitulo titulo="Tendencia mensual de comisión" nota="Comisión liquidada por mes" />
          <div className="px-5 py-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tendenciaMensual} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDEFF2" />
                  <XAxis dataKey="mes" tick={{ fill: '#7A8798', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#7A8798', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toLocaleString('es-ES')}`} />
                  <Tooltip
                    formatter={(value: any) => {
                      const num = typeof value === 'number' ? value : Number(value);
                      return [`$${num.toFixed(2)}`, 'Comisión'];
                    }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E8EC', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="comision" fill="#0F766E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Panel>
      )}

      {/* Desglose por dimensión — una sola tabla conmutable */}
      <Panel>
        <div className="flex flex-wrap items-center gap-3.5 border-b border-[#EDEFF2] px-[18px] py-3.5">
          <div className="text-sm font-semibold text-[#0B1220]">Desglose por</div>
          <Segmentado
            valor={dimension}
            opciones={DIMENSIONES}
            onChange={(v) => setDimension(v)}
          />
          <div className="flex-1" />
          <span className="text-xs text-[#7A8798]">
            {filasDesglose.length} filas · ordenado por comisión
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className={`th-tabla grid ${COLS_DESGLOSE} gap-3 border-b border-[#EDEFF2] bg-[#FAFBFC] px-[18px] py-2.5`}>
              <div>{etiquetaDimension}</div>
              <div className="text-right">Facturas</div>
              <div className="text-right">Cantidad</div>
              <div className="text-right">Total</div>
              <div className="text-right">Comisión</div>
              <div>% del total</div>
            </div>

            {filasDesglose.length === 0 ? (
              <div className="px-[18px] py-10 text-center text-sm text-[#98A2B3]">
                No hay datos para el periodo y los filtros aplicados
              </div>
            ) : (
              filasDesglose.map((f, i) => {
                const pct = totalComisionDesglose > 0 ? (f.comision / totalComisionDesglose) * 100 : 0;
                const ancho = maxComisionDesglose > 0 ? (f.comision / maxComisionDesglose) * 100 : 0;
                return (
                  <div
                    key={`${f.nombre}-${i}`}
                    className={`grid ${COLS_DESGLOSE} items-center gap-3 border-b border-[#F2F4F6] px-[18px] py-2.5 transition-colors hover:bg-[#FAFBFC]`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-[#0B1220]" title={f.nombre}>
                        {f.nombre}
                      </div>
                      {f.nota && (
                        <div className="truncate text-[11px] text-[#98A2B3]" title={f.nota}>
                          {f.nota}
                        </div>
                      )}
                    </div>
                    <div className="cifra text-right text-[12.5px] text-[#6B7684]">{f.ordenes}</div>
                    <div className="cifra text-right text-[12.5px] text-[#6B7684]">
                      {f.cantidad === null ? '—' : num(f.cantidad, 0)}
                    </div>
                    <div className="cifra text-right text-[12.5px] text-[#344054]">{money(f.total)}</div>
                    <div className="cifra text-right text-[13px] font-semibold text-primary">
                      {money(f.comision)}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <BarraProgreso pct={ancho} color={i === 0 ? '#0F766E' : '#B7C3D3'} />
                      <span className="cifra w-10 text-right text-[11.5px] text-[#6B7684]">
                        {num(pct, 1)} %
                      </span>
                    </div>
                  </div>
                );
              })
            )}

            {filasDesglose.length > 0 && (
              <div className={`grid ${COLS_DESGLOSE} items-center gap-3 bg-[#FAFBFC] px-[18px] py-3`}>
                <div className="text-[12px] font-semibold text-[#475467]">Totales</div>
                <div className="cifra text-right text-[12.5px] font-semibold text-[#0B1220]">
                  {filasDesglose.reduce((s, f) => s + f.ordenes, 0)}
                </div>
                <div className="cifra text-right text-[12.5px] font-semibold text-[#0B1220]">
                  {filasDesglose.some((f) => f.cantidad === null)
                    ? '—'
                    : num(filasDesglose.reduce((s, f) => s + (f.cantidad ?? 0), 0), 0)}
                </div>
                <div className="cifra text-right text-[12.5px] font-semibold text-[#0B1220]">
                  {money(filasDesglose.reduce((s, f) => s + f.total, 0))}
                </div>
                <div className="cifra text-right text-[13px] font-semibold text-primary">
                  {money(totalComisionDesglose)}
                </div>
                <div className="cifra text-right text-[11.5px] text-[#6B7684]">100,0 %</div>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
