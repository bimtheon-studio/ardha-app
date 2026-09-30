// Garde de route : attend que la session soit connue ; sans session, envoie vers la connexion en
// retenant la page demandée (F-00, Q6). « Pas encore connu » n'est jamais « refusé ».
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { Loading } from '@/components/Loading';
import { LoadError } from '@/components/LoadError';

import { useMe } from './session';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Loading />;
  if (me.isError) return <LoadError onRetry={() => void me.refetch()} />;
  if (!me.data) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return <>{children}</>;
}

/** Page d'où l'on venait avant d'être envoyé vers la connexion ; l'accueil sinon. Jamais une URL externe. */
export function returnPath(status: unknown): string {
  const from = (status as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';
}
