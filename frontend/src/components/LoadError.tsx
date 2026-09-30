import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <p className="font-medium">Impossible de vérifier votre session</p>
      <p className="max-w-md text-sm text-muted-foreground">Le serveur ne répond pas pour l’instant. Vos données ne sont pas perdues.</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw /> Réessayer
      </Button>
    </div>
  );
}
