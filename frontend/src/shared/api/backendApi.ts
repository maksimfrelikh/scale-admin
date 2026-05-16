import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { Dispatch } from '@reduxjs/toolkit';

type BackendErrorData = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  code?: string;
  moveRequired?: boolean;
  existingPlacement?: unknown;
};

export type ApiError = {
  status: number | 'FETCH_ERROR' | 'PARSING_ERROR' | 'TIMEOUT_ERROR' | 'CUSTOM_ERROR';
  message: string;
  data?: BackendErrorData;
};

const backendBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const authSessionEventName = 'scale-admin:auth-session-event';

type AuthSessionEvent = {
  id: string;
  type: 'session-cleared' | 'session-changed';
  at: number;
};

let authSessionBroadcastChannel: BroadcastChannel | null = null;

function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getAuthSessionBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  authSessionBroadcastChannel ??= new BroadcastChannel(authSessionEventName);
  return authSessionBroadcastChannel;
}

function createAuthSessionEvent(type: AuthSessionEvent['type']): AuthSessionEvent {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  return { id: randomId, type, at: Date.now() };
}

function readAuthSessionEvent(rawValue: string | null): AuthSessionEvent | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AuthSessionEvent>;
    if (
      typeof parsed.id === 'string'
      && typeof parsed.at === 'number'
      && (parsed.type === 'session-cleared' || parsed.type === 'session-changed')
    ) {
      return parsed as AuthSessionEvent;
    }
  } catch {
    // Ignore malformed cross-tab events from stale browser state.
  }

  return null;
}

export function clearProtectedNavigation() {
  if (typeof window !== 'undefined' && window.location.hash) {
    window.location.hash = '';
  }
}

export function publishAuthSessionEvent(type: AuthSessionEvent['type']) {
  const event = createAuthSessionEvent(type);

  getAuthSessionBroadcastChannel()?.postMessage(event);

  if (!canUseBrowserStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(authSessionEventName, JSON.stringify(event));
    window.localStorage.removeItem(authSessionEventName);
  } catch {
    // Storage can be unavailable in private browsing; BroadcastChannel already covered modern browsers.
  }
}

export function subscribeAuthSessionEvents(listener: (event: AuthSessionEvent) => void) {
  const seenEventIds = new Set<string>();

  function handleEvent(event: AuthSessionEvent | null) {
    if (!event || seenEventIds.has(event.id)) {
      return;
    }

    seenEventIds.add(event.id);
    listener(event);
  }

  const channel = getAuthSessionBroadcastChannel();
  const handleChannelMessage = (event: MessageEvent<AuthSessionEvent>) => handleEvent(event.data);
  channel?.addEventListener('message', handleChannelMessage);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === authSessionEventName) {
      handleEvent(readAuthSessionEvent(event.newValue));
    }
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    channel?.removeEventListener('message', handleChannelMessage);
    window.removeEventListener('storage', handleStorage);
  };
}

export function clearProtectedClientState(dispatch: Dispatch, shouldBroadcast = true) {
  clearProtectedNavigation();
  dispatch(backendApi.util.resetApiState());

  if (shouldBroadcast) {
    publishAuthSessionEvent('session-cleared');
  }
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${backendBaseUrl}/api`,
  credentials: 'include',
});

function messageFromData(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const errorData = data as BackendErrorData;
  const message = Array.isArray(errorData.message)
    ? errorData.message.join(', ')
    : errorData.message;

  return message ?? errorData.error;
}

function normalizeError(error: FetchBaseQueryError): ApiError {
  const backendMessage = messageFromData(error.data);
  const backendData = error.data && typeof error.data === 'object' ? (error.data as BackendErrorData) : undefined;

  if (error.status === 401) {
    return {
      status: 401,
      message:
        backendMessage === 'Invalid email or password'
          ? 'Неверный email или пароль.'
          : 'Требуется авторизация. Войдите в систему и повторите запрос.',
    };
  }

  if (error.status === 403) {
    return {
      status: 403,
      message:
        backendMessage === 'CSRF token required or invalid'
          ? 'Сессия формы истекла. Обновите страницу и повторите действие.'
          : 'Недостаточно прав для выполнения запроса.',
    };
  }

  if (error.status === 429) {
    return {
      status: 429,
      message: 'Слишком много попыток. Подождите немного и повторите действие.',
    };
  }

  if (error.status === 'FETCH_ERROR') {
    return {
      status: 'FETCH_ERROR',
      message: 'Backend недоступен. Проверьте, что сервер запущен, и повторите попытку.',
    };
  }

  if (error.status === 'PARSING_ERROR') {
    return {
      status: 'PARSING_ERROR',
      message: 'Backend вернул неожиданный формат ответа.',
    };
  }

  if (error.status === 'TIMEOUT_ERROR') {
    return {
      status: 'TIMEOUT_ERROR',
      message: 'Backend не ответил вовремя. Повторите попытку позже.',
    };
  }

  if (error.status === 'CUSTOM_ERROR') {
    return {
      status: 'CUSTOM_ERROR',
      message: error.error,
    };
  }

  return {
    status: error.status,
    message: backendMessage ?? `Backend returned HTTP ${error.status}`,
    data: backendData,
  };
}

function requestPath(args: string | FetchArgs): string {
  return typeof args === 'string' ? args : args.url;
}

function shouldClearProtectedState(args: string | FetchArgs, error: FetchBaseQueryError): boolean {
  if (error.status !== 401) {
    return false;
  }

  const path = requestPath(args);

  return !path.startsWith('/auth/csrf')
    && !path.startsWith('/auth/login')
    && !path.startsWith('/auth/logout');
}

const backendBaseQuery: BaseQueryFn<string | FetchArgs, unknown, ApiError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions);

  if (result.error) {
    if (shouldClearProtectedState(args, result.error)) {
      clearProtectedClientState(api.dispatch);
    }

    return { error: normalizeError(result.error) };
  }

  return { data: result.data };
};

export const backendApi = createApi({
  reducerPath: 'backendApi',
  baseQuery: backendBaseQuery,
  tagTypes: ['Session', 'Stores', 'Products', 'Prices', 'Publishing', 'Users', 'UserStoreAccess', 'ScaleDevices', 'CatalogCategories', 'CatalogPlacements', 'AdvertisingBanners', 'Logs'],
  endpoints: () => ({}),
});
