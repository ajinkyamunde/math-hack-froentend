import axios, { AxiosError } from 'axios';

/**
 * The API is always called on the page's own origin: Vite proxies /api in development, and Vercel's
 * /api rewrite (vercel.json) forwards it to the Cloudflare Worker in production. Same-origin requests keep the
 * session cookie first-party, so iOS Safari's tracking prevention never blocks it.
 * VITE_API_URL is only honoured for local development against a remote API.
 */
export const API_BASE_URL = (() => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return '';
  }
  return (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
})();

let csrfToken: string | null = null;

/** The CSRF token lives only in memory; the session itself is an HTTP-only cookie the page cannot read. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toUpperCase();
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) config.headers.set('X-CSRF-Token', csrfToken);
  return config;
});

// Automatic retry with exponential backoff for idempotent requests during Render cold starts / blips
const MAX_IDEMPOTENT_RETRIES = 3;
apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (error instanceof AxiosError) {
      const config = error.config as (typeof error.config & { _retryCount?: number });
      if (config) {
        const method = (config.method ?? 'get').toUpperCase();
        const isIdempotent = ['GET', 'HEAD', 'OPTIONS'].includes(method);
        const status = error.response?.status;
        const isTransient = !error.response || [502, 503, 504].includes(status ?? 0) || error.code === 'ECONNABORTED';

        if (isIdempotent && isTransient && (config._retryCount ?? 0) < MAX_IDEMPOTENT_RETRIES) {
          config._retryCount = (config._retryCount ?? 0) + 1;
          const delay = Math.min(1000 * Math.pow(2, config._retryCount - 1), 5000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return apiClient(config);
        }
      }
    }
    return Promise.reject(error);
  },
);

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** Field-level validation messages keyed by field path. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries((this.details as FieldIssue[]).filter((d) => d?.field).map((d) => [d.field, d.message]));
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AxiosError) {
    const body = error.response?.data as { error?: { message?: string; code?: string; details?: unknown } } | undefined;
    if (body?.error) return new ApiError(body.error.message ?? 'Request failed.', error.response!.status, body.error.code ?? 'ERROR', body.error.details);
    if (!error.response) return new ApiError('Cannot reach the MathHack server. Check your connection and try again.', 0, 'NETWORK_ERROR');
    return new ApiError(`Request failed (${error.response.status}).`, error.response.status, 'ERROR');
  }
  return new ApiError('Something went wrong.', 0, 'UNKNOWN');
}

/** Downloads a protected file through the authenticated client and saves it with the server's filename. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  try {
    const response = await apiClient.get<Blob>(path, { responseType: 'blob' });
    const disposition = String(response.headers['content-disposition'] ?? '');
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] ?? fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    // Blob error bodies need decoding to show the server's message.
    if (error instanceof AxiosError && error.response?.data instanceof Blob) {
      try {
        const parsed = JSON.parse(await error.response.data.text()) as { error?: { message?: string; code?: string } };
        throw new ApiError(parsed.error?.message ?? 'Download failed.', error.response.status, parsed.error?.code ?? 'ERROR');
      } catch (inner) {
        if (inner instanceof ApiError) throw inner;
      }
    }
    throw toApiError(error);
  }
}
