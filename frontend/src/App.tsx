import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';

import { RouteProtegee } from '@/auth/RouteProtegee';
import { Chargement } from '@/composants/Chargement';
import { Coquille } from '@/composants/Coquille';
import { FrontiereErreur } from '@/composants/FrontiereErreur';
import { Connexion } from '@/pages/Connexion';
import { Inscription } from '@/pages/Inscription';

// Chargées à la demande : seules la connexion et l'inscription sont dans le paquet d'entrée (F-00, #24).
const Accueil = lazy(() => import('@/pages/Accueil').then((m) => ({ default: m.Accueil })));
const MotDePasseOublie = lazy(() => import('@/pages/MotDePasseOublie').then((m) => ({ default: m.MotDePasseOublie })));
const Reinitialiser = lazy(() => import('@/pages/Reinitialiser').then((m) => ({ default: m.Reinitialiser })));
const Introuvable = lazy(() => import('@/pages/Introuvable').then((m) => ({ default: m.Introuvable })));

export function Routes_() {
  return (
    <Suspense fallback={<Chargement />}>
      <Routes>
        <Route path="/login" element={<Connexion />} />
        <Route path="/signup" element={<Inscription />} />
        <Route path="/forgot-password" element={<MotDePasseOublie />} />
        <Route path="/reset-password" element={<Reinitialiser />} />
        {/* `/` mène à la connexion quand on n'a pas de session (F-00, Q8). */}
        <Route
          element={
            <RouteProtegee>
              <Coquille />
            </RouteProtegee>
          }
        >
          <Route index element={<Accueil />} />
        </Route>
        <Route path="*" element={<Introuvable />} />
      </Routes>
    </Suspense>
  );
}

export function App({ client = new QueryClient() }: { client?: QueryClient }) {
  return (
    <FrontiereErreur>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <Routes_ />
        </BrowserRouter>
      </QueryClientProvider>
    </FrontiereErreur>
  );
}
