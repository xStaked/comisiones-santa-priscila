'use client';

import { useIsMutating } from '@tanstack/react-query';

/**
 * Barra de progreso global para cualquier mutación (guardar, eliminar,
 * asignar, liquidar, etc.). Es el feedback mínimo común: aparece aunque el
 * diálogo se cierre o el botón que disparó la acción ya no esté visible.
 * Las acciones críticas además muestran su propio spinner en el botón.
 */
export function GlobalMutationBar() {
  const mutacionesEnCurso = useIsMutating();

  if (mutacionesEnCurso === 0) return null;

  return (
    <div
      role="progressbar"
      aria-label="Guardando cambios"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-primary/15"
    >
      <div className="h-full w-1/3 animate-[barra-progreso_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
    </div>
  );
}
