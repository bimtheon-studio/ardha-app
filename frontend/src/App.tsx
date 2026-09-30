import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';

import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { Loading } from '@/components/Loading';
import { Shell } from '@/components/Shell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Login } from '@/pages/Login';
import { Signup } from '@/pages/Signup';

// Chargées à la demande : seules la connexion et l'inscription sont dans le paquet d'entrée (F-00, #24).
const Home = lazy(() => import('@/pages/Home').then((m) => ({ default: m.Home })));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('@/pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const NotFound = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFound })));

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* `/` mène à la connexion quand on n'a pas de session (F-00, Q8). */}
        <Route
          element={
            <ProtectedRoute>
              <Shell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Home />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export function App({ client = new QueryClient() }: { client?: QueryClient }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
