'use client';

import { useState } from 'react';
import { isAxiosError } from 'axios';
import { Percent, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { createRetencion, deleteRetencion } from '@/lib/api';

function mostrarError(error: unknown, mensaje: string) {
  const detalle = isAxiosError<{ detail?: string }>(error) ? error.response?.data?.detail : undefined;
  toast.error(detalle || mensaje);
}

/** Tarjeta de gestión de la retención global por periodos de vigencia.
 *
 * La retención NO es por cliente: es una tasa legal única cuyos tramos rigen
 * por fecha de EMISIÓN de la factura (ver AGENTS.md, sección Retención). */
export function RetencionCard() {
  const queryClient = useQueryClient();
  const { retenciones } = useApp();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vigenteDesde: '', porcentaje: '' });

  // El backend las devuelve ordenadas por vigente_desde descendente: la
  // vigente hoy es la primera cuyo tramo ya empezó.
  const hoy = new Date().toISOString().slice(0, 10);
  const vigente = retenciones.find((r) => r.vigenteDesde.slice(0, 10) <= hoy);

  const crearMutation = useMutation({
    mutationFn: createRetencion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retenciones'] });
      setOpen(false);
      setForm({ vigenteDesde: '', porcentaje: '' });
      toast.success('Tramo de retención agregado');
    },
    onError: (error) => mostrarError(error, 'No se pudo agregar el tramo'),
  });

  const eliminarMutation = useMutation({
    mutationFn: deleteRetencion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retenciones'] });
      toast.success('Tramo de retención eliminado');
    },
    onError: (error) => mostrarError(error, 'No se pudo eliminar el tramo'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const porcentaje = parseFloat(form.porcentaje);
    if (!form.vigenteDesde) {
      toast.error('Indica la fecha desde la que rige el tramo');
      return;
    }
    if (isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      toast.error('El porcentaje debe estar entre 0 y 100');
      return;
    }
    crearMutation.mutate({ vigenteDesde: form.vigenteDesde, porcentaje });
  };

  const formatearFecha = (iso: string) =>
    new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES');

  return (
    <Card className="bg-white border-slate-200 rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-2">
          <Percent className="h-4 w-4" />
          Retención sobre facturas
          {vigente && (
            <Badge className="bg-slate-900 text-white">
              Vigente: {vigente.porcentaje}% desde {formatearFecha(vigente.vigenteDesde)}
            </Badge>
          )}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar tramo
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {retenciones.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600"
            >
              <span>
                {r.porcentaje}% desde {formatearFecha(r.vigenteDesde)}
              </span>
              <button
                type="button"
                aria-label="Eliminar tramo"
                className="text-slate-400 hover:text-red-600"
                onClick={() => {
                  if (
                    confirm(
                      `¿Eliminar el tramo de ${r.porcentaje}% (desde ${formatearFecha(r.vigenteDesde)})? Las facturas sin liquidar de ese rango pasarán a usar el tramo anterior.`
                    )
                  ) {
                    eliminarMutation.mutate(r.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Cada factura usa la retención vigente en su fecha de emisión. Agregar un
          tramo retroactivo recalcula las facturas aún no liquidadas de ese rango;
          lo ya liquidado no se modifica.
        </p>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle>Nuevo tramo de retención</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="vigenteDesde">Rige desde</Label>
              <Input
                id="vigenteDesde"
                type="date"
                value={form.vigenteDesde}
                onChange={(e) => setForm({ ...form, vigenteDesde: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="porcentaje">Retención (%)</Label>
              <Input
                id="porcentaje"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="2.00"
                value={form.porcentaje}
                onChange={(e) => setForm({ ...form, porcentaje: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="btn-primary-dark rounded-xl"
                disabled={crearMutation.isPending}
              >
                Guardar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
