import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// xlsx-js-style: fork de SheetJS que sí escribe estilos de celda (fill, font,
// border, alignment). La API pública es compatible con `xlsx`, así que solo
// cambia el import. Lo necesitamos para colorear secciones por razón social
// y los totales en el Excel de liquidación.
import * as XLSX from 'xlsx-js-style';
import { OrdenItem, Comisionista, TarifaClienteProducto, Cliente } from '@/types';
import {
  normalizarTexto,
  normalizarNombreFinca,
  normalizarNombreProducto,
  normalizarRazonSocial,
  ratioDifflib,
  UMBRAL_FINCA,
  UMBRAL_PRODUCTO,
} from './normalization';

// Paridad obligatoria con backend/app/services/liquidacion.py.
// Kilos que contiene cada envase cuando el producto no lo define.
// 1 litro ≈ 1 kg, así que kg, litros y unidades sueltas comparten factor 1.
const KG_POR_TACHO = 10;
const KG_POR_SACO = 25;
const KG_POR_CANECA = 20;

const ENVASES = ['tacho', 'saco', 'caneca'];

function esEnvase(unidad: string): boolean {
  return ENVASES.some((envase) => unidad.includes(envase));
}

/**
 * Kilos que contiene un envase del ítem. La unidad del documento manda; las
 * facturas vienen en kg (no nombran el envase), así que ahí lo define el producto.
 */
function getKgPorEnvase(item: OrdenItem): number {
  const producto = item.productoRel;
  let unidad = item.unidad?.toLowerCase() || '';

  if (!esEnvase(unidad)) {
    unidad = producto?.unidadComision?.toLowerCase() || '';
  }

  if (unidad.includes('tacho')) return producto?.tachoKilos || KG_POR_TACHO;
  if (unidad.includes('saco')) return producto?.sacoKilos || KG_POR_SACO;
  if (unidad.includes('caneca')) return KG_POR_CANECA;
  return 1;
}

/**
 * Cantidad del ítem en kilos: la unidad en la que se expresa una tarifa fijo_kg.
 * Las órdenes de compra traen la cantidad en envases (63 tachos); las facturas
 * la traen ya en kilos (630 kg).
 */
export function getCantidadParaTarifaKg(item: OrdenItem): number {
  if (esEnvase(item.unidad?.toLowerCase() || '')) {
    return item.cantidad * getKgPorEnvase(item);
  }
  return item.cantidad;
}

/**
 * Sector / finca canónico del ítem para ordenar y filtrar. `fincaRel.nombre`
 * es el catálogo normalizado; `sector`/`finca` son los textos crudos del
 * documento.
 */
export function sectorDeItem(item: OrdenItem): string {
  return (item.fincaRel?.nombre || item.sector || item.finca || '').trim();
}

function sectorParaOrden(a: OrdenItem, b: OrdenItem): number {
  return sectorDeItem(a).localeCompare(sectorDeItem(b), 'es');
}

/**
 * Cantidad del ítem en envases: la unidad en la que se expresa una tarifa
 * fijo_unidad ($/saco de CALCINIT, $/tacho de NATUXTRACT, $/litro de MORTAL).
 */
export function getCantidadParaTarifaUnidad(item: OrdenItem): number {
  if (esEnvase(item.unidad?.toLowerCase() || '')) {
    return item.cantidad;
  }
  return item.cantidad / getKgPorEnvase(item);
}

export function calcularComisionPorTarifa(item: OrdenItem, tarifa: { tipo: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor: number }): number {
  if (tarifa.tipo === 'porcentaje') {
    return item.total * (tarifa.valor / 100);
  }

  if (tarifa.tipo === 'fijo_kg') {
    return getCantidadParaTarifaKg(item) * tarifa.valor;
  }

  if (tarifa.tipo === 'fijo_unidad') {
    return getCantidadParaTarifaUnidad(item) * tarifa.valor;
  }

  return 0;
}

// Regla por volumen: paridad obligatoria con _comision_con_umbral() de
// backend/app/services/liquidacion.py. El acumulado es por comisionista
// dentro de la liquidación en curso.
function comisionConUmbral(
  item: OrdenItem,
  tarifa: { umbralKg?: number | string | null; valorSobreUmbral?: number | string | null },
  kgAcumulado?: number
): { comision: number; tarifasLabel: string } | undefined {
  if (tarifa.umbralKg == null || tarifa.valorSobreUmbral == null) return undefined;
  const umbralKg = Number(tarifa.umbralKg);
  const valorSobreUmbral = Number(tarifa.valorSobreUmbral);
  if ((kgAcumulado ?? 0) < umbralKg) return undefined;
  return {
    comision: getCantidadParaTarifaKg(item) * valorSobreUmbral,
    tarifasLabel: `$${valorSobreUmbral.toFixed(3)}/kg (≥${umbralKg} kg)`,
  };
}

// Periodos de retención, ordenados del más reciente al más antiguo. Los inyecta
// AppContext una vez al cargar la app.
// ponytail: estado de módulo en vez de pasar los periodos por parámetro.
// Hacerlo por parámetro exigiría un noveno argumento posicional en
// exportarPDF/exportarExcel y tocar 8 llamadores. El valor es una tasa legal
// idéntica para todos los usuarios, así que compartirlo no tiene riesgo. Si
// algún día la retención vuelve a variar por cliente, hay que pasarla por
// parámetro.
let periodosRetencion: { vigenteDesde: string; porcentaje: number }[] = [];

export function setPeriodosRetencion(
  periodos: { vigenteDesde: string; porcentaje: number }[]
): void {
  periodosRetencion = [...periodos].sort((a, b) =>
    b.vigenteDesde.localeCompare(a.vigenteDesde)
  );
}

// Retención vigente en la fecha de EMISIÓN de la factura. Las fechas son ISO
// (YYYY-MM-DD), así que comparar como texto equivale a comparar cronológicamente.
// Debe mantenerse en paridad con retencion_para() de
// backend/app/services/retencion.py.
export function retencionPara(fecha: string): number {
  const f = fecha.slice(0, 10);
  const periodo = periodosRetencion.find((p) => p.vigenteDesde.slice(0, 10) <= f);
  return periodo ? Number(periodo.porcentaje) : 1.75;
}

// Igual que la global salvo que el porcentaje se aplica sobre el total menos la
// retención vigente en la fecha de la factura.
export function calcularComisionPorTarifaEspecifica(
  item: OrdenItem,
  tarifa: TarifaClienteProducto
): number {
  if (tarifa.tipo === 'porcentaje') {
    const retencion = retencionPara(item.fecha);
    const base = item.total * (1 - retencion / 100);
    return base * (tarifa.valor / 100);
  }

  if (tarifa.tipo === 'fijo_kg') {
    return getCantidadParaTarifaKg(item) * tarifa.valor;
  }

  if (tarifa.tipo === 'fijo_unidad') {
    return getCantidadParaTarifaUnidad(item) * tarifa.valor;
  }

  return 0;
}

