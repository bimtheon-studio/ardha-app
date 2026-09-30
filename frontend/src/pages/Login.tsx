import { Login as LoginSchema } from '@contracts';
import { Loader2, LogIn } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { returnPath } from '@/auth/ProtectedRoute';
import { useLogin, useMe } from '@/auth/session';
import { Field } from '@/components/Field';
import { AuthPage } from '@/components/AuthPage';
import { useForm } from '@/components/useForm';

export function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const login = useLogin();
  const form = useForm(LoginSchema);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const returnTo = returnPath(location.state);
  const info = (location.state as { info?: string } | null)?.info;

  if (me.data) return <Navigate to={returnTo} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = form.validate({ email, password });
    if (!body) return;
    try {
      await login.mutateAsync(body);
      await navigate(returnTo, { replace: true });
    } catch (error) {
      form.showError(error);
    }
  }

  return (
    <AuthPage title="Connexion" description="Connectez-vous à votre compte">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {info && (
          <Alert>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        )}
        <Field id="email" label="Adresse e-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={form.fields.email} />
        <Field
          id="motDePasse"
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={form.fields.password}
        />
        {form.message && (
          <Alert variant="destructive">
            <AlertDescription>{form.message}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
          Se connecter
        </Button>
        <div className="flex flex-col items-center gap-1 text-sm">
          <Link to="/signup" state={location.state} className="text-primary underline-offset-4 hover:underline">
            Pas de compte ? S’inscrire
          </Link>
          <Link to="/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
      </form>
    </AuthPage>
  );
}
