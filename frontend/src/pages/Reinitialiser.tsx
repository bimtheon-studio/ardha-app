// Choix d'un nouveau mot de passe par lien. Le jeton est dans l'ancre de l'URL : il ne part ni
// dans les journaux du serveur, ni dans l'en-tête Referer.
import { Reinitialisation, routesAuth } from '@contrats';
import { LONGUEUR_MIN_MOT_DE_PASSE } from '@domaine';
import { KeyRound, Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { appeler } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Champ } from '@/composants/Champ';
import { PageAuth } from '@/composants/PageAuth';
import { useFormulaire } from '@/composants/useFormulaire';

export function Reinitialiser() {
  const { hash } = useLocation();
  const naviguer = useNavigate();
  const jeton = decodeURIComponent(hash.replace(/^#/, ''));
  const form = useFormulaire(Reinitialisation);
  const [motDePasse, setMotDePasse] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const corps = form.valider({ jeton, motDePasse });
    if (!corps) return;
    setEnCours(true);
    try {
      await appeler(routesAuth.passwordReset, corps);
      await naviguer('/login', { replace: true, state: { info: 'Mot de passe changé. Connectez-vous avec le nouveau.' } });
    } catch (erreur) {
      form.afficherErreur(erreur);
    } finally {
      setEnCours(false);
    }
  }

  if (!jeton) {
    return (
      <PageAuth titre="Lien incomplet" description="Ce lien ne contient pas de jeton">
        <p className="text-center text-sm">
          Demandez un nouveau lien à l’administrateur.{' '}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Retour à la connexion
          </Link>
        </p>
      </PageAuth>
    );
  }

  return (
    <PageAuth titre="Nouveau mot de passe" description="Choisissez le mot de passe de votre compte">
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        <Champ
          id="motDePasse"
          libelle="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          erreur={form.champs.motDePasse}
          aide={`Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`}
        />
        {(form.message ?? form.champs.jeton) && (
          <Alert variant="destructive">
            <AlertDescription>{form.message ?? form.champs.jeton}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={enCours}>
          {enCours ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Enregistrer
        </Button>
      </form>
    </PageAuth>
  );
}