export function encontrarTarifaEspecifica(
  item: OrdenItem,
  comisionistaId: string,
  tarifas: TarifaClienteProducto[]
): TarifaClienteProducto | undefined {
  const nombreRelacion = (relacion?: string | { nombre: string }) =>
    typeof relacion === 'string' ? relacion : relacion?.nombre;
  const nombreClienteItem = item.cliente?.nombre;
  const sinClienteIdentificado = !item.clienteId && !nombreClienteItem;
  const nombreFincaItem = item.fincaRel?.nombre || (item.finca !== '-' ? item.finca : item.sector);
  const proveedorOrden = normalizarTexto(item.proveedor || '');

  const coincideCliente = (tarifa: TarifaClienteProducto) => {
    if (tarifa.clienteId && item.clienteId && tarifa.clienteId === item.clienteId) return true;
    const nt = normalizarTexto(nombreRelacion(tarifa.cliente));
    const ni = normalizarTexto(nombreClienteItem);
    return !!nt && !!ni && nt === ni;
  };

  const coincideProducto = (tarifa: TarifaClienteProducto) => {
    // Solo coincidir por ID si ambos están definidos; de lo contrario usar matching por nombre
    if (tarifa.productoId && item.productoId && tarifa.productoId === item.productoId) return true;
    const nt = normalizarNombreProducto(nombreRelacion(tarifa.producto));
    const ni = normalizarNombreProducto(item.productoRel?.nombre || item.producto);
    if (!!nt && !!ni && nt === ni) return true;
    // Fallback difuso para typos en facturas ya emitidas (ej. "ECU BACILUS" → "ECU BACILLUS")
    if (!!nt && !!ni && ratioDifflib(nt, ni) >= UMBRAL_PRODUCTO) return true;
    return false;
  };

  const coincideFinca = (tarifa: TarifaClienteProducto) => {
    if (!tarifa.fincaId) return true; // tarifa sin finca aplica a cualquier finca
    if (tarifa.fincaId && item.fincaId && tarifa.fincaId === item.fincaId) return true;
    const nt = normalizarNombreFinca(nombreRelacion(tarifa.finca));
    const ni = normalizarNombreFinca(nombreFincaItem);
    if (!!nt && !!ni && nt === ni) return true;
    // Fallback difuso para typos de sector (ej. "CALIFRONIA" → "CALIFORNIA", "califromia" → "california")
    if (!!nt && !!ni && ratioDifflib(nt, ni) >= UMBRAL_FINCA) return true;
    return false;
  };

  const tarifaAplicaParaProveedor = (tarifa: TarifaClienteProducto) => {
    if (tarifa.proveedoresExcluidos?.length) {
      const excluidos = tarifa.proveedoresExcluidos.map(normalizarTexto);
      if (excluidos.includes(proveedorOrden)) return false;
    }
    if (!tarifa.proveedor) return true;
    return normalizarTexto(tarifa.proveedor) === proveedorOrden;
  };

  // La tarifa se decide por la fecha de pago (el cliente liquida cuando le
  // pagan); si aún no está pagada, cae a la fecha de la factura. Ambas son ISO
  // YYYY-MM-DD, así que comparar como texto ordena bien.
  const fechaEfectiva = (item.fechaPago || item.fecha || '').slice(0, 10);

  const candidatas = tarifas.filter(
    (tarifa) =>
      tarifa.comisionistaId === comisionistaId &&
      (!tarifa.vigenteDesde || !fechaEfectiva || fechaEfectiva >= tarifa.vigenteDesde.slice(0, 10)) &&
      (!tarifa.vigenteHasta || !fechaEfectiva || fechaEfectiva <= tarifa.vigenteHasta.slice(0, 10)) &&
      (coincideCliente(tarifa) || sinClienteIdentificado) &&
      coincideProducto(tarifa)
  );

  // 1. Tarifa con finca exacta + proveedor específico
  const conFincaYProv = candidatas.find(
    (tarifa) => tarifa.fincaId && coincideFinca(tarifa) && tarifa.proveedor && tarifaAplicaParaProveedor(tarifa)
  );
  if (conFincaYProv) {
    return conFincaYProv;
  }

  // 2. Tarifa con finca exacta + sin proveedor (wildcard)
  const conFincaSinProv = candidatas.find(
    (tarifa) => tarifa.fincaId && coincideFinca(tarifa) && !tarifa.proveedor
  );
  if (conFincaSinProv) {
    return conFincaSinProv;
  }

  // 3. Tarifa sin finca + proveedor específico
  const sinFincaYProv = candidatas.find(
    (tarifa) => !tarifa.fincaId && tarifa.proveedor && tarifaAplicaParaProveedor(tarifa)
  );
  if (sinFincaYProv) {
    return sinFincaYProv;
  }

  // 4. Tarifa sin finca + sin proveedor (wildcard)
  const sinFincaSinProv = candidatas.find(
    (tarifa) => !tarifa.fincaId && !tarifa.proveedor
  );
  if (sinFincaSinProv) {
    return sinFincaSinProv;
  }

  // 5. Fallback: si la orden no tiene finca identificada, buscar cualquier tarifa
  //    del mismo comisionista+cliente+producto cuya finca coincida por nombre
  if (!item.fincaId && !nombreFincaItem) {
    return undefined;
  }

  const fallback = candidatas.find((tarifa) => coincideFinca(tarifa));
  return fallback;
}

export function calcularComision(item: OrdenItem, comisionista: Comisionista | undefined, kgAcumulado?: number): number {
  if (!comisionista) return 0;
  const proveedorOrden = normalizarTexto(item.proveedor || '');
  const fechaEfectiva = (item.fechaPago || item.fecha || '').slice(0, 10);
  return comisionista.tarifas.reduce((sum, tarifa) => {
    if (tarifa.vigenteDesde && fechaEfectiva && fechaEfectiva < tarifa.vigenteDesde.slice(0, 10)) return sum;
    if (tarifa.vigenteHasta && fechaEfectiva && fechaEfectiva > tarifa.vigenteHasta.slice(0, 10)) return sum;
    if (tarifa.proveedoresExcluidos?.length) {
      const excluidos = tarifa.proveedoresExcluidos.map(normalizarTexto);
      if (excluidos.includes(proveedorOrden)) {
        return sum;
      }
    }
    const umbral = comisionConUmbral(item, tarifa, kgAcumulado);
    if (umbral) return sum + umbral.comision;
    return sum + calcularComisionPorTarifa(item, tarifa);
  }, 0);
}

export function calcularComisionTotalItem(
  item: OrdenItem,
  comisionistas: Comisionista[],
  tarifasEspecificas: TarifaClienteProducto[] = []
): number {
  return item.comisionistas.reduce((sum, asig) => {
    const com = comisionistas.find(c => c.id === asig.comisionistaId);
    if (!com) return sum;
    const detalle = calcularDetalleComision(item, com, tarifasEspecificas);
    return sum + detalle.comision;
  }, 0);
}

export function getNombresComisionistas(item: OrdenItem, comisionistas: Comisionista[]): string {
  if (item.comisionistas.length === 0) return 'Sin asignar';
  return item.comisionistas
    .map(a => comisionistas.find(c => c.id === a.comisionistaId)?.nombre || '?')
    .join(', ');
}

export function getTarifaLabel(tarifa: { tipo: 'porcentaje' | 'fijo_kg' | 'fijo_unidad'; valor: number | string }): string {
  const valor = typeof tarifa.valor === 'string' ? parseFloat(tarifa.valor) : tarifa.valor;
  if (tarifa.tipo === 'porcentaje') {
    return `${valor}%`;
  }
  if (tarifa.tipo === 'fijo_kg') {
    return `$${valor.toFixed(3)}/kg`;
  }
  return `$${valor.toFixed(3)}/unidad`;
}

export function getTarifasLabel(comisionista: Comisionista): string {
  return comisionista.tarifas.map(getTarifaLabel).join(' + ');
}

export function calcularDetalleComision(
  item: OrdenItem,
  comisionista: Comisionista,
  tarifas: TarifaClienteProducto[],
  kgAcumulado?: number
): { comision: number; tarifasLabel: string } {
  const tarifaEspecifica = encontrarTarifaEspecifica(item, comisionista.id, tarifas);
  if (tarifaEspecifica) {
    const umbral = comisionConUmbral(item, tarifaEspecifica, kgAcumulado);
    if (umbral) return umbral;
    return {
      comision: calcularComisionPorTarifaEspecifica(item, tarifaEspecifica),
      tarifasLabel: getTarifaLabel(tarifaEspecifica),
    };
  }

  // Si el comisionista tiene tarifas específicas configuradas pero ninguna
  // aplica a este item, no debe hacer fallback a tarifas globales.
  const tieneTarifasEspecificas = tarifas.some(
    (t) => t.comisionistaId === comisionista.id
  );
  if (tieneTarifasEspecificas) {
    return { comision: 0, tarifasLabel: '—' };
  }

  return {
    comision: calcularComision(item, comisionista, kgAcumulado),
    tarifasLabel: getTarifasLabel(comisionista) || 'Sin tarifa configurada',
  };
}

