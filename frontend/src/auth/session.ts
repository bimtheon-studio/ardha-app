// Session courante côté front : « qui suis-je », connexion, inscription, déconnexion (TanStack Query).
import { type Connexion, type Inscription, routesAuth, type Utilisateur } from '@contrats';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { appeler, ErreurAppel } from '@/api/client';

export const CLE_MOI = ['auth', 'moi'] as const;

/** `null` : pas de session. Une autre erreur (serveur injoignable) remonte telle quelle : « illisible » n'est pas « déconnecté ». */
async function lireMoi(): Promise<Utilisateur | null> {
  try {
    return await appeler(routesAuth.moi);
  } catch (e) {
    if (e instanceof ErreurAppel && e.statut === 401) return null;
    throw e;
  }
}

export function useMoi() {
  return useQuery({ queryKey: CLE_MOI, queryFn: lireMoi, staleTime: 60_000, retry: 1 });
}

export function useConnexion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (corps: Connexion) => appeler(routesAuth.connexion, corps),
    onSuccess: (u) => client.setQueryData(CLE_MOI, u),
  });
}

export function useInscription() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (corps: Inscription) => appeler(routesAuth.inscription, corps),
    onSuccess: (u) => client.setQueryData(CLE_MOI, u),
  });
}

export function useDeconnexion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => appeler(routesAuth.deconnexion),
    onSettled: () => {
      client.clear();
      client.setQueryData(CLE_MOI, null);
    },
  });
}
