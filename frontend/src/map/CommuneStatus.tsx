// État du cadastre de la commune affichée (F-01, #5 à #7, #31) : chargement, millésime, échec.
import type { Commune } from '@contracts';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** « 1er septembre 2026 ». */
export function vintage(version: string): string {
  const d = new Date(`${version}T00:00:00Z`);
  const day = d.getUTCDate();
  return `${day === 1 ? '1er' : day} ${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
}

interface Props {
  commune: Commune | undefined;
  loading: boolean;
  onRetry: () => void;
}

export function CommuneStatus({ commune, loading, onRetry }: Props) {
  if (!commune) {
    return loading ? (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Recherche de la commune…
      </p>
    ) : null;
  }
  const { name, cadastre } = commune;
  const label = name ?? commune.code;
  switch (cadastre.status) {
    case 'ready':
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          {label} · cadastre du {vintage(cadastre.version!)}
        </p>
      );
    case 'failed':
      return (
        <div role="alert" className="space-y-2 text-sm">
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {cadastre.error ?? 'Le chargement du cadastre a échoué.'}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      );
    default:
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Chargement du cadastre de {label}…{cadastre.error && ` ${cadastre.error}`}
        </p>
      );
  }
}
