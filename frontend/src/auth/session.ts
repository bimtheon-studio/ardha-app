// Session courante côté front : « qui suis-je », connexion, inscription, déconnexion (TanStack Query).
import { type Login, type Signup, authRoutes, type User } from '@contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { callApi, CallError } from '@/api/client';

export const ME_KEY = ['auth', 'moi'] as const;

/** `null` : pas de session. Une autre erreur (serveur injoignable) remonte telle quelle : « illisible » n'est pas « déconnecté ». */
async function fetchMe(): Promise<User | null> {
  try {
    return await callApi(authRoutes.me);
  } catch (e) {
    if (e instanceof CallError && e.status === 401) return null;
    throw e;
  }
}

export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, retry: 1 });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Login) => callApi(authRoutes.login, body),
    onSuccess: (u) => client.setQueryData(ME_KEY, u),
  });
}

export function useSignup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Signup) => callApi(authRoutes.signup, body),
    onSuccess: (u) => client.setQueryData(ME_KEY, u),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => callApi(authRoutes.logout),
    onSettled: () => {
      client.clear();
      client.setQueryData(ME_KEY, null);
    },
  });
}