export function exportarPDF(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  titulo: string,
  nombreComisionista?: string,
  tarifasClienteProducto: TarifaClienteProducto[] = [],
  comisionesSnapshot?: Map<string, { comision: number; tarifasLabel: string }>,
  kgAcumuladoPorComisionista?: Map<string, number>
) {
  const doc = new jsPDF({ orientation: 'portrait', format: 'letter' });
  const comisionistaMap = new Map(comisionistas.map(c => [c.id, c]));

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let yPos = 15;

  const nombresMes = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Agrupar items por comisionista, luego por mes
  const itemsPorComisionista = new Map<string, Map<string, OrdenItem[]>>();
  items.forEach(item => {
    item.comisionistas.forEach(asig => {
      const comId = asig.comisionistaId || 'sin-asignar';
      if (!itemsPorComisionista.has(comId)) {
        itemsPorComisionista.set(comId, new Map());
      }
      const fecha = new Date(item.fecha);
      const mesKey = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      const mesMap = itemsPorComisionista.get(comId)!;
      if (!mesMap.has(mesKey)) {
        mesMap.set(mesKey, []);
      }
      mesMap.get(mesKey)!.push(item);
    });
    // Si no tiene comisionistas, agrupar bajo 'sin-asignar'
    if (item.comisionistas.length === 0) {
      const comId = 'sin-asignar';
      if (!itemsPorComisionista.has(comId)) {
        itemsPorComisionista.set(comId, new Map());
      }
      const fecha = new Date(item.fecha);
      const mesKey = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      const mesMap = itemsPorComisionista.get(comId)!;
      if (!mesMap.has(mesKey)) {
        mesMap.set(mesKey, []);
      }
      mesMap.get(mesKey)!.push(item);
    }
  });

  // Ordenar comisionistas y meses
  const comisionistaIds = Array.from(itemsPorComisionista.keys()).sort((a, b) => {
    const comA = comisionistaMap.get(a);
    const comB = comisionistaMap.get(b);
    return (comA?.nombre || '').localeCompare(comB?.nombre || '');
  });

  let totalGeneral = 0;

  comisionistaIds.forEach(comId => {
    const com = comisionistaMap.get(comId);
    const comNombre = com?.nombre || 'Sin asignar';
    const mesesMap = itemsPorComisionista.get(comId)!;
    const meses = Array.from(mesesMap.keys()).sort();

    meses.forEach(mesKey => {
      const itemsDelGrupo = [...mesesMap.get(mesKey)!].sort(
        (a, b) =>
          a.fecha.localeCompare(b.fecha) ||
          sectorParaOrden(a, b) ||
          a.numeroOrden.localeCompare(b.numeroOrden)
      );
      const [anio, mes] = mesKey.split('-');
      const nombreMes = nombresMes[parseInt(mes) - 1];
      const ultimoDia = getUltimoDiaMes(parseInt(mes), parseInt(anio));

      // Verificar si necesitamos nueva página
      if (yPos > 230) {
        doc.addPage();
        yPos = 15;
      }

      // Encabezado de empresa para cada grupo
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.', pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      doc.text('Sistema de Liquidación de Comisiones', pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;

      // Línea de comisionista con período
      doc.setFontSize(9);
      doc.text(`Comisionista: ${comNombre} del 1 al ${ultimoDia} de ${nombreMes} ${anio}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;

      // Preparar body de la tabla — orden cronológico y por sector (para auditoría)
      const body = itemsDelGrupo.map(item => {
        let comision = 0;
        let tarifasLabel = '-';
        const snapshotKey = `${item.id}|${comId}`;
        if (comisionesSnapshot?.has(snapshotKey)) {
          const snap = comisionesSnapshot.get(snapshotKey)!;
          comision = snap.comision;
          tarifasLabel = snap.tarifasLabel;
        } else {
          const detalle = com ? calcularDetalleComision(item, com, tarifasClienteProducto, kgAcumuladoPorComisionista?.get(comId)) : undefined;
          comision = detalle?.comision || 0;
          tarifasLabel = detalle?.tarifasLabel || '-';
        }
        return [
          item.fecha,
          item.numeroOrden,
          item.producto,
          `${item.cantidad.toLocaleString('es-ES')}`,
          tarifasLabel,
          `$ ${comision.toFixed(2).replace('.', ',')}`,
          item.estado || 'pagada',
          sectorDeItem(item) || '-',
        ];
      });

      const totalComisionGrupo = itemsDelGrupo.reduce((sum, item) => {
        const snapshotKey = `${item.id}|${comId}`;
        if (comisionesSnapshot?.has(snapshotKey)) {
          return sum + (comisionesSnapshot.get(snapshotKey)!.comision || 0);
        }
        return sum + (com ? calcularDetalleComision(item, com, tarifasClienteProducto, kgAcumuladoPorComisionista?.get(comId)).comision : 0);
      }, 0);

      totalGeneral += totalComisionGrupo;

      // Crear tabla
      autoTable(doc, {
        startY: yPos,
        head: [['Fecha', 'Factura', 'Nombre', 'Cantidad', 'Tipo Comisión', 'Valor de Comisión', 'Estado', 'Sector']],
        body,
        foot: [['', '', '', '', '', `$ ${totalComisionGrupo.toFixed(2).replace('.', ',')}`, '', '']],
        theme: 'grid',
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          cellPadding: 2,
        },
        bodyStyles: {
          fontSize: 8,
          cellPadding: 2,
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          fontSize: 8,
          cellPadding: 2,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 22 },
          1: { cellWidth: 32 },
          2: { cellWidth: 40 },
          3: { halign: 'right', cellWidth: 18 },
          4: { halign: 'right', cellWidth: 20 },
          5: { halign: 'right', cellWidth: 26 },
          6: { halign: 'center', cellWidth: 20 },
          7: { halign: 'center', cellWidth: 18 },
        },
        margin: { left: margin, right: margin },
      });

      yPos = (doc as any).lastAutoTable.finalY + 12;
    });
  });

  // Total general
  if (yPos > 260) {
    doc.addPage();
    yPos = 20;
  }

  // Caja de total general con fondo amarillo
  const totalWidth = 55;
  const totalHeight = 7;
  const totalX = (pageWidth - totalWidth) / 2;
  doc.setFillColor(255, 255, 0);
  doc.rect(totalX, yPos, totalWidth, totalHeight, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`TOTAL ${totalGeneral.toFixed(2).replace('.', ',')}`, pageWidth / 2, yPos + 5, { align: 'center' });

  doc.save(`${titulo.replace(/\s+/g, '_')}.pdf`);
}

function nombreHojaValido(nombre: string, usados: Set<string>): string {
  // Excel: máx 31 chars, sin []:*?/\
  const base = nombre.replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sin proveedor';
  let candidato = base;
  let n = 2;
  while (usados.has(candidato)) {
    candidato = `${base.slice(0, 28)} ${n}`;
    n += 1;
  }
  usados.add(candidato);
  return candidato;
}

export function exportarExcel(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  titulo: string,
  // Un nombre (liquidación individual), varios nombres, o los objetos completos
  // (IDs + nombres) cuando se mezclan comisionistas y hay nombres repetidos.
  nombreComisionista?: string | string[] | Comisionista[],
  tarifasClienteProducto: TarifaClienteProducto[] = [],
  comisionesSnapshot?: Map<string, { comision: number; tarifasLabel: string }>,
  kgAcumuladoPorComisionista?: Map<string, number>,
  clientes: Cliente[] = []
) {
  const comisionistaMap = new Map(comisionistas.map(c => [c.id, c]));
  const wb = XLSX.utils.book_new();

  // Comisionista(s) que el caller está liquidando. Cuando vienen informados
  // (caso típico del módulo de Liquidación) las líneas se imputan solo a esas
  // personas; cuando vienen vacíos (ej. historial de liquidaciones ya
  // guardadas) se usa el snapshot de comisiones, que ya trae los valores por
  // ítem. El módulo de Liquidación puede enviar una mezcla de comisionistas.
  const seleccionados: (string | Comisionista)[] = Array.isArray(nombreComisionista)
    ? nombreComisionista
    : nombreComisionista
      ? [nombreComisionista]
      : [];
  const nombresSeleccionados = seleccionados
    .map(item => (typeof item === 'string' ? item.trim() : item.nombre.trim()))
    .filter(Boolean);
  // Resolver IDs por objeto cuando se reciben completos; las llamadas antiguas
  // que solo pasan el nombre siguen funcionando.
  const idsSeleccionados = new Set(
    seleccionados.flatMap(item => {
      if (typeof item !== 'string') return [item.id];
      const encontrado = comisionistas.find(c => c.nombre === item);
      return encontrado ? [encontrado.id] : [];
    })
  );
  const comisionistasOwner = comisionistas.filter(c => idsSeleccionados.has(c.id));

  // ── Estilos de celda ──────────────────────────────────────────────────────
  // Paleta deliberadamente sobria: el reporte va al cliente, no a un dev.
  // xlsx-js-style es fork de SheetJS que sí escribe estilos de celda (la
  // versión oficial solo lee, no escribe).
  const thin = { style: 'thin' as const, color: { rgb: 'FF7F7F7F' } };
  const borde = {
    top: thin,
    bottom: thin,
    left: thin,
    right: thin,
  };
  const estilos = {
    tituloEmpresa: {
      font: { bold: true, sz: 14, color: { rgb: 'FF0F172A' } },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    },
    tituloComision: {
      font: { bold: true, sz: 11, color: { rgb: 'FF334155' } },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    },
    tituloFecha: {
      font: { bold: true, sz: 11, color: { rgb: 'FF334155' } },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    },
    // Cabecera de cliente. Alterna amarillo / verde claro para separar visualmente
    // cada razón social en el sheet, igual que el modelo histórico de la hoja de
    // cálculo manual que maneja el cliente.
    clienteHeaderAmarillo: {
      font: { bold: true, sz: 11, color: { rgb: 'FF0F172A' } },
      fill: { fgColor: { rgb: 'FFFFEB3B' }, patternType: 'solid' as const },
      alignment: { horizontal: 'left' as const, vertical: 'center' as const, indent: 1 },
      border: borde,
    },
    clienteHeaderVerde: {
      font: { bold: true, sz: 11, color: { rgb: 'FF0F172A' } },
      fill: { fgColor: { rgb: 'FFC8E6A0' }, patternType: 'solid' as const },
      alignment: { horizontal: 'left' as const, vertical: 'center' as const, indent: 1 },
      border: borde,
    },
    columnaHeader: {
      font: { bold: true, sz: 10, color: { rgb: 'FF0F172A' } },
      fill: { fgColor: { rgb: 'FFE5E7EB' }, patternType: 'solid' as const },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const, wrapText: true },
      border: borde,
    },
    celdaTexto: {
      font: { sz: 10 },
      alignment: { vertical: 'center' as const },
      border: borde,
    },
    celdaFecha: {
      font: { sz: 10 },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const },
      border: borde,
    },
    celdaCantidad: {
      font: { sz: 10 },
      alignment: { horizontal: 'right' as const, vertical: 'center' as const },
      border: borde,
      numFmt: '#,##0',
    },
    celdaComision: {
      font: { sz: 10 },
      alignment: { horizontal: 'right' as const, vertical: 'center' as const },
      border: borde,
      numFmt: '"$ "#,##0.00',
    },
    // La tarifa aplicada es una etiqueta ("10%", "$0.015/kg"), no un monto:
    // va como texto y sin formato de moneda para que Excel no la confunda.
    celdaTarifa: {
      font: { sz: 10 },
      alignment: { horizontal: 'right' as const, vertical: 'center' as const },
      border: borde,
    },
    celdaEstado: {
      font: { sz: 10 },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const },
      border: borde,
    },
    // Fila TOTAL al cierre de cada cliente. Amarillo claro para distinguirla
    // del resto de la tabla sin saturar visualmente.
    totalFila: {
      font: { bold: true, sz: 10, color: { rgb: 'FF0F172A' } },
      fill: { fgColor: { rgb: 'FFFEF3C7' }, patternType: 'solid' as const },
      alignment: { horizontal: 'right' as const, vertical: 'center' as const },
      border: borde,
      numFmt: '"$ "#,##0.00',
    },
    totalFilaLabel: {
      font: { bold: true, sz: 10, color: { rgb: 'FF0F172A' } },
      fill: { fgColor: { rgb: 'FFFEF3C7' }, patternType: 'solid' as const },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const },
      border: borde,
    },
    // Gran total al pie del sheet: caja amarilla saturada, como el cierre del
    // formato manual que usa el cliente.
    granTotal: {
      font: { bold: true, sz: 11, color: { rgb: 'FF0F172A' } },
      fill: { fgColor: { rgb: 'FFFFEB3B' }, patternType: 'solid' as const },
      alignment: { horizontal: 'right' as const, vertical: 'center' as const },
      border: borde,
      numFmt: '"$ "#,##0.00',
    },
    granTotalLabel: {
      font: { bold: true, sz: 11, color: { rgb: 'FF0F172A' } },
      fill: { fgColor: { rgb: 'FFFFEB3B' }, patternType: 'solid' as const },
      alignment: { horizontal: 'left' as const, vertical: 'center' as const, indent: 1 },
      border: borde,
    },
    resumenTitulo: {
      font: { bold: true, sz: 14, color: { rgb: 'FF0F172A' } },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const },
      border: borde,
    },
    resumenTexto: {
      font: { sz: 10 },
      alignment: { vertical: 'center' as const },
      border: borde,
    },
    resumenFecha: {
      font: { sz: 10 },
      alignment: { horizontal: 'center' as const, vertical: 'center' as const },
      border: borde,
    },
    resumenCantidad: {
      font: { sz: 10 },
      alignment: { horizontal: 'right' as const, vertical: 'center' as const },
      border: borde,
      numFmt: '#,##0',
    },
    resumenComision: {
      font: { sz: 10 },
      alignment: { horizontal: 'right' as const, vertical: 'center' as const },
      border: borde,
      numFmt: '"$ "#,##0.00',
    },
    resumenTotal: {
      font: { bold: true, sz: 11, color: { rgb: 'FF0F172A' } },
      fill: { fgColor: { rgb: 'FFFFEB3B' }, patternType: 'solid' as const },
      alignment: { horizontal: 'right' as const, vertical: 'center' as const },
      border: borde,
      numFmt: '"$ "#,##0.00',
    },
    resumenTotalLabel: {
      font: { bold: true, sz: 11, color: { rgb: 'FF0F172A' } },
      fill: { fgColor: { rgb: 'FFFFEB3B' }, patternType: 'solid' as const },
      alignment: { horizontal: 'left' as const, vertical: 'center' as const, indent: 1 },
      border: borde,
    },
  };

  // ── Helpers de catálogo ──────────────────────────────────────────────────
  // El grupo empresarial es del CLIENTE de cada fila.
  const grupoPorClienteId = new Map(clientes.map(c => [c.id, c.grupo?.nombre]));
  const grupoPorClienteNombre = new Map(clientes.map(c => [normalizarTexto(c.nombre), c.grupo?.nombre]));
  const nombrePorClienteId = new Map(clientes.map(c => [c.id, c.nombre]));
  const razonSocialDelItem = (item: OrdenItem) =>
    item.cliente?.nombre || (item.clienteId && nombrePorClienteId.get(item.clienteId)) || 'N/A';
  // Solo los grupos empresariales y SANTA PRISCILA tienen hoja propia; el resto
  // de clientes sin grupo va a "VARIOS" (pedido del cliente, ago 2026).
  const grupoDelItem = (item: OrdenItem) =>
    (item.clienteId && grupoPorClienteId.get(item.clienteId)) ||
    (item.cliente?.nombre && grupoPorClienteNombre.get(normalizarTexto(item.cliente.nombre))) ||
    (normalizarTexto(razonSocialDelItem(item))?.includes('SANTA PRISCILA')
      ? 'SANTA PRISCILA'
      : 'N/A');

  // Fecha "AL" del reporte: el último día del rango (o el último pago si no hay
  // rango explícito). En Liquidación ya viene filtrado por mes de pago.
  const fechaCorte = (() => {
    if (items.length === 0) {
      const hoy = new Date();
      return `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
    }
    const maxFecha = items.reduce((max, it) => {
      const f = it.fechaPago || it.fecha;
      return f > max ? f : max;
    }, items[0].fechaPago || items[0].fecha);
    const [a, m, d] = maxFecha.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  })();

  // Línea "COMISIONES: {nombre(s)} - GRUPO {grupo}". Si hay comisionistas
  // filtrados, se listan; si no, se etiqueta como "Varios".
  const encabezadoComisionista =
    nombresSeleccionados.length > 0 ? nombresSeleccionados.join(' + ') : 'Varios';

  // ── Comisión y label por ítem ─────────────────────────────────────────────
  // Devuelve la comisión total (sumando los comisionistas seleccionados del
  // ítem) y un label legible con la tarifa aplicada. Prioridad de fuentes:
  //   1. Snapshot precomputado del caller (caso historial).
  //   2. Cálculo en vivo para los comisionistas filtrados (caso Liquidación).
  //   3. Suma de todos los comisionistas asignados (sin filtro).
  const detalleItem = (item: OrdenItem): { comision: number; tarifasLabel: string } => {
    // Solo las personas seleccionadas que realmente están asignadas al ítem:
    // si se mezclan A y B y la factura es solo de A, B no debe sumar comisión.
    const ownersDelItem = comisionistasOwner.filter(owner =>
      item.comisionistas.some(a => a.comisionistaId === owner.id)
    );

    if (comisionesSnapshot && comisionistasOwner.length > 0) {
      let comision = 0;
      let encontrado = false;
      const labels: string[] = [];
      for (const owner of ownersDelItem) {
        const snap = comisionesSnapshot.get(`${item.id}|${owner.id}`);
        if (!snap) continue;
        encontrado = true;
        comision += snap.comision;
        if (snap.tarifasLabel && snap.tarifasLabel !== '-') labels.push(snap.tarifasLabel);
      }
      if (encontrado) {
        return { comision, tarifasLabel: labels.length > 0 ? labels.join(' + ') : '-' };
      }
    }
    // Historial: no hay comisionista filtrado, pero el snapshot sí trae la
    // comisión congelada de cada asignación. Se usa tal cual en vez de
    // recalcular con las tarifas de hoy (que daría 0 o un valor distinto).
    if (comisionesSnapshot && comisionistasOwner.length === 0) {
      let comision = 0;
      let encontrado = false;
      const labels: string[] = [];
      for (const asig of item.comisionistas) {
        const snap = comisionesSnapshot.get(`${item.id}|${asig.comisionistaId}`);
        if (!snap) continue;
        encontrado = true;
        comision += snap.comision;
        if (snap.tarifasLabel && snap.tarifasLabel !== '-') labels.push(snap.tarifasLabel);
      }
      if (encontrado) {
        return { comision, tarifasLabel: labels.length > 0 ? labels.join(' + ') : '-' };
      }
    }
    if (comisionistasOwner.length > 0) {
      if (ownersDelItem.length === 0) {
        return { comision: 0, tarifasLabel: '-' };
      }
      let total = 0;
      const labels: string[] = [];
      for (const owner of ownersDelItem) {
        const kg = kgAcumuladoPorComisionista?.get(owner.id);
        const det = calcularDetalleComision(item, owner, tarifasClienteProducto, kg);
        total += det.comision;
        if (det.tarifasLabel && det.tarifasLabel !== '-') labels.push(det.tarifasLabel);
      }
      return { comision: total, tarifasLabel: labels.length > 0 ? labels.join(' + ') : '-' };
    }
    if (item.comisionistas.length === 0) {
      return { comision: 0, tarifasLabel: '-' };
    }
    let total = 0;
    const labels: string[] = [];
    for (const asig of item.comisionistas) {
      const com = comisionistaMap.get(asig.comisionistaId);
      if (!com) continue;
      const kg = kgAcumuladoPorComisionista?.get(asig.comisionistaId);
      const det = calcularDetalleComision(item, com, tarifasClienteProducto, kg);
      total += det.comision;
      if (det.tarifasLabel && det.tarifasLabel !== '-') labels.push(det.tarifasLabel);
    }
    return { comision: total, tarifasLabel: labels.length > 0 ? labels.join(' + ') : '-' };
  };

  // Comisionistas que se muestran en la columna "Comisionista" del resumen.
  // Con filtro activo solo se listan los seleccionados asignados al ítem.
  const nombresComisionistasDelItem = (item: OrdenItem): string => {
    if (nombresSeleccionados.length === 0) {
      return getNombresComisionistas(item, comisionistas);
    }
    const asignados = item.comisionistas
      .filter(a => idsSeleccionados.has(a.comisionistaId))
      .map(a => comisionistaMap.get(a.comisionistaId)?.nombre)
      .filter((nombre): nombre is string => !!nombre);
    if (asignados.length > 0) return asignados.join(', ');
    return item.comisionistas.length === 0 ? nombresSeleccionados.join(', ') : 'Sin asignar';
  };

  // ── Agrupación: una hoja por cliente (grupo) × razón social ───────────────
  // Formato histórico que pide el cliente: cada pestaña es la combinación del
  // grupo empresarial del cliente con la razón social (proveedor) que emitió la
  // factura. Ej.: "ACUARIOS DEL GOLFO - DINACUAMAR" y "ACUARIOS DEL GOLFO -
  // ELIZABETH OCHOA" van en hojas distintas. La razón social se normaliza para
  // unir variantes tipográficas de la misma empresa (con/sin "CIA.LTDA.") y se
  // muestra el nombre más largo visto, normalmente la razón social legal.
  type HojaExportacion = { grupo: string; razonSocial: string; items: OrdenItem[] };
  const itemsPorHoja = new Map<string, HojaExportacion>();
  items.forEach(item => {
    const grupoItem = grupoDelItem(item);
    const grupo = !grupoItem || grupoItem === 'N/A' ? 'VARIOS' : grupoItem;
    const proveedor = item.proveedor?.trim() || 'Sin proveedor';
    const clave = `${normalizarTexto(grupo)}|${normalizarRazonSocial(proveedor) || 'SIN PROVEEDOR'}`;
    const hoja = itemsPorHoja.get(clave);
    if (hoja) {
      hoja.items.push(item);
      if (proveedor.length > hoja.razonSocial.length) hoja.razonSocial = proveedor;
    } else {
      itemsPorHoja.set(clave, { grupo, razonSocial: proveedor, items: [item] });
    }
  });
  const hojasOrdenadas = Array.from(itemsPorHoja.values()).sort((a, b) =>
    a.grupo.localeCompare(b.grupo, 'es') || a.razonSocial.localeCompare(b.razonSocial, 'es')
  );

  // ── RESUMEN GENERAL (hoja de auditoría rápida) ────────────────────────────
  // Mantenemos esta hoja porque en el historial servía para encontrar líneas
  // sin abrir cada hoja por grupo/razón social. Se llena mientras se arman las hojas.
  // `t` fuerza el tipo de dato de la celda. Sin él, xlsx-js-style escribe los
  // objetos { v, s } como texto y Excel no deja hacer fórmulas con ellos.
  type CeldaResumen = string | number | { v: string | number; s?: XLSX.CellStyle; t?: 's' | 'n' };
  const resumen: CeldaResumen[][] = [
    ['RESUMEN GENERAL'],
    [],
    ['Fecha', 'Factura', 'Producto', 'Cantidad', 'Tarifa', 'Valor Comisión', 'Estado', 'Sector', 'Comisionista', 'Grupo', 'Razón social'],
  ];
  let totalGeneral = 0;
  const nombresHojaUsados = new Set<string>(['RESUMEN GENERAL']);

  // ── Una hoja por grupo × razón social ─────────────────────────────────────
  // Tipo compartido por todas las celdas del sheet: string crudo (separadores,
  // totales a cero) o { v, s } con estilo. Definido una sola vez acá arriba
  // para que las tres hojas (cabecera, secciones, gran total) usen la misma
  // estructura y `aoa_to_sheet` no se queje.
  type Celda = string | { v: string | number; s?: XLSX.CellStyle; t?: 's' | 'n' };
  type Fila = Celda[];

  hojasOrdenadas.forEach(({ grupo: nombreGrupo, razonSocial: nombreRazonSocial, items: itemsHoja }) => {
    const itemsGrupo = itemsHoja;

    // Estructura de la hoja: filas y celdas con estilos. Mantenemos las dos
    // listas en paralelo para poder resolver estilos al final y construir los
    // rangos de merge (cabeceras que abarcan todas las columnas).
    const numCols = 8; // Fecha | Factura | Producto | Cant | Comisión | Valor a Comisionar | Estado | Sector
    const filas: Fila[] = [];
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];

    // ── Cabecera de la hoja ──
    filas.push([{ v: 'INDUSTRIAL ACUICOLA OCHOA Y BARCIA DINACUAMAR CIA LTDA', s: estilos.tituloEmpresa }]);
    merges.push({ s: { r: filas.length - 1, c: 0 }, e: { r: filas.length - 1, c: numCols - 1 } });

    filas.push([{ v: `COMISIONES: ${encabezadoComisionista} - GRUPO ${nombreGrupo}`, s: estilos.tituloComision }]);
    merges.push({ s: { r: filas.length - 1, c: 0 }, e: { r: filas.length - 1, c: numCols - 1 } });

    filas.push([{ v: `RAZÓN SOCIAL: ${nombreRazonSocial}`, s: estilos.tituloComision }]);
    merges.push({ s: { r: filas.length - 1, c: 0 }, e: { r: filas.length - 1, c: numCols - 1 } });

    filas.push([{ v: `AL ${fechaCorte}`, s: estilos.tituloFecha }]);
    merges.push({ s: { r: filas.length - 1, c: 0 }, e: { r: filas.length - 1, c: numCols - 1 } });

    // Espacio en blanco para que la cabecera respire antes de los totales / secciones.
    filas.push(Array.from({ length: numCols }, () => ''));

    // ── Secciones por cliente (razón social del cliente) ──
    const itemsPorCliente = new Map<string, OrdenItem[]>();
    itemsGrupo.forEach(item => {
      const nombreCliente = razonSocialDelItem(item);
      const arr = itemsPorCliente.get(nombreCliente) || [];
      arr.push(item);
      itemsPorCliente.set(nombreCliente, arr);
    });
    const clientesOrdenados = Array.from(itemsPorCliente.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], 'es')
    );

    let totalGrupo = 0;
    clientesOrdenados.forEach(([nombreCliente, itemsCliente], idx) => {
      // Cabecera del cliente: amarillo para el primero (cliente principal),
      // verde claro para el resto. Coincide con la hoja histórica del cliente
      // donde el "primer cliente" del grupo va destacado en amarillo.
      const estiloClienteHeader =
        idx === 0 ? estilos.clienteHeaderAmarillo : estilos.clienteHeaderVerde;

      filas.push([{ v: nombreCliente, s: estiloClienteHeader }]);
      merges.push({ s: { r: filas.length - 1, c: 0 }, e: { r: filas.length - 1, c: numCols - 1 } });

      // Cabecera de columnas
      const headerCols = ['Fecha', 'Factura', 'Producto', 'Cant', 'Comisión', 'Valor a Comisionar', 'Estado', 'Sector'];
      filas.push(headerCols.map(c => ({ v: c, s: estilos.columnaHeader })));

      // Filas de datos, ordenadas por fecha → sector → factura (mismo criterio
      // que el resto de exports para que la auditoría sea consistente).
      const itemsOrdenados = [...itemsCliente].sort(
        (a, b) =>
          a.fecha.localeCompare(b.fecha) ||
          sectorParaOrden(a, b) ||
          a.numeroOrden.localeCompare(b.numeroOrden)
      );

      let totalCliente = 0;
      itemsOrdenados.forEach(item => {
        const { comision, tarifasLabel } = detalleItem(item);
        totalCliente += comision;

        // Fecha en formato dd/mm/aa (cortita, como la hoja histórica).
        let fechaCorta = '';
        if (item.fecha) {
          const [a, m, d] = item.fecha.slice(0, 10).split('-');
          fechaCorta = `${d}/${m}/${a.slice(2)}`;
        }

        filas.push([
          { v: fechaCorta, s: estilos.celdaFecha, t: 's' },
          { v: item.numeroOrden, s: estilos.celdaTexto, t: 's' },
          { v: item.producto, s: estilos.celdaTexto, t: 's' },
          { v: item.cantidad, s: estilos.celdaCantidad, t: 'n' },
          { v: tarifasLabel, s: estilos.celdaTarifa, t: 's' },
          { v: comision, s: estilos.celdaComision, t: 'n' },
          { v: item.estado || 'pagada', s: estilos.celdaEstado, t: 's' },
          { v: sectorDeItem(item) || 'N/A', s: estilos.celdaTexto, t: 's' },
        ]);

        // Alimentamos el RESUMEN GENERAL con cada línea.
        resumen.push([
          item.fecha,
          item.numeroOrden,
          item.producto,
          item.cantidad,
          tarifasLabel,
          comision,
          item.estado || 'pagada',
          sectorDeItem(item) || 'N/A',
          nombresComisionistasDelItem(item),
          grupoDelItem(item),
          razonSocialDelItem(item),
        ]);
      });

      // Fila TOTAL por cliente (label en la columna Cant para alinearla con el
      // formato histórico: "TOTAL" como cuarta columna, monto en la sexta).
      filas.push([
        { v: '', s: estilos.totalFilaLabel, t: 's' },
        { v: '', s: estilos.totalFilaLabel, t: 's' },
        { v: '', s: estilos.totalFilaLabel, t: 's' },
        { v: 'TOTAL', s: estilos.totalFilaLabel, t: 's' },
        { v: '', s: estilos.totalFila, t: 's' },
        { v: totalCliente, s: estilos.totalFila, t: 'n' },
        { v: '', s: estilos.totalFilaLabel, t: 's' },
        { v: '', s: estilos.totalFilaLabel, t: 's' },
      ]);

      // Separador entre clientes.
      filas.push(Array.from({ length: numCols }, () => ''));

      totalGrupo += totalCliente;
    });

    // Gran TOTAL de la hoja al pie (caja amarilla como en el modelo).
    filas.push([
      { v: '', s: estilos.granTotalLabel, t: 's' },
      { v: '', s: estilos.granTotalLabel, t: 's' },
      { v: '', s: estilos.granTotalLabel, t: 's' },
      { v: '', s: estilos.granTotalLabel, t: 's' },
      { v: `Total ${nombreGrupo}`, s: estilos.granTotalLabel, t: 's' },
      { v: totalGrupo, s: estilos.granTotal, t: 'n' },
      { v: '', s: estilos.granTotalLabel, t: 's' },
      { v: '', s: estilos.granTotalLabel, t: 's' },
    ]);

    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 10 },  // Fecha
      { wch: 22 },  // Factura
      { wch: 28 },  // Producto
      { wch: 10 },  // Cant
      { wch: 16 },  // Comisión
      { wch: 18 },  // Valor a Comisionar
      { wch: 12 },  // Estado
      { wch: 14 },  // Sector
    ];
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      nombreHojaValido(`${nombreGrupo} ${nombreRazonSocial}`, nombresHojaUsados)
    );
    totalGeneral += totalGrupo;
  });

  // ── Hoja RESUMEN GENERAL ─────────────────────────────────────────────────
    const encabezado = resumen.slice(0, 3);
    const filasDatos = resumen.slice(3);
    filasDatos.sort(
      (a, b) =>
        String(a[0]).localeCompare(String(b[0])) ||
        String(a[7]).localeCompare(String(b[7]), 'es') ||
        String(a[1]).localeCompare(String(b[1]))
    );
    resumen.length = 0;
    resumen.push(...encabezado, ...filasDatos);

  const resumenEstilizado: CeldaResumen[][] = [
    [
      { v: 'RESUMEN GENERAL', s: estilos.resumenTitulo, t: 's' },
      ...Array.from({ length: 10 }, () => ''),
    ],
    Array.from({ length: 11 }, () => ''),
    resumen[2].map(valor => ({ v: String(valor), s: estilos.columnaHeader, t: 's' })),
    ...filasDatos.map(fila =>
      fila.map((valor, indice) => {
        // Cantidad (3) y Valor Comisión (5) son las columnas numéricas del resumen.
        const esColumnaNumerica = indice === 3 || indice === 5;
        return {
          v: typeof valor === 'object' ? valor.v : valor,
          s: indice === 0
            ? estilos.resumenFecha
            : indice === 3
              ? estilos.resumenCantidad
              : indice === 5
                ? estilos.resumenComision
                : estilos.resumenTexto,
          t: esColumnaNumerica ? 'n' as const : 's' as const,
        };
      })
    ),
  ];
  resumenEstilizado.push(
    Array.from({ length: 11 }, () => ''),
    [
      ...Array.from({ length: 5 }, () => ({ v: '', s: estilos.resumenTotalLabel, t: 's' as const })),
      { v: totalGeneral, s: estilos.resumenTotal, t: 'n' as const },
      ...Array.from({ length: 3 }, () => ({ v: '', s: estilos.resumenTotalLabel, t: 's' as const })),
      { v: 'TOTAL GENERAL', s: estilos.resumenTotalLabel, t: 's' as const },
      { v: '', s: estilos.resumenTotalLabel, t: 's' as const },
    ],
  );
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenEstilizado);
  wsResumen['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];
  wsResumen['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 25 },
    { wch: 10 },
    { wch: 16 },
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
    { wch: 22 },
    { wch: 18 },
    { wch: 30 },
  ];
  // Filtros nativos de Excel sobre Fecha y Sector (y resto) + congelar cabecera
  // para facilitar la auditoría sin reordenar manualmente.
  if (filasDatos.length > 0) {
    const lastDataRow = resumenEstilizado.length - 2; // sin contar fila vacía + total
    // Fila 3 (índice 2) es la cabecera: A3:K<lastDataRow>
    wsResumen['!autofilter'] = { ref: `A3:K${lastDataRow}` };
  }
  // Congelar filas de título para que la cabecera quede visible al scrollear.
  // `!freeze` es una extensión oficiosa del tipo público WorkSheet (la firma
  // no lo expone), así que vamos por Reflect.set para no tocar el tipo del
  // worksheet a mano.
  Reflect.set(wsResumen, '!freeze', {
    xSplit: 0,
    ySplit: 3,
    topLeftCell: 'A4',
    activePane: 'bottomRight',
    state: 'frozen',
  });
  XLSX.utils.book_append_sheet(wb, wsResumen, 'RESUMEN GENERAL');
  wb.SheetNames.unshift(wb.SheetNames.pop()!); // ponytail: book_append_sheet solo agrega al final

  XLSX.writeFile(wb, `${titulo.replace(/\s+/g, '_')}.xlsx`);
}

