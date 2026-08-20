/// <reference types="vite/client" />

export interface ApiUser {
  id: string;
  email: string;
  email_verified?: boolean;
}

export interface ApiProfile {
  id: string;
  full_name: string;
  created_at: string;
}

export interface ApiSession {
  expires_at?: string | null;
}

export interface AuthResponse {
  user?: ApiUser | null;
  profile?: ApiProfile | null;
  session?: ApiSession | null;
  requires_email_verification?: boolean;
  verification_token?: string;
  data?: {
    user?: ApiUser | null;
    profile?: ApiProfile | null;
    session?: ApiSession | null;
  };
}

export interface LeaderboardEntry {
  score: number;
  quality_category: string;
  played_at: string;
  full_name: string;
}

export interface MatchCommand {
  command_id: string;
  expected_version: number;
  type: string;
  payload?: Record<string, unknown>;
}

export interface MatchCommandResult {
  version?: number;
  state?: unknown;
  event?: unknown;
  duplicate?: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
export const isApiConfigured = Boolean(configuredBaseUrl);
export const API_BASE_URL = (configuredBaseUrl || '/api/v1').replace(/\/+$/, '');

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  timeoutMs?: number;
};

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && typeof payload === 'object') {
    const value = payload as Record<string, unknown>;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.error === 'string') return value.error;
    if (value.error && typeof value.error === 'object' && typeof (value.error as Record<string, unknown>).message === 'string') {
      return (value.error as Record<string, unknown>).message as string;
    }
  }
  return fallback;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
  return response.text();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isApiConfigured) {
    throw new ApiError('A API da partida ainda não foi configurada.', 0, 'API_NOT_CONFIGURED');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      headers,
      signal: options.signal || controller.signal,
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      const fallback = response.status === 401
        ? 'Sua sessão expirou. Entre novamente.'
        : response.status === 429
          ? 'Muitas tentativas. Aguarde um momento.'
          : 'Não foi possível concluir a solicitação.';
      const errorPayload = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
      const nestedError = errorPayload?.error && typeof errorPayload.error === 'object'
        ? errorPayload.error as Record<string, unknown>
        : undefined;
      throw new ApiError(
        getErrorMessage(payload, fallback),
        response.status,
        typeof errorPayload?.code === 'string'
          ? errorPayload.code
          : typeof nestedError?.code === 'string' ? nestedError.code : undefined,
        errorPayload?.details ?? nestedError?.details,
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('A solicitação demorou demais. Tente novamente.', 408, 'TIMEOUT');
    }
    throw new ApiError('Não foi possível conectar à API. Verifique sua conexão.', 0, 'NETWORK_ERROR', error);
  } finally {
    window.clearTimeout(timeout);
  }
}

export const apiClient = {
  getMe: () => request<AuthResponse>('/me'),
  register: (payload: { email: string; password: string; fullName: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: payload }),
  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: payload }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  requestPasswordReset: (email: string) =>
    request<void>('/auth/password-reset', { method: 'POST', body: { email } }),
  resendEmailVerification: (email: string) =>
    request<void>('/auth/email-verification/resend', { method: 'POST', body: { email } }),
  confirmEmail: (token: string) =>
    request<AuthResponse>('/auth/email-verification/confirm', { method: 'POST', body: { token } }),
  confirmPasswordReset: (token: string, newPassword: string) =>
    request<void>('/auth/password-reset/confirm', { method: 'POST', body: { token, newPassword } }),
  getLeaderboard: (limit = 50, offset = 0) =>
    request<LeaderboardEntry[] | { data?: LeaderboardEntry[]; entries?: LeaderboardEntry[] }>(`/leaderboard?limit=${limit}&offset=${offset}`),
  createMatch: (payload: { mode: 'online' | 'local'; playerCount: number; playerNames?: string[] }) =>
    request<{ id: string; version: number }>('/matches', { method: 'POST', body: payload }),
  joinMatch: (matchId: string, displayName?: string) =>
    request<unknown>(`/matches/${encodeURIComponent(matchId)}/join`, { method: 'POST', body: { displayName } }),
  getMatch: (matchId: string) => request<unknown>(`/matches/${encodeURIComponent(matchId)}`),
  sendMatchCommand: (matchId: string, command: MatchCommand) =>
    request<MatchCommandResult>(`/matches/${encodeURIComponent(matchId)}/commands`, { method: 'POST', body: command }),
  getMatchEvents: (matchId: string, afterVersion: number) =>
    request<unknown>(`/matches/${encodeURIComponent(matchId)}/events?afterVersion=${afterVersion}`),
};

export function unwrapApiData<T>(response: T | { data?: T }): T {
  if (response && typeof response === 'object' && 'data' in response && (response as { data?: T }).data !== undefined) {
    return (response as { data: T }).data;
  }
  return response as T;
}
