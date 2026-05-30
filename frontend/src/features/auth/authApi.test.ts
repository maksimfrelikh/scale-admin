import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

vi.stubEnv('VITE_API_BASE_URL', 'http://localhost');

const { backendApi } = await import('../../shared/api/backendApi');
const { authApi } = await import('./authApi');

type FetchMock = ReturnType<typeof vi.fn>;

function makeStore() {
  return configureStore({
    reducer: { [backendApi.reducerPath]: backendApi.reducer },
    middleware: (getDefault) => getDefault().concat(backendApi.middleware),
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('login mutation — Session invalidation (BUG-LOGIN-ERR)', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('does NOT refetch Session on failed login (so LoginScreen stays mounted to render the error)', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse(401, { user: null })));
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse(401, {
      message: 'Неверный email или пароль',
      error: 'Unauthorized',
      statusCode: 401,
    })));

    const store = makeStore();

    await store.dispatch(authApi.endpoints.getSession.initiate()).unwrap().catch(() => null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstInput = fetchMock.mock.calls[0][0];
    const firstUrl = typeof firstInput === 'string' ? firstInput : (firstInput as Request).url;
    expect(firstUrl).toMatch(/\/auth\/session$/);

    const loginResult = await store.dispatch(authApi.endpoints.login.initiate({
      email: 'admin@example.com',
      password: 'wrong',
      csrfToken: 'csrf',
      csrfHeaderName: 'x-csrf-token',
    }));
    expect('error' in loginResult).toBe(true);
    const error = (loginResult as { error?: { status?: number; message?: string } }).error;
    expect(error?.status).toBe(401);
    expect(error?.message).toBe('Неверный email или пароль');

    await new Promise((resolve) => setTimeout(resolve, 10));

    const urlOf = (input: unknown) => typeof input === 'string' ? input : (input as Request).url;
    const sessionFetches = fetchMock.mock.calls.filter(([input]) => urlOf(input).includes('/auth/session'));
    expect(sessionFetches).toHaveLength(1);
  });

  it('DOES refetch Session on successful login (so the new session propagates)', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse(401, { user: null })));
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse(200, {
      user: { id: 'u1', email: 'admin@example.com', fullName: 'Admin', role: 'admin', status: 'active' },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })));
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse(200, {
      session: { id: 's1', createdAt: '2026-05-30T00:00:00.000Z', lastUsedAt: '2026-05-30T00:00:00.000Z', expiresAt: '2026-05-30T01:00:00.000Z' },
      user: { id: 'u1', email: 'admin@example.com', fullName: 'Admin', role: 'admin', status: 'active' },
    })));

    const store = makeStore();

    await store.dispatch(authApi.endpoints.getSession.initiate()).unwrap().catch(() => null);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const loginResult = await store.dispatch(authApi.endpoints.login.initiate({
      email: 'admin@example.com',
      password: 'correct',
      csrfToken: 'csrf',
      csrfHeaderName: 'x-csrf-token',
    }));
    expect('data' in loginResult).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const urlOf = (input: unknown) => typeof input === 'string' ? input : (input as Request).url;
    const sessionFetches = fetchMock.mock.calls.filter(([input]) => urlOf(input).includes('/auth/session'));
    expect(sessionFetches.length).toBeGreaterThanOrEqual(2);
  });
});