function getUltimoDiaMes(mes: number, anio: number): number {
  return new Date(anio, mes, 0).getDate();
}

export function parseCSV(csvText: string): Partial<OrdenItem>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const result: Partial<OrdenItem>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });

    result.push({
      fecha: row.fecha || row.date || '',
      numeroOrden: row['numero orden'] || row.orden || row.factura || row.invoice || '',
      finca: row.finca || row.sector || row.farm || '',
      producto: row.producto || row.product || '',
      cantidad: parseFloat(row.cantidad || row.quantity || '0') || 0,
      unidad: row.unidad || row.unit || 'kg',
      precioUnitario: parseFloat(row['precio unitario'] || row.precio || row.price || '0') || 0,
      total: parseFloat(row.total || row.amount || '0') || undefined,
    });
  }

  return result;
}

// ===== Funciones para reportes avanzados =====

export interface FiltroReporte {
  fechaDesde: string;
  fechaHasta: string;
  fincas: string[];
  productos: string[];
  comisionistas: string[];
  clientes: string[];
}

export function filtrarItems(items: OrdenItem[], filtros: FiltroReporte): OrdenItem[] {
  return items.filter(item => {
    const fechaOk = (!filtros.fechaDesde || item.fecha >= filtros.fechaDesde) &&
                    (!filtros.fechaHasta || item.fecha <= filtros.fechaHasta);
    const fincaOk = filtros.fincas.length === 0 || filtros.fincas.includes(item.finca) || (item.fincaRel?.nombre ? filtros.fincas.includes(item.fincaRel.nombre) : false);
    const productoOk = filtros.productos.length === 0 || filtros.productos.includes(item.producto) || (item.productoRel?.nombre ? filtros.productos.includes(item.productoRel.nombre) : false);
    const comisionistaOk = filtros.comisionistas.length === 0 ||
      item.comisionistas.some(a => filtros.comisionistas.includes(a.comisionistaId));
    const clienteOk = filtros.clientes.length === 0 || (item.cliente?.nombre ? filtros.clientes.includes(item.cliente.nombre) : false);
    return fechaOk && fincaOk && productoOk && comisionistaOk && clienteOk;
  });
}

