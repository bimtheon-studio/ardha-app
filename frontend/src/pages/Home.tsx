// Accueil connecté. Les études enregistrées arrivent en L2 ; en L1, l'entrée vers la carte.
import { Map } from 'lucide-react';
import { Link } from 'react-router';

import { useMe } from '@/auth/session';
import { Button } from '@/components/ui/button';

export function Home() {
  const { data: me } = useMe();
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-6 py-12">
      <p className="eyebrow text-primary">Accueil</p>
      <h1 className="text-4xl">Bonjour {me?.name}</h1>
      <p className="text-muted-foreground">Vos études apparaîtront ici.</p>
      <Button asChild>
        <Link to="/map">
          <Map /> Choisir des parcelles
        </Link>
      </Button>
    </div>
  );
}
