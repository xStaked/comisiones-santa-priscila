import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { OrdenItem, Comisionista } from '@/types';

export function calcularComision(item: OrdenItem, comisionista: Comisionista | undefined): number {
  if (!comisionista) return 0;
  if (comisionista.tipo === 'porcentaje') {
    return item.total * (comisionista.valor / 100);
  }
  // fijo_kg: solo si la unidad es kg o libras (aproximamos libras a kg con factor 0.4536)
  let cantidadKg = item.cantidad;
  if (item.unidad === 'libras') {
    cantidadKg = item.cantidad * 0.453592;
  } else if (item.unidad !== 'kg') {
    // Para unidades no peso, usamos cantidad directa como fallback
    cantidadKg = item.cantidad;
  }
  return cantidadKg * comisionista.valor;
}

export function exportarPDF(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  titulo: string,
  nombreComisionista?: string
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
    const comId = item.comisionistaId || 'sin-asignar';
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
        const comision = calcularComision(item, com);
        return [
          item.fecha,
          item.numeroOrden,
          item.producto,
          `${item.cantidad.toLocaleString('es-ES')}`,
          `${com ? (com.tipo === 'porcentaje' ? com.valor + '%' : '$' + com.valor.toFixed(3)) : '-'}`,
          `$ ${comision.toFixed(2).replace('.', ',')}`,
          item.estado || 'Cobrado',
          item.sector || item.finca || '-',
        ];
      });

      const totalComisionGrupo = itemsDelGrupo.reduce((sum, item) => {
        return sum + calcularComision(item, com);
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

export function exportarExcel(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  titulo: string,
  nombreComisionista?: string
) {
  const comisionistaMap = new Map(comisionistas.map(c => [c.id, c]));
  const wb = XLSX.utils.book_new();

  const nombresMes = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Agrupar items por comisionista, luego por mes
  const itemsPorComisionista = new Map<string, Map<string, OrdenItem[]>>();
  items.forEach(item => {
    const comId = item.comisionistaId || 'sin-asignar';
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

  // Ordenar comisionistas y meses
  const comisionistaIds = Array.from(itemsPorComisionista.keys()).sort((a, b) => {
    const comA = comisionistaMap.get(a);
    const comB = comisionistaMap.get(b);
    return (comA?.nombre || '').localeCompare(comB?.nombre || '');
  });

  const data: any[] = [];
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

      // Encabezado para cada grupo
      data.push(['INDUSTRIAL ACUICOLA OCHOA & BARCIA DINACUAMAR CIA.LTDA.']);
      data.push(['Sistema de Liquidación de Comisiones']);
      data.push([`Comisionista: ${comNombre} del 1 al ${ultimoDia} de ${nombreMes} ${anio}`]);
      data.push([]);

      // Headers de tabla
      data.push(['Fecha', 'Factura', 'Nombre', 'Cantidad', 'Tipo Comisión', 'Valor de Comisión', 'Estado', 'Sector']);

      // Filas de datos
      let totalGrupo = 0;
      itemsDelGrupo.forEach(item => {
        const comision = calcularComision(item, com);
        totalGrupo += comision;
        data.push([
          item.fecha,
          item.numeroOrden,
          item.producto,
          item.cantidad,
          `${com ? (com.tipo === 'porcentaje' ? com.valor + '%' : '$' + com.valor.toFixed(3)) : '-'}`,
          `$ ${comision.toFixed(2).replace('.', ',')}`,
          item.estado || 'Cobrado',
          item.sector || item.finca || '-',
        ]);
      });

      // Total del grupo
      data.push(['', '', '', '', '', `$ ${totalGrupo.toFixed(2).replace('.', ',')}`, '', '']);
      data.push([]);

      totalGeneral += totalGrupo;
    });
  });

  // Total general
  data.push(['', '', '', '', '', '', '', '']);
  data.push(['', '', '', '', '', 'TOTAL', `$ ${totalGeneral.toFixed(2).replace('.', ',')}`, '']);

  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Ajustar anchos de columna
  ws['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 25 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Liquidación');
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
