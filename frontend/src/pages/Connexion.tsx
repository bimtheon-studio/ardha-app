import { Connexion as SchemaConnexion } from '@contrats';
import { Loader2, LogIn } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { pageDeRetour } from '@/auth/RouteProtegee';
import { useConnexion, useMoi } from '@/auth/session';
import { Champ } from '@/composants/Champ';
import { PageAuth } from '@/composants/PageAuth';
import { useFormulaire } from '@/composants/useFormulaire';

export function Connexion() {
  const location = useLocation();
  const naviguer = useNavigate();
  const moi = useMoi();
  const connexion = useConnexion();
  const form = useFormulaire(SchemaConnexion);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const retour = pageDeRetour(location.state);
  const info = (location.state as { info?: string } | null)?.info;

  if (moi.data) return <Navigate to={retour} replace />;

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const corps = form.valider({ email, motDePasse });
    if (!corps) return;
    try {
      await connexion.mutateAsync(corps);
      await naviguer(retour, { replace: true });
    } catch (erreur) {
      form.afficherErreur(erreur);
    }
  }

  return (
    <PageAuth titre="Connexion" description="Connectez-vous à votre compte">
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        {info && (
          <Alert>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        )}
        <Champ id="email" libelle="Adresse e-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} erreur={form.champs.email} />
        <Champ
          id="motDePasse"
          libelle="Mot de passe"
          type="password"
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          erreur={form.champs.motDePasse}
        />
        {form.message && (
          <Alert variant="destructive">
            <AlertDescription>{form.message}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={connexion.isPending}>
          {connexion.isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
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
    </PageAuth>
  );
}
