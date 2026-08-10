import {
  BarChart3,
  Building2,
  FileText,
  History,
  LayoutDashboard,
  Package,
  Percent,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface ItemNav {
  href: string;
  label: string;
  icono: LucideIcon;
  /** Subtítulo por defecto de la cabecera; Header puede reemplazarlo con conteos en vivo. */
  subtitulo: string;
  /** Muestra el contador de registros sin liquidar. */
  contador?: boolean;
}

export const gruposNav: { titulo: string; items: ItemNav[] }[] = [
  {
    titulo: 'Operación',
    items: [
      { href: '/ordenes', label: 'Facturas', icono: FileText, subtitulo: 'Órdenes y facturas cargadas' },
      { href: '/liquidacion', label: 'Liquidación', icono: Wallet, contador: true, subtitulo: 'Solo facturas pagadas con asignaciones sin liquidar' },
      { href: '/historial', label: 'Historial', icono: History, subtitulo: 'Liquidaciones guardadas' },
    ],
  },
  {
    titulo: 'Catálogos',
    items: [
      { href: '/clientes', label: 'Clientes', icono: Building2, subtitulo: 'Clientes, fincas y retención vigente' },
      { href: '/productos', label: 'Productos', icono: Package, subtitulo: 'Productos y unidades de comisión' },
      { href: '/comisionistas', label: 'Comisionistas', icono: Users, subtitulo: 'Comisionistas y tarifa global' },
      { href: '/tarifas', label: 'Tarifas', icono: Percent, subtitulo: 'Tarifas específicas por comisionista, cliente y producto' },
      { href: '/proveedores', label: 'Proveedores', icono: Truck, subtitulo: 'Razones sociales que emiten las facturas' },
    ],
  },
  {
    titulo: 'Análisis',
    items: [
      { href: '/', label: 'Resumen', icono: LayoutDashboard, subtitulo: 'Datos en vivo' },
      { href: '/reportes', label: 'Reportes', icono: BarChart3, subtitulo: 'Análisis por periodo y dimensión' },
    ],
  },
];

const todos = gruposNav.flatMap((g) => g.items);

export function esActiva(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function itemActivo(pathname: string): ItemNav | undefined {
  // La ruta más específica gana: '/' solo coincide exacto.
  return todos.find((i) => esActiva(i.href, pathname));
}
