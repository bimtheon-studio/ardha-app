// Outils de test du front : l'application sur une route donnée, et une fausse API.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';

import { Routes_ } from '@/App';

type Reponse = { statut: number; corps?: unknown };
type Gestionnaire = (corps: unknown) => Reponse;

/** Fausse API : une réponse par « MÉTHODE chemin », et la liste des appels reçus. */
export function fausseApi(routes: Record<string, Reponse | Gestionnaire>) {
  const appels: { cle: string; corps: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (chemin: string, init: RequestInit = {}) => {
      const cle = `${init.method ?? 'GET'} ${chemin}`;
      const corps = init.body ? JSON.parse(String(init.body)) : undefined;
      appels.push({ cle, corps });
      const r = routes[cle];
      if (!r) throw new TypeError(`fetch non prévu : ${cle}`);
      const { statut, corps: sortie } = typeof r === 'function' ? r(corps) : r;
      return new Response(statut === 204 ? null : JSON.stringify(sortie ?? {}), {
        status: statut,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return appels;
}

export function afficher(url: string | { pathname: string; state?: unknown }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes_ />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const alice = { id: '01900000-0000-7000-8000-000000000001', email: 'alice@exemple.fr', nom: 'Alice Martin', role: 'utilisateur' };
export const sansSession = { statut: 401, corps: { message: 'Vous devez vous connecter.' } };
