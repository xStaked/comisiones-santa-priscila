import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { toCamelCase, toSnakeCase } from './transform';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
  const res = await api.get('/api/v1/comisionistas');
  return toCamelCase(res.data);
}

export async function createComisionista(data: any) {
  const res = await api.post('/api/v1/comisionistas', toSnakeCase(data));
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
export async function fetchOrdenes(params?: { finca?: string; producto?: string; fechaDesde?: string; fechaHasta?: string }) {
  const res = await api.get('/api/v1/ordenes', { params: toSnakeCase(params) });
  return toCamelCase(res.data);
}

export async function createOrdenes(items: any[]) {
  const res = await api.post('/api/v1/ordenes', toSnakeCase(items));
  return toCamelCase(res.data);
}

export async function updateOrden(id: string, data: any) {
  const allowed = ['fecha', 'numeroOrden', 'finca', 'producto', 'cantidad', 'unidad', 'precioUnitario', 'total', 'sector', 'estado'];
  const payload: any = {};
  for (const key of allowed) {
    if (key in data) payload[key] = data[key];
  }
  const res = await api.put(`/api/v1/ordenes/${id}`, toSnakeCase(payload));
  return toCamelCase(res.data);
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

// Liquidaciones
export async function fetchLiquidaciones() {
  const res = await api.get('/api/v1/liquidaciones');
  return toCamelCase(res.data);
}

export async function fetchLiquidacion(id: string) {
  const res = await api.get(`/api/v1/liquidaciones/${id}`);
  return toCamelCase(res.data);
}

export async function createLiquidacion(data: any) {
  const res = await api.post('/api/v1/liquidaciones', toSnakeCase(data));
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
export async function uploadPDF(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/api/v1/upload/pdf', formData, {
    headers: { 'Content-Type': undefined },
  });
  return toCamelCase(res.data);
}

export async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/api/v1/upload/imagen', formData, {
    headers: { 'Content-Type': undefined },
  });
  return toCamelCase(res.data);
}

// Admin
export async function seedDemo() {
  await api.post('/api/v1/admin/seed-demo');
}
