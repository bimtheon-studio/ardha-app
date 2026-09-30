import { Inscription as SchemaInscription } from '@contrats';
import { LONGUEUR_MIN_MOT_DE_PASSE } from '@domaine';
import { Loader2, UserPlus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { pageDeRetour } from '@/auth/RouteProtegee';
import { useInscription, useMoi } from '@/auth/session';
import { Champ } from '@/composants/Champ';
import { PageAuth } from '@/composants/PageAuth';
import { useFormulaire } from '@/composants/useFormulaire';

export function Inscription() {
  const location = useLocation();
  const naviguer = useNavigate();
  const moi = useMoi();
  const inscription = useInscription();
  const form = useFormulaire(SchemaInscription);
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const retour = pageDeRetour(location.state);

  if (moi.data) return <Navigate to={retour} replace />;

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const corps = form.valider({ nom, email, motDePasse });
    if (!corps) return;
    try {
      await inscription.mutateAsync(corps);
      await naviguer(retour, { replace: true });
    } catch (erreur) {
      form.afficherErreur(erreur);
    }
  }

  return (
    <PageAuth titre="Inscription" description="Créez votre compte">
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        <Champ id="nom" libelle="Nom" autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)} erreur={form.champs.nom} />
        <Champ id="email" libelle="Adresse e-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} erreur={form.champs.email} />
        <Champ
          id="motDePasse"
          libelle="Mot de passe"
          type="password"
          autoComplete="new-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          erreur={form.champs.motDePasse}
          aide={`Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères. Une phrase de plusieurs mots est idéale.`}
        />
        {form.message && (
          <Alert variant="destructive">
            <AlertDescription>{form.message}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={inscription.isPending}>
          {inscription.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Créer mon compte
        </Button>
        <p className="text-center text-sm">
          <Link to="/login" state={location.state} className="text-primary underline-offset-4 hover:underline">
            Déjà un compte ? Se connecter
          </Link>
        </p>
      </form>
    </PageAuth>
  );
}
