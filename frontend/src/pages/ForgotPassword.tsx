// Sans e-mail en v1 (F-00, Q9) : l'administrateur crée un lien de réinitialisation et le transmet.
import { Link } from 'react-router';

import { PageAuth } from '@/components/AuthPage';

export function MotDePasseOublie() {
  return (
    <PageAuth titre="Mot de passe oublié" description="Contactez l’administrateur d’Ardha">
      <div className="space-y-4 text-sm">
        <p>
          L’administrateur peut vous transmettre un lien pour choisir un nouveau mot de passe. Ce lien ne sert qu’une fois et reste
          valable 24 heures.
        </p>
        <p className="text-center">
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </PageAuth>
  );
}
