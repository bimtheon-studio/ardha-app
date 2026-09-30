// Frontière d'erreur (F-00, #23) : une exception de rendu n'abat pas toute l'application.
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl">Une erreur est survenue</h1>
          <p className="text-sm text-muted-foreground">Vous pouvez réessayer ou recharger la page.</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => this.setState({ error: null })}>Réessayer</Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Recharger
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
