import { Signup as SignupSchema } from '@contracts';
import { PASSWORD_MIN_LENGTH } from '@domain';
import { Loader2, UserPlus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { returnPath } from '@/auth/ProtectedRoute';
import { useSignup, useMe } from '@/auth/session';
import { Field } from '@/components/Field';
import { AuthPage } from '@/components/AuthPage';
import { useForm } from '@/components/useForm';

export function Signup() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const signup = useSignup();
  const form = useForm(SignupSchema);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const returnTo = returnPath(location.state);

  if (me.data) return <Navigate to={returnTo} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = form.validate({ name, email, password });
    if (!body) return;
    try {
      await signup.mutateAsync(body);
      await navigate(returnTo, { replace: true });
    } catch (error) {
      form.showError(error);
    }
  }

  return (
    <AuthPage title="Inscription" description="Créez votre compte">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="nom" label="Nom" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={form.fields.name} />
        <Field id="email" label="Adresse e-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={form.fields.email} />
        <Field
          id="motDePasse"
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={form.fields.password}
          hint={`Au moins ${PASSWORD_MIN_LENGTH} caractères. Une phrase de plusieurs mots est idéale.`}
        />
        {form.message && (
          <Alert variant="destructive">
            <AlertDescription>{form.message}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={signup.isPending}>
          {signup.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Créer mon compte
        </Button>
        <p className="text-center text-sm">
          <Link to="/login" state={location.state} className="text-primary underline-offset-4 hover:underline">
            Déjà un compte ? Se connecter
          </Link>
        </p>
      </form>
    </AuthPage>
  );
}
