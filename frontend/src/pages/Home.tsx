// Accueil connecté. En L0, un point d'arrivée ; les études arrivent en L2.
import { useMoi } from '@/auth/session';

export function Accueil() {
  const { data: moi } = useMoi();
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-6 py-12">
      <p className="eyebrow text-primary">Accueil</p>
      <h1 className="text-4xl">Bonjour {moi?.nom}</h1>
      <p className="text-muted-foreground">Vos études apparaîtront ici.</p>
    </div>
  );
}
