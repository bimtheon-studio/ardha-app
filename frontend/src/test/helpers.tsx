// Outils de test du front : l'application sur une route donnée, et une fausse API.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';

import { AppRoutes } from '@/App';

type TResponse = { status: number; body?: unknown };
type Handler = (body: unknown, url: URL) => TResponse;

/**
 * Fausse API : une réponse par « MÉTHODE chemin » (avec sa chaîne de requête, ou sans pour toutes),
 * et la liste des appels reçus.
 */
export function fakeApi(routes: Record<string, TResponse | Handler>) {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}) => {
      const key = `${init.method ?? 'GET'} ${path}`;
      const url = new URL(path, 'http://ardha.test');
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ key, body });
      const r = routes[key] ?? routes[`${init.method ?? 'GET'} ${url.pathname}`];
      if (!r) throw new TypeError(`fetch non prévu : ${key}`);
      const { status, body: output } = typeof r === 'function' ? r(body, url) : r;
      return new Response(status === 204 ? null : JSON.stringify(output ?? {}), {
        status: status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

export function renderAt(url: string | { pathname: string; state?: unknown }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const alice = { id: '01900000-0000-7000-8000-000000000001', email: 'alice@exemple.fr', name: 'Alice Martin', role: 'user' };
export const noSession = { status: 401, body: { message: 'Vous devez vous connecter.' } };
