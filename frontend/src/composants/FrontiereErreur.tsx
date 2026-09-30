// Frontière d'erreur (F-00, #23) : une exception de rendu n'abat pas toute l'application.
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface Etat {
  erreur: Error | null;
}

export class FrontiereErreur extends Component<{ children: ReactNode }, Etat> {
  override state: Etat = { erreur: null };

  static getDerivedStateFromError(erreur: Error): Etat {
    return { erreur };
  }

  override componentDidCatch(erreur: Error, info: ErrorInfo): void {
    console.error(erreur, info.componentStack);
  }

  override render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl">Une erreur est survenue</h1>
          <p className="text-sm text-muted-foreground">Vous pouvez réessayer ou recharger la page.</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => this.setState({ erreur: null })}>Réessayer</Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Recharger
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
