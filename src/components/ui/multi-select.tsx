'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type MultiSelectOption = string | { value: string; label: string };

/**
 * Selector múltiple con buscador. El panel se renderiza en un portal con
 * position:fixed para escapar de cualquier overflow/stacking de las tarjetas.
 */
export function MultiSelect({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  placeholder = 'Todos',
  searchable = true,
  searchPlaceholder = 'Buscar…',
  resumenSeleccion,
  triggerClassName,
  panelClassName,
  labelClassName,
}: {
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Texto del trigger cuando hay selección. Recibe las opciones completas. */
  resumenSeleccion?: (seleccionadas: { value: string; label: string }[]) => string;
  triggerClassName?: string;
  panelClassName?: string;
  labelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const opciones = useMemo(
    () => options.map(o => (typeof o === 'string' ? { value: o, label: o } : o)),
    [options]
  );
  const etiquetaPorValor = useMemo(
    () => new Map(opciones.map(o => [o.value, o.label])),
    [opciones]
  );

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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', actualizar, true);
    window.addEventListener('resize', actualizar);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', actualizar, true);
      window.removeEventListener('resize', actualizar);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // La búsqueda no sobrevive al cierre: al reabrir se ve la lista completa.
  const handleToggle = () => {
    if (!open) setQuery('');
    setOpen(!open);
  };

  const filtradas = query
    ? opciones.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : opciones;

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter(v => v !== value));
    else onChange([...selected, value]);
  };

  const resumen = selected.length === 0
    ? placeholder
    : resumenSeleccion
      ? resumenSeleccion(opciones.filter(o => selected.includes(o.value)))
      : selected.length === 1
        ? etiquetaPorValor.get(selected[0]) ?? selected[0]
        : `${selected.length} seleccionados`;

  return (
    <div className="space-y-1.5">
      {label && (
        <Label className={cn('flex items-center gap-1 text-[11.5px] font-semibold text-[#475467]', labelClassName)}>
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </Label>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={resumen}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-[9px] border border-[#E0E4E9] bg-white px-2.5 text-left text-[12.5px]',
          triggerClassName
        )}
      >
        <span className={cn('truncate', selected.length ? 'text-[#0B1220]' : 'text-[#98A2B3]')}>
          {resumen}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-[#98A2B3]" />
      </button>
      {open && coords && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: Math.max(coords.width, 220),
            zIndex: 1000,
          }}
          className={cn('rounded-xl border border-border bg-white shadow-lg', panelClassName)}
        >
          {searchable && (
            <div className="border-b border-[#EDEFF2] p-2">
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-lg border border-border px-2 text-sm outline-none focus:border-slate-400"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1" role="listbox" aria-multiselectable="true">
            {filtradas.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-[#98A2B3]">Sin resultados</div>
            ) : (
              filtradas.map(opt => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[#FAFBFC]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="h-4 w-4 rounded border-[#C6CDD6] accent-primary"
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex justify-between border-t border-[#EDEFF2] p-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-[#7A8798] hover:text-[#344054]"
              >
                Limpiar selección
              </button>
              <span className="text-xs text-[#98A2B3]">{selected.length} de {opciones.length}</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