export interface ResumenPorFinca {
  nombre: string;
  ordenes: number;
  cantidad: number;
  total: number;
  comision: number;
}

export function agruparPorFinca(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  tarifasEspecificas: TarifaClienteProducto[] = []
): ResumenPorFinca[] {
  const map = new Map<string, ResumenPorFinca>();
  items.forEach(item => {
    const finca = item.finca || 'Sin sector';
    const comision = calcularComisionTotalItem(item, comisionistas, tarifasEspecificas);
    const existente = map.get(finca);
    if (existente) {
      existente.ordenes += 1;
      existente.cantidad += item.cantidad;
      existente.total += item.total;
      existente.comision += comision;
    } else {
      map.set(finca, { nombre: finca, ordenes: 1, cantidad: item.cantidad, total: item.total, comision });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export interface ResumenPorProducto {
  nombre: string;
  ordenes: number;
  cantidad: number;
  total: number;
  comision: number;
}

export function agruparPorProducto(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  tarifasEspecificas: TarifaClienteProducto[] = []
): ResumenPorProducto[] {
  const map = new Map<string, ResumenPorProducto>();
  items.forEach(item => {
    const producto = item.producto || 'Sin producto';
    const comision = calcularComisionTotalItem(item, comisionistas, tarifasEspecificas);
    const existente = map.get(producto);
    if (existente) {
      existente.ordenes += 1;
      existente.cantidad += item.cantidad;
      existente.total += item.total;
      existente.comision += comision;
    } else {
      map.set(producto, { nombre: producto, ordenes: 1, cantidad: item.cantidad, total: item.total, comision });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export interface ResumenPorComisionista {
  id: string;
  nombre: string;
  tarifas: string;
  ordenes: number;
  totalComision: number;
  totalOrden: number;
}

export function agruparPorComisionista(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  tarifasEspecificas: TarifaClienteProducto[] = [],
  // Cuando se filtra por comisionista, solo desglosar a los seleccionados: una
  // orden puede tener varios asignados y no queremos mostrar los que no se filtraron.
  comisionistasFiltro: string[] = []
): ResumenPorComisionista[] {
  const map = new Map<string, ResumenPorComisionista>();
  items.forEach(item => {
    item.comisionistas.forEach(asig => {
      if (comisionistasFiltro.length > 0 && !comisionistasFiltro.includes(asig.comisionistaId)) return;
      const com = comisionistas.find(c => c.id === asig.comisionistaId);
      if (!com) return;
      const existente = map.get(com.id);
      const detalle = calcularDetalleComision(item, com, tarifasEspecificas);
      const comision = detalle.comision;
      if (existente) {
        existente.ordenes += 1;
        existente.totalComision += comision;
        existente.totalOrden += item.total;
      } else {
        map.set(com.id, {
          id: com.id,
          nombre: com.nombre,
          tarifas: getTarifasLabel(com),
          ordenes: 1,
          totalComision: comision,
          totalOrden: item.total,
        });
      }
    });
  });
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export interface ResumenPorCliente {
  nombre: string;
  ordenes: number;
  cantidad: number;
  total: number;
  comision: number;
}

export function agruparPorCliente(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  tarifasEspecificas: TarifaClienteProducto[] = []
): ResumenPorCliente[] {
  const map = new Map<string, ResumenPorCliente>();
  items.forEach(item => {
    const cliente = item.cliente?.nombre || 'Sin cliente';
    const comision = calcularComisionTotalItem(item, comisionistas, tarifasEspecificas);
    const existente = map.get(cliente);
    if (existente) {
      existente.ordenes += 1;
      existente.cantidad += item.cantidad;
      existente.total += item.total;
      existente.comision += comision;
    } else {
      map.set(cliente, { nombre: cliente, ordenes: 1, cantidad: item.cantidad, total: item.total, comision });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function ultimoDiaMes(anio: number, mes0: number): number {
  return new Date(anio, mes0 + 1, 0).getDate();
}

/** Rango [inicio, fin] de un trimestre (1-4) de un año, en ISO YYYY-MM-DD. */
export function trimestreRango(anio: number, trimestre: number): { inicio: string; fin: string } {
  const mesInicio = (trimestre - 1) * 3;
  const mesFin = mesInicio + 2;
  const inicio = `${anio}-${String(mesInicio + 1).padStart(2, '0')}-01`;
  const fin = `${anio}-${String(mesFin + 1).padStart(2, '0')}-${ultimoDiaMes(anio, mesFin)}`;
  return { inicio, fin };
}

/** Rango de un semestre (1 = ene-jun, 2 = jul-dic). */
export function semestreRango(anio: number, semestre: number): { inicio: string; fin: string } {
  const tInicio = semestre === 1 ? 1 : 3;
  return { inicio: trimestreRango(anio, tInicio).inicio, fin: trimestreRango(anio, tInicio + 1).fin };
}

/** Rango de un año completo. */
export function anioRango(anio: number): { inicio: string; fin: string } {
  return { inicio: `${anio}-01-01`, fin: `${anio}-12-31` };
}

export function getTrimestreActual(): { inicio: string; fin: string } {
  const now = new Date();
  return trimestreRango(now.getFullYear(), Math.floor(now.getMonth() / 3) + 1);
}

/**
 * Renderiza un gráfico de barras horizontales con Chart.js en un canvas fuera de
 * pantalla y devuelve el PNG (dataURL) para incrustar en el PDF. Solo cliente.
 * Muestra hasta `maxBarras` categorías ordenadas por valor.
 */
async function graficoBarrasPNG(
  titulo: string,
  datos: { nombre: string; valor: number }[],
  maxBarras = 12
): Promise<{ png: string; width: number; height: number } | null> {
  const top = [...datos].sort((a, b) => b.valor - a.valor).slice(0, maxBarras);
  if (top.length === 0) return null;

  const { default: Chart } = await import('chart.js/auto');

  const width = 1200;
  const height = 90 + top.length * 42;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top.map(d => d.nombre),
      datasets: [{
        label: 'Comisión',
        data: top.map(d => d.valor),
        backgroundColor: '#2563eb',
        borderRadius: 4,
        maxBarThickness: 26,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      animation: false,
      devicePixelRatio: 1,
      layout: { padding: 12 },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: titulo,
          align: 'start',
          font: { size: 18, weight: 'bold' },
          color: '#0f172a',
          padding: { bottom: 12 },
        },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          grid: { color: '#e2e8f0' },
          ticks: {
            color: '#64748b',
            font: { size: 12 },
            callback: (v) => '$' + Number(v).toLocaleString('es-ES'),
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#334155', font: { size: 13 } },
        },
      },
    },
  });

  const png = canvas.toDataURL('image/png');
  chart.destroy();
  return { png, width, height };
}

export async function exportarReportePDF(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  titulo: string,
  filtros: FiltroReporte,
  tarifasEspecificas: TarifaClienteProducto[] = []
) {
  const doc = new jsPDF({ orientation: 'portrait', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let yPos = 15;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.', pageWidth / 2, yPos, { align: 'center' });
  yPos += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Reporte de Comisiones', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  // Filtros aplicados
  doc.setFontSize(8);
  const filtroTextos: string[] = [];
  if (filtros.fechaDesde || filtros.fechaHasta) {
    filtroTextos.push(`Período: ${filtros.fechaDesde || '...'} al ${filtros.fechaHasta || '...'}`);
  }
  if (filtros.fincas.length > 0) filtroTextos.push(`Sectores: ${filtros.fincas.join(', ')}`);
  if (filtros.productos.length > 0) filtroTextos.push(`Productos: ${filtros.productos.join(', ')}`);
  if (filtros.comisionistas.length > 0) {
    const nombres = filtros.comisionistas.map(id => comisionistas.find(c => c.id === id)?.nombre || id);
    filtroTextos.push(`Comisionistas: ${nombres.join(', ')}`);
  }

  if (filtroTextos.length > 0) {
    filtroTextos.forEach(txt => {
      doc.text(txt, margin, yPos);
      yPos += 4;
    });
    yPos += 4;
  }

  const resumenFincas = agruparPorFinca(items, comisionistas, tarifasEspecificas);
  const resumenProductos = agruparPorProducto(items, comisionistas, tarifasEspecificas);
  const resumenComisionistas = agruparPorComisionista(items, comisionistas, tarifasEspecificas, filtros.comisionistas);

  // Gráficos (Chart.js → imagen). Cada uno se incrusta manteniendo su proporción.
  const anchoUtil = pageWidth - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  const graficos = [
    { titulo: 'Comisión por Comisionista', datos: resumenComisionistas.map(c => ({ nombre: c.nombre, valor: c.totalComision })) },
    { titulo: 'Comisión por Sector', datos: resumenFincas.map(f => ({ nombre: f.nombre, valor: f.comision })) },
    { titulo: 'Comisión por Producto', datos: resumenProductos.map(p => ({ nombre: p.nombre, valor: p.comision })) },
  ];
  for (const g of graficos) {
    const img = await graficoBarrasPNG(g.titulo, g.datos);
    if (!img) continue;
    const imgH = (anchoUtil * img.height) / img.width;
    if (yPos + imgH > pageHeight - margin) { doc.addPage(); yPos = 15; }
    doc.addImage(img.png, 'PNG', margin, yPos, anchoUtil, imgH);
    yPos += imgH + 6;
  }
  if (yPos > pageHeight - 60) { doc.addPage(); yPos = 15; }

  // Tabla por finca
  if (resumenFincas.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen por Sector', margin, yPos);
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Sector', 'Órdenes', 'Cantidad', 'Total', 'Comisión']],
      body: resumenFincas.map(f => [
        f.nombre,
        f.ordenes.toString(),
        f.cantidad.toLocaleString('es-ES'),
        `$ ${f.total.toFixed(2).replace('.', ',')}`,
        `$ ${f.comision.toFixed(2).replace('.', ',')}`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // Tabla por comisionista
  if (resumenComisionistas.length > 0) {
    if (yPos > 200) { doc.addPage(); yPos = 15; }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen por Comisionista', margin, yPos);
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Comisionista', 'Tarifas', 'Órdenes', 'Total Orden', 'Comisión']],
      body: resumenComisionistas.map(c => [
        c.nombre,
        c.tarifas,
        c.ordenes.toString(),
        `$ ${c.totalOrden.toFixed(2).replace('.', ',')}`,
        `$ ${c.totalComision.toFixed(2).replace('.', ',')}`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // Tabla por producto
  if (resumenProductos.length > 0) {
    if (yPos > 200) { doc.addPage(); yPos = 15; }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen por Producto', margin, yPos);
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Producto', 'Órdenes', 'Cantidad', 'Total', 'Comisión']],
      body: resumenProductos.map(p => [
        p.nombre,
        p.ordenes.toString(),
        p.cantidad.toLocaleString('es-ES'),
        `$ ${p.total.toFixed(2).replace('.', ',')}`,
        `$ ${p.comision.toFixed(2).replace('.', ',')}`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
  }

  doc.save(`${titulo.replace(/\s+/g, '_')}.pdf`);
}

export function exportarReporteExcel(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  titulo: string,
  filtros: FiltroReporte,
  tarifasEspecificas: TarifaClienteProducto[] = []
) {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Resumen por Sector
  const resumenFincas = agruparPorFinca(items, comisionistas, tarifasEspecificas);
  const wsFincas = XLSX.utils.aoa_to_sheet([
    ['Reporte de Comisiones - Resumen por Sector'],
    ['Sector', 'Órdenes', 'Cantidad', 'Total', 'Comisión'],
    ...resumenFincas.map(f => [f.nombre, f.ordenes, f.cantidad, f.total, f.comision]),
  ]);
  wsFincas['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsFincas, 'Por Sector');

  // Hoja 2: Resumen por Producto
  const resumenProductos = agruparPorProducto(items, comisionistas, tarifasEspecificas);
  const wsProductos = XLSX.utils.aoa_to_sheet([
    ['Reporte de Comisiones - Resumen por Producto'],
    ['Producto', 'Órdenes', 'Cantidad', 'Total', 'Comisión'],
    ...resumenProductos.map(p => [p.nombre, p.ordenes, p.cantidad, p.total, p.comision]),
  ]);
  wsProductos['!cols'] = [{ wch: 35 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsProductos, 'Por Producto');

  // Hoja 3: Resumen por Comisionista
  const resumenComisionistas = agruparPorComisionista(items, comisionistas, tarifasEspecificas, filtros.comisionistas);
  const wsComisionistas = XLSX.utils.aoa_to_sheet([
    ['Reporte de Comisiones - Resumen por Comisionista'],
    ['Comisionista', 'Tarifas', 'Órdenes', 'Total Orden', 'Comisión'],
    ...resumenComisionistas.map(c => [c.nombre, c.tarifas, c.ordenes, c.totalOrden, c.totalComision]),
  ]);
  wsComisionistas['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsComisionistas, 'Por Comisionista');

  XLSX.writeFile(wb, `${titulo.replace(/\s+/g, '_')}.xlsx`);
}
