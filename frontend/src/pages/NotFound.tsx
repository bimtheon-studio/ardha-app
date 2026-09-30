import { Link } from 'react-router';

export function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-center">
      <div className="space-y-4">
        <p className="eyebrow text-primary">Erreur 404</p>
        <h1 className="text-4xl">Page introuvable</h1>
        <p className="text-muted-foreground">Cette adresse ne mène à aucune page d’Ardha.</p>
        <Link to="/" className="text-primary underline-offset-4 hover:underline">
          Retour à l’accueil
        </Link>
      </div>
    </main>
  );
}
