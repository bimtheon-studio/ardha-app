// Choix d'un nouveau mot de passe par lien. Le jeton est dans l'ancre de l'URL : il ne part ni
// dans les journaux du serveur, ni dans l'en-tête Referer.
import { PasswordReset, authRoutes } from '@contracts';
import { PASSWORD_MIN_LENGTH } from '@domain';
import { KeyRound, Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { callApi } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/Field';
import { AuthPage } from '@/components/AuthPage';
import { useForm } from '@/components/useForm';

export function ResetPassword() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const token = decodeURIComponent(hash.replace(/^#/, ''));
  const form = useForm(PasswordReset);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = form.validate({ token, password });
    if (!body) return;
    setPending(true);
    try {
      await callApi(authRoutes.passwordReset, body);
      await navigate('/login', { replace: true, state: { info: 'Mot de passe changé. Connectez-vous avec le nouveau.' } });
    } catch (error) {
      form.showError(error);
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <AuthPage title="Lien incomplet" description="Ce lien ne contient pas de jeton">
        <p className="text-center text-sm">
          Demandez un nouveau lien à l’administrateur.{' '}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Retour à la connexion
          </Link>
        </p>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Nouveau mot de passe" description="Choisissez le mot de passe de votre compte">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field
          id="motDePasse"
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={form.fields.password}
          hint={`Au moins ${PASSWORD_MIN_LENGTH} caractères.`}
        />
        {(form.message ?? form.fields.token) && (
          <Alert variant="destructive">
            <AlertDescription>{form.message ?? form.fields.token}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Enregistrer
        </Button>
      </form>
    </AuthPage>
  );
}
