import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { OrdenItem, Comisionista, TarifaClienteProducto, Cliente } from '@/types';
import {
  normalizarTexto,
  normalizarNombreFinca,
  normalizarNombreProducto,
  normalizarRazonSocial,
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

// Igual que la global salvo que el porcentaje se aplica sobre el total menos la
// retención del cliente.
export function calcularComisionPorTarifaEspecifica(
  item: OrdenItem,
  tarifa: TarifaClienteProducto
): number {
  if (tarifa.tipo === 'porcentaje') {
    const retencion = item.cliente?.retencionPorcentaje ?? 1.75;
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
    return !!nt && !!ni && nt === ni;
  };

  const coincideFinca = (tarifa: TarifaClienteProducto) => {
    if (!tarifa.fincaId) return true; // tarifa sin finca aplica a cualquier finca
    if (tarifa.fincaId && item.fincaId && tarifa.fincaId === item.fincaId) return true;
    const nt = normalizarNombreFinca(nombreRelacion(tarifa.finca));
    const ni = normalizarNombreFinca(nombreFincaItem);
    return !!nt && !!ni && nt === ni;
  };

  const tarifaAplicaParaProveedor = (tarifa: TarifaClienteProducto) => {
    if (tarifa.proveedoresExcluidos?.length) {
      const excluidos = tarifa.proveedoresExcluidos.map(normalizarTexto);
      if (excluidos.includes(proveedorOrden)) return false;
    }
    if (!tarifa.proveedor) return true;
    return normalizarTexto(tarifa.proveedor) === proveedorOrden;
  };

  const candidatas = tarifas.filter(
    (tarifa) =>
      tarifa.comisionistaId === comisionistaId &&
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
  return comisionista.tarifas.reduce((sum, tarifa) => {
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
      const itemsDelGrupo = mesesMap.get(mesKey)!;
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

      // Preparar body de la tabla
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
          item.sector || item.finca || '-',
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
  nombreComisionista?: string,
  tarifasClienteProducto: TarifaClienteProducto[] = [],
  comisionesSnapshot?: Map<string, { comision: number; tarifasLabel: string }>,
  kgAcumuladoPorComisionista?: Map<string, number>,
  clientes: Cliente[] = []
) {
  const comisionistaMap = new Map(comisionistas.map(c => [c.id, c]));
  const wb = XLSX.utils.book_new();

  const nombresMes = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // El grupo empresarial es del CLIENTE de cada fila (las hojas siguen siendo por razón social/proveedor).
  const grupoPorClienteId = new Map(clientes.map(c => [c.id, c.grupo?.nombre]));
  const grupoPorClienteNombre = new Map(clientes.map(c => [normalizarTexto(c.nombre), c.grupo?.nombre]));
  const grupoDelItem = (item: OrdenItem) =>
    (item.clienteId && grupoPorClienteId.get(item.clienteId)) ||
    (item.cliente?.nombre && grupoPorClienteNombre.get(normalizarTexto(item.cliente.nombre))) ||
    'N/A';

  // Una hoja por (grupo empresarial del cliente × razón social del proveedor):
  // "ACUARIOS DEL GOLFO - DINACUAMAR" y "ACUARIOS DEL GOLFO - ELIZABETH OCHOA"
  // van en hojas distintas. La razón social se normaliza para que variantes
  // tipográficas de la misma empresa (con/sin "CIA.LTDA.") caigan juntas; se
  // muestra el nombre más largo visto (normalmente el nombre legal completo).
  // Clientes sin grupo → "VARIOS".
  const itemsPorHoja = new Map<string, { grupo: string; nombre: string; items: OrdenItem[] }>();
  items.forEach(item => {
    const prov = item.proveedor?.trim() || 'Sin proveedor';
    const grupoNombre = grupoDelItem(item) === 'N/A' ? 'VARIOS' : grupoDelItem(item);
    const clave = `${normalizarTexto(grupoNombre)}|${normalizarRazonSocial(prov) || 'Sin proveedor'}`;
    const hoja = itemsPorHoja.get(clave);
    if (hoja) {
      hoja.items.push(item);
      if (prov.length > hoja.nombre.length) hoja.nombre = prov;
    } else {
      itemsPorHoja.set(clave, { grupo: grupoNombre, nombre: prov, items: [item] });
    }
  });

  const gruposProveedor = Array.from(itemsPorHoja.values()).sort((a, b) =>
    a.grupo.localeCompare(b.grupo, 'es') || a.nombre.localeCompare(b.nombre, 'es')
  );
  const nombresHojaUsados = new Set<string>();

  gruposProveedor.forEach(({ grupo: nombreGrupo, nombre: nombreProveedor, items: itemsProveedor }) => {

    // Agrupar items por comisionista, luego por mes (formato original por hoja)
    const itemsPorComisionista = new Map<string, Map<string, OrdenItem[]>>();
    itemsProveedor.forEach(item => {
      const comIds = item.comisionistas.length > 0
        ? item.comisionistas.map(asig => asig.comisionistaId || 'sin-asignar')
        : ['sin-asignar'];
      comIds.forEach(comId => {
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
    });

    const comisionistaIds = Array.from(itemsPorComisionista.keys()).sort((a, b) => {
      const comA = comisionistaMap.get(a);
      const comB = comisionistaMap.get(b);
      return (comA?.nombre || '').localeCompare(comB?.nombre || '');
    });

    const data: any[] = [];
    let totalProveedor = 0;

    data.push([`Grupo: ${nombreGrupo}  —  Razón social: ${nombreProveedor}`]);
    data.push([]);

    comisionistaIds.forEach(comId => {
      const com = comisionistaMap.get(comId);
      const comNombre = com?.nombre || 'Sin asignar';
      const mesesMap = itemsPorComisionista.get(comId)!;
      const meses = Array.from(mesesMap.keys()).sort();

      meses.forEach(mesKey => {
        const itemsDelGrupo = mesesMap.get(mesKey)!;
        const [anio, mes] = mesKey.split('-');
        const nombreMes = nombresMes[parseInt(mes) - 1];
        const ultimoDia = getUltimoDiaMes(parseInt(mes), parseInt(anio));

        data.push(['INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.']);
        data.push(['Sistema de Liquidación de Comisiones']);
        data.push([`Comisionista: ${comNombre} del 1 al ${ultimoDia} de ${nombreMes} ${anio}`]);
        data.push([]);
        data.push(['Fecha', 'Factura', 'Nombre', 'Cantidad', 'Tipo Comisión', 'Valor de Comisión', 'Estado', 'Sector', 'Grupo']);

        let totalGrupo = 0;
        itemsDelGrupo.forEach(item => {
          let comision = 0;
          let tarifasLabel = '-';
          const snapshotKey = `${item.id}|${comId}`;
          if (comisionesSnapshot?.has(snapshotKey)) {
            const snap = comisionesSnapshot.get(snapshotKey)!;
            comision = snap.comision;
            tarifasLabel = snap.tarifasLabel;
          } else {
            const detalle = com
              ? calcularDetalleComision(item, com, tarifasClienteProducto, kgAcumuladoPorComisionista?.get(comId))
              : undefined;
            comision = detalle?.comision || 0;
            tarifasLabel = detalle?.tarifasLabel || '-';
          }
          totalGrupo += comision;
          data.push([
            item.fecha,
            item.numeroOrden,
            item.producto,
            item.cantidad,
            tarifasLabel,
            `$ ${comision.toFixed(2).replace('.', ',')}`,
            item.estado || 'pagada',
            item.sector || item.finca || 'N/A',
            grupoDelItem(item),
          ]);
        });

        data.push(['', '', '', '', '', `$ ${totalGrupo.toFixed(2).replace('.', ',')}`, '', '', '']);
        data.push([]);

        totalProveedor += totalGrupo;
      });
    });

    data.push(['', '', '', '', '', 'TOTAL', `$ ${totalProveedor.toFixed(2).replace('.', ',')}`, '', '']);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 25 },
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
      { wch: 10 },
      { wch: 10 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, nombreHojaValido(`${nombreGrupo} ${nombreProveedor}`, nombresHojaUsados));
  });

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
  tarifasEspecificas: TarifaClienteProducto[] = []
): ResumenPorComisionista[] {
  const map = new Map<string, ResumenPorComisionista>();
  items.forEach(item => {
    item.comisionistas.forEach(asig => {
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

export function getTrimestreActual(): { inicio: string; fin: string } {
  const now = new Date();
  const mes = now.getMonth();
  const anio = now.getFullYear();
  const trimestre = Math.floor(mes / 3);
  const mesInicio = trimestre * 3;
  const mesFin = mesInicio + 2;
  const inicio = `${anio}-${String(mesInicio + 1).padStart(2, '0')}-01`;
  const ultimoDia = new Date(anio, mesFin + 1, 0).getDate();
  const fin = `${anio}-${String(mesFin + 1).padStart(2, '0')}-${ultimoDia}`;
  return { inicio, fin };
}

export function exportarReportePDF(
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
  const resumenComisionistas = agruparPorComisionista(items, comisionistas, tarifasEspecificas);

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
  const resumenComisionistas = agruparPorComisionista(items, comisionistas, tarifasEspecificas);
  const wsComisionistas = XLSX.utils.aoa_to_sheet([
    ['Reporte de Comisiones - Resumen por Comisionista'],
    ['Comisionista', 'Tarifas', 'Órdenes', 'Total Orden', 'Comisión'],
    ...resumenComisionistas.map(c => [c.nombre, c.tarifas, c.ordenes, c.totalOrden, c.totalComision]),
  ]);
  wsComisionistas['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsComisionistas, 'Por Comisionista');

  XLSX.writeFile(wb, `${titulo.replace(/\s+/g, '_')}.xlsx`);
}
