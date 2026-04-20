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
  const doc = new jsPDF({ orientation: 'landscape' });
  
  // Título
  doc.setFontSize(18);
  doc.text(titulo, 14, 20);
  
  if (nombreComisionista) {
    doc.setFontSize(12);
    doc.text(`Comisionista: ${nombreComisionista}`, 14, 28);
  }
  
  doc.setFontSize(10);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, 14, 36);

  const comisionistaMap = new Map(comisionistas.map(c => [c.id, c]));

  const body = items.map(item => {
    const com = comisionistaMap.get(item.comisionistaId || '');
    const comision = calcularComision(item, com);
    return [
      item.fecha,
      item.numeroOrden,
      item.finca,
      item.producto,
      `${item.cantidad.toLocaleString('es-ES')} ${item.unidad}`,
      `$${item.precioUnitario.toFixed(2)}`,
      `$${item.total.toFixed(2)}`,
      com ? `${com.nombre} (${com.tipo === 'porcentaje' ? com.valor + '%' : '$' + com.valor + '/kg'})` : '-',
      `$${comision.toFixed(2)}`,
    ];
  });

  const totalComision = items.reduce((sum, item) => {
    const com = comisionistaMap.get(item.comisionistaId || '');
    return sum + calcularComision(item, com);
  }, 0);

  autoTable(doc, {
    startY: nombreComisionista ? 42 : 34,
    head: [['Fecha', 'Factura/Orden', 'Finca', 'Producto', 'Cantidad', 'Precio Unit.', 'Total', 'Comisionista', 'Comisión']],
    body,
    theme: 'striped',
    headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
    foot: [['', '', '', '', '', '', '', 'TOTAL', `$${totalComision.toFixed(2)}`]],
    footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' },
  });

  doc.save(`${titulo.replace(/\s+/g, '_')}.pdf`);
}

export function exportarExcel(
  items: OrdenItem[],
  comisionistas: Comisionista[],
  titulo: string
) {
  const comisionistaMap = new Map(comisionistas.map(c => [c.id, c]));

  const data = items.map(item => {
    const com = comisionistaMap.get(item.comisionistaId || '');
    const comision = calcularComision(item, com);
    return {
      Fecha: item.fecha,
      'Factura/Orden': item.numeroOrden,
      Finca: item.finca,
      Producto: item.producto,
      Cantidad: item.cantidad,
      Unidad: item.unidad,
      'Precio Unitario': item.precioUnitario,
      Total: item.total,
      Comisionista: com?.nombre || '-',
      'Tipo Comisión': com ? (com.tipo === 'porcentaje' ? `${com.valor}%` : `$${com.valor}/kg`) : '-',
      Comisión: comision,
    };
  });

  const totalComision = items.reduce((sum, item) => {
    const com = comisionistaMap.get(item.comisionistaId || '');
    return sum + calcularComision(item, com);
  }, 0);

  data.push({
    Fecha: '',
    'Factura/Orden': '',
    Finca: '',
    Producto: '',
    Cantidad: '' as any,
    Unidad: '',
    'Precio Unitario': '' as any,
    Total: '' as any,
    Comisionista: '',
    'Tipo Comisión': 'TOTAL',
    Comisión: totalComision,
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Liquidación');
  XLSX.writeFile(wb, `${titulo.replace(/\s+/g, '_')}.xlsx`);
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
