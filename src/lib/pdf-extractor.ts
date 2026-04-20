import { OrdenItem } from '@/types';
import { generarId } from '@/lib/id';

interface PdfTextItem {
  text: string;
  x: number;
  y: number;
}

interface ParsedRow {
  y: number;
  cells: PdfTextItem[];
}

/**
 * Extract order items from a purchase order PDF.
 * Designed for the specific PDF format: "ORDEN DE COMPRA" from Industrial Pesquera Santa Priscila
 */
export async function extractOrdenFromPDF(file: File): Promise<{
  fecha: string;
  numeroOrden: string;
  proveedor: string;
  semana: string;
  items: OrdenItem[];
}> {
  // Dynamic import to avoid SSR issues with pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  // Configure worker via CDN to avoid bundling issues
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const pdf = await pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true, useWorkerFetch: true }).promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();

  const items: PdfTextItem[] = (textContent.items as any[])
    .filter((item: any) => item.str?.trim())
    .map((item: any) => ({
      text: item.str.trim(),
      x: Math.round(item.transform[4]),
      y: Math.round(item.transform[5]),
    }));

  // Group by rows (Y tolerance of 4 units)
  const rows: ParsedRow[] = [];
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  let currentRow: PdfTextItem[] = [];
  let currentY: number | null = null;

  for (const item of items) {
    if (currentY === null || Math.abs(item.y - currentY) <= 4) {
      currentRow.push(item);
      currentY = item.y;
    } else {
      rows.push({ y: currentY, cells: currentRow.sort((a, b) => a.x - b.x) });
      currentRow = [item];
      currentY = item.y;
    }
  }
  if (currentRow.length) {
    rows.push({ y: currentY!, cells: currentRow.sort((a, b) => a.x - b.x) });
  }

  // --- Extract header info ---
  let fecha = '';
  let numeroOrden = '';
  let proveedor = '';
  let semana = '';

  for (const row of rows) {
    const line = row.cells.map(c => c.text).join(' ');
    if (!fecha && /\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/.test(line)) {
      const match = line.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
      if (match) {
        const meses: Record<string, string> = {
          enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
          julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
        };
        fecha = `${match[3]}-${meses[match[2].toLowerCase()] || '01'}-${match[1].padStart(2, '0')}`;
      }
    }
    if (line.includes('ORDEN DE COMPRA No.')) {
      const match = line.match(/ORDEN DE COMPRA No\.\s+(\d+)/);
      if (match) numeroOrden = match[1];
    }
    if (line.includes('PROVEEDOR :')) {
      const match = line.match(/PROVEEDOR :\s+(.+?)(?:\s+CREDITO|$)/);
      if (match) proveedor = match[1].trim();
    }
    if (line.includes('SEMANA :')) {
      const match = line.match(/SEMANA :\s+(\d+)/);
      if (match) semana = match[1];
    }
  }

  if (!fecha) {
    const dateMatch = file.name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
    if (dateMatch) fecha = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    else fecha = new Date().toISOString().slice(0, 10);
  }

  // --- Extract table items ---
  // Table is roughly between Y=693 (header) and Y=530 (subtotal)
  const tableRows = rows.filter(r => r.y < 690 && r.y > 530);

  const fincas: { y: number; nombre: string }[] = [];
  const rawItems: {
    y: number;
    codigo: string;
    semana: string;
    producto: string;
    cantidad: number;
    descripcion: string;
    precioUnitario: number;
    total: number;
  }[] = [];

  for (const row of tableRows) {
    const cells = row.cells;

    // Detect item row by presence of quantity, price, total in expected X ranges
    const cantidadCell = cells.find(c => c.x >= 270 && c.x <= 300 && /^[\d,]+\.\d+$/.test(c.text.replace(/,/g, '')));
    const precioCell = cells.find(c => c.x >= 365 && c.x <= 395 && /^[\d,]+\.\d+$/.test(c.text.replace(/,/g, '')));
    const totalCell = cells.find(c => c.x >= 485 && c.x <= 510 && /^[\d,]+\.\d+$/.test(c.text.replace(/,/g, '')));

    const isItemRow = cantidadCell && precioCell && totalCell;

    if (isItemRow) {
      const productCells = cells.filter(c => c.x >= 110 && c.x < 270);
      const producto = productCells.map(c => c.text).join(' ').trim();

      const descCells = cells.filter(c => c.x >= 300 && c.x < 365);
      const descripcion = descCells.map(c => c.text).join(' ').trim();

      const codigoCell = cells.find(c => c.x >= 70 && c.x <= 100 && /^\d+$/.test(c.text));

      rawItems.push({
        y: row.y,
        codigo: codigoCell?.text || '',
        semana: semana,
        producto: producto || descripcion,
        cantidad: parseFloat(cantidadCell.text.replace(/,/g, '')),
        descripcion: descripcion || producto,
        precioUnitario: parseFloat(precioCell.text.replace(/,/g, '')),
        total: parseFloat(totalCell.text.replace(/,/g, '')),
      });
    } else {
      // Detect finca row
      const onlyCell = cells.length === 1 && cells[0].x >= 70 && cells[0].x <= 100;
      const firstCell = cells[0];
      const looksLikeFinca = onlyCell || (
        cells.length <= 2 &&
        firstCell.x >= 70 && firstCell.x <= 100 &&
        !/^\d+$/.test(firstCell.text) &&
        !firstCell.text.includes(',')
      );

      if (looksLikeFinca) {
        const nombre = cells.map(c => c.text).join(' ').trim();
        if (
          nombre &&
          nombre.length > 1 &&
          !nombre.includes('PEDIDO') &&
          !nombre.includes('DESCRIPCION') &&
          !nombre.includes('CANTIDAD') &&
          !nombre.includes('MEDIDA') &&
          !nombre.includes('PREC') &&
          !nombre.includes('DESC') &&
          !nombre.includes('TOTAL') &&
          !/^\d+(\.\d+)?$/.test(nombre)
        ) {
          fincas.push({ y: row.y, nombre });
        }
      }
    }
  }

  // Assign fincas to items
  // Strategy: prefer finca ABOVE the item (visually in the PDF, finca text appears above the data row)
  // If no finca above, look below within a small threshold
  const ordenItems: OrdenItem[] = rawItems.map(item => {
    let finca = '-';

    // 1. Find closest finca ABOVE (f.y > item.y means finca is higher on the page)
    let nearestAbove: typeof fincas[0] | null = null;
    let minDiff = Infinity;
    for (const f of fincas) {
      const diff = f.y - item.y; // positive means finca is above
      if (diff > 0 && diff < minDiff && diff <= 16) {
        minDiff = diff;
        nearestAbove = f;
      }
    }
    if (nearestAbove) {
      finca = nearestAbove.nombre;
    } else {
      // 2. Fallback: nearest finca BELOW (within smaller threshold)
      let nearestBelow: typeof fincas[0] | null = null;
      let minDiffBelow = Infinity;
      for (const f of fincas) {
        const diff = item.y - f.y; // positive means finca is below
        if (diff > 0 && diff < minDiffBelow && diff <= 14) {
          minDiffBelow = diff;
          nearestBelow = f;
        }
      }
      if (nearestBelow) finca = nearestBelow.nombre;
    }

    return {
      id: generarId(),
      fecha,
      numeroOrden: numeroOrden || `OC-${fecha}`,
      finca,
      producto: item.producto,
      cantidad: item.cantidad,
      unidad: inferUnidad(item.descripcion),
      precioUnitario: item.precioUnitario,
      total: item.total,
      comisionistaId: null,
    };
  });

  return {
    fecha,
    numeroOrden: numeroOrden || `OC-${fecha}`,
    proveedor: proveedor || '',
    semana,
    items: ordenItems,
  };
}

function inferUnidad(descripcion: string): string {
  const lower = descripcion.toLowerCase();
  if (lower.includes('kg')) return 'kg';
  if (lower.includes('litros') || lower.includes('lts')) return 'litros';
  if (lower.includes('galon') || lower.includes('galón')) return 'galones';
  if (lower.includes('caneca')) return 'canecas';
  if (lower.includes('saco')) return 'sacos';
  if (lower.includes('tacho')) return 'tachos';
  if (lower.includes('caja')) return 'cajas';
  if (lower.includes('unidad')) return 'unidades';
  return 'unidades';
}
