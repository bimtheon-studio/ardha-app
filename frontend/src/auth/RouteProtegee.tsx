// Garde de route : attend que la session soit connue ; sans session, envoie vers la connexion en
// retenant la page demandée (F-00, Q6). « Pas encore connu » n'est jamais « refusé ».
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { Chargement } from '@/composants/Chargement';
import { ErreurChargement } from '@/composants/ErreurChargement';

import { useMoi } from './session';

export function RouteProtegee({ children }: { children: ReactNode }) {
  const moi = useMoi();
  const location = useLocation();
  if (moi.isPending) return <Chargement />;
  if (moi.isError) return <ErreurChargement onReessayer={() => void moi.refetch()} />;
  if (!moi.data) {
    const depuis = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/connexion" replace state={{ depuis }} />;
  }
  return <>{children}</>;
}

/** Page d'où l'on venait avant d'être envoyé vers la connexion ; l'accueil sinon. Jamais une URL externe. */
export function pageDeRetour(etat: unknown): string {
  const depuis = (etat as { depuis?: unknown } | null)?.depuis;
  return typeof depuis === 'string' && depuis.startsWith('/') && !depuis.startsWith('//') ? depuis : '/';
}
