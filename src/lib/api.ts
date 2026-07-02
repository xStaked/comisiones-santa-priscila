import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { toCamelCase, toSnakeCase } from './transform';
import type { EstadoOrden, Liquidacion, OrdenItem } from '@/types';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

function setAccessToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', token);
  }
}

function clearAccessToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber((token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {}, { withCredentials: true });
        const newAccessToken = res.data.access_token as string;
        setAccessToken(newAccessToken);
        onRefreshed(newAccessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        clearAccessToken();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Auth
export async function login(username: string, password: string) {
  const res = await api.post('/api/v1/auth/login', { username, password });
  setAccessToken(res.data.access_token);
  return toCamelCase(res.data);
}

export async function logout() {
  try {
    await api.post('/api/v1/auth/logout');
  } finally {
    clearAccessToken();
  }
}

export async function fetchMe() {
  const res = await api.get('/api/v1/auth/me');
  return toCamelCase(res.data);
}

// Comisionistas
export async function fetchComisionistas() {
  const res = await api.get('/api/v1/comisionistas/');
  return toCamelCase(res.data);
}

export async function createComisionista(data: any) {
  const res = await api.post('/api/v1/comisionistas/', toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function updateComisionista(id: string, data: any) {
  const res = await api.put(`/api/v1/comisionistas/${id}`, toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function deleteComisionista(id: string) {
  await api.delete(`/api/v1/comisionistas/${id}`);
}

// Ordenes
export async function fetchOrdenes(params?: { finca?: string; producto?: string; fechaDesde?: string; fechaHasta?: string; clienteId?: string }) {
  const res = await api.get('/api/v1/ordenes/', { params: toSnakeCase(params) });
  return toCamelCase(res.data);
}

export async function createOrdenes(items: any[]) {
  const res = await api.post('/api/v1/ordenes/', toSnakeCase(items));
  return toCamelCase(res.data);
}

export async function updateOrden(id: string, data: any) {
  const allowed = ['fecha', 'numeroOrden', 'finca', 'producto', 'cantidad', 'unidad', 'precioUnitario', 'total', 'sector', 'estado', 'clienteId', 'productoId', 'fincaId', 'comisionistaIds'];
  const payload: any = {};
  for (const key of allowed) {
    if (key in data) payload[key] = data[key];
  }
  const res = await api.put(`/api/v1/ordenes/${id}`, toSnakeCase(payload));
  return toCamelCase(res.data);
}

export async function updateEstadoOrdenGrupo(id: string, estado: EstadoOrden) {
  const res = await api.put(`/api/v1/ordenes/grupos/${id}/estado`, toSnakeCase({ estado }));
  return toCamelCase(res.data);
}

export async function updateEstadoOrdenesMasivo(ordenIds: string[], estado: EstadoOrden) {
  const res = await api.put('/api/v1/ordenes/grupos/estado-masivo', toSnakeCase({ ordenIds, estado }));
  return toCamelCase<{ actualizadas: number; omitidas: string[] }>(res.data);
}

export async function deleteOrden(id: string) {
  await api.delete(`/api/v1/ordenes/${id}`);
}

export async function asignarComisionista(ordenId: string, comisionistaId: string) {
  await api.post(`/api/v1/ordenes/${ordenId}/comisionistas`, toSnakeCase({ comisionistaId }));
}

export async function desasignarComisionista(ordenId: string, comisionistaId: string) {
  await api.delete(`/api/v1/ordenes/${ordenId}/comisionistas/${comisionistaId}`);
}

export async function asignarGlobal(ordenIds: string[], comisionistaIds: string[]) {
  await api.post('/api/v1/ordenes/asignar-global', toSnakeCase({ ordenIds, comisionistaIds }));
}

export async function limpiarOrdenes() {
  await api.post('/api/v1/ordenes/limpiar');
}

function snapshotItemToOrdenItem(item: any): OrdenItem {
  return {
    id: item.id,
    ordenId: item.ordenId,
    fecha: item.fechaSnapshot,
    numeroOrden: item.numeroOrdenSnapshot,
    finca: item.fincaSnapshot,
    producto: item.productoSnapshot,
    cantidad: item.cantidadSnapshot,
    unidad: item.unidadSnapshot,
    precioUnitario: item.precioUnitarioSnapshot,
    total: item.totalSnapshot,
    sector: item.sectorSnapshot,
    estado: item.estadoSnapshot,
    comisionistas: (item.tarifas || []).map((t: any) => ({ comisionistaId: t.comisionistaId })),
  };
}

function normalizarLiquidacionConItems(data: any): Liquidacion {
  return {
    id: data.id,
    nombre: data.nombre,
    mes: data.mes,
    fechaCreacion: data.fechaCreacion,
    items: (data.items || []).map(snapshotItemToOrdenItem),
  };
}

// Liquidaciones
export async function fetchLiquidaciones() {
  const res = await api.get('/api/v1/liquidaciones/');
  const liquidaciones = toCamelCase<any[]>(res.data);
  return liquidaciones.map(normalizarLiquidacionConItems);
}

export async function fetchLiquidacion(id: string) {
  const res = await api.get(`/api/v1/liquidaciones/${id}`);
  return toCamelCase(res.data);
}

export async function createLiquidacion(data: any) {
  const res = await api.post('/api/v1/liquidaciones/', toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function deleteLiquidacion(id: string) {
  await api.delete(`/api/v1/liquidaciones/${id}`);
}

export async function restaurarLiquidacion(id: string) {
  const res = await api.post(`/api/v1/liquidaciones/${id}/restaurar`);
  return toCamelCase(res.data);
}

// Reportes
export async function fetchResumen() {
  const res = await api.get('/api/v1/reportes/resumen');
  return toCamelCase(res.data);
}

export async function fetchPorFinca() {
  const res = await api.get('/api/v1/reportes/por-finca');
  return toCamelCase(res.data);
}

export async function fetchPorProducto() {
  const res = await api.get('/api/v1/reportes/por-producto');
  return toCamelCase(res.data);
}

export async function fetchPorComisionista() {
  const res = await api.get('/api/v1/reportes/por-comisionista');
  return toCamelCase(res.data);
}

export async function fetchGlobalStats() {
  const res = await api.get('/api/v1/reportes/global');
  return toCamelCase(res.data);
}

export async function fetchTendencias() {
  const res = await api.get('/api/v1/reportes/tendencias');
  return toCamelCase(res.data);
}

// Upload
export async function uploadPDF(file: File, clienteId?: string) {
  const formData = new FormData();
  formData.append('file', file);
  const url = clienteId ? `/api/v1/upload/pdf?cliente_id=${clienteId}` : '/api/v1/upload/pdf';
  const res = await api.post(url, formData, {
    headers: { 'Content-Type': undefined },
  });
  return toCamelCase(res.data);
}

export async function uploadImage(file: File, clienteId?: string) {
  const formData = new FormData();
  formData.append('file', file);
  const url = clienteId ? `/api/v1/upload/imagen?cliente_id=${clienteId}` : '/api/v1/upload/imagen';
  const res = await api.post(url, formData, {
    headers: { 'Content-Type': undefined },
  });
  return toCamelCase(res.data);
}

// Clientes
export async function fetchClientes() {
  const res = await api.get('/api/v1/clientes/');
  return toCamelCase(res.data);
}

export async function createCliente(data: any) {
  const res = await api.post('/api/v1/clientes/', toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function updateCliente(id: string, data: any) {
  const res = await api.put(`/api/v1/clientes/${id}`, toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function deleteCliente(id: string) {
  await api.delete(`/api/v1/clientes/${id}`);
}

// Fincas
export async function fetchFincas(clienteId: string) {
  const res = await api.get(`/api/v1/clientes/${clienteId}/fincas/`);
  return toCamelCase(res.data);
}

export async function createFinca(clienteId: string, data: any) {
  const res = await api.post(`/api/v1/clientes/${clienteId}/fincas/`, toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function updateFinca(clienteId: string, id: string, data: any) {
  const res = await api.put(`/api/v1/clientes/${clienteId}/fincas/${id}`, toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function deleteFinca(clienteId: string, id: string) {
  await api.delete(`/api/v1/clientes/${clienteId}/fincas/${id}`);
}

// Productos
export async function fetchProductos() {
  const res = await api.get('/api/v1/productos/');
  return toCamelCase(res.data);
}

export async function createProducto(data: any) {
  const res = await api.post('/api/v1/productos/', toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function updateProducto(id: string, data: any) {
  const res = await api.put(`/api/v1/productos/${id}`, toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function deleteProducto(id: string) {
  await api.delete(`/api/v1/productos/${id}`);
}

export async function createProductoAlias(productoId: string, alias: string) {
  const res = await api.post(`/api/v1/productos/${productoId}/alias`, toSnakeCase({ alias }));
  return toCamelCase(res.data);
}

export async function deleteProductoAlias(productoId: string, aliasId: string) {
  await api.delete(`/api/v1/productos/${productoId}/alias/${aliasId}`);
}

// Tarifas Cliente Producto
export async function fetchTarifasClienteProducto(params?: { comisionistaId?: string; clienteId?: string; productoId?: string }) {
  const res = await api.get('/api/v1/tarifas-cliente-producto/', { params: toSnakeCase(params) });
  return toCamelCase(res.data);
}

export async function createTarifaClienteProducto(data: any) {
  const res = await api.post('/api/v1/tarifas-cliente-producto/', toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function updateTarifaClienteProducto(id: string, data: any) {
  const res = await api.put(`/api/v1/tarifas-cliente-producto/${id}`, toSnakeCase(data));
  return toCamelCase(res.data);
}

export async function deleteTarifaClienteProducto(id: string) {
  await api.delete(`/api/v1/tarifas-cliente-producto/${id}`);
}

export async function updateTarifasClienteProductoMasivo(
  ids: string[],
  cambios: { tipo?: string; valor?: number; activo?: boolean }
) {
  const res = await api.put('/api/v1/tarifas-cliente-producto/masivo', toSnakeCase({ ids, cambios }));
  return toCamelCase<{ actualizadas: number }>(res.data);
}

// Proveedores
export async function fetchProveedores() {
  const res = await api.get('/api/v1/proveedores/');
  return toCamelCase(res.data);
}

// Admin
export async function seedDemo() {
  await api.post('/api/v1/admin/seed-real');
}
