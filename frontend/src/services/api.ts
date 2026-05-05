import axios from 'axios';
import { logApiFailure } from '../utils/errorLogger';

const buildDefaultApiBaseUrl = (): string => {
  return '/api';
};

export const API_BASE_URL = import.meta.env.VITE_API_URL || buildDefaultApiBaseUrl();

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const failedUrl: string = error?.config?.url || '';
    if (!failedUrl.includes('/log-error')) {
      logApiFailure(error, {
        route: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
        method: error?.config?.method,
        url: failedUrl,
        status: error?.response?.status,
      });
    }

    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Emit a custom event when a plan limit is hit so any component can react
export function isLimitError(error: unknown): boolean {
  const detail = (error as any)?.response?.data?.detail;
  return (error as any)?.response?.status === 429 && detail?.code === 'LIMIT_REACHED';
}

export function getLimitErrorDetail(error: unknown): { feature: string; message: string } | null {
  if (!isLimitError(error)) return null;
  const detail = (error as any).response.data.detail;
  return { feature: detail.feature, message: detail.message };
}

export default apiClient;
