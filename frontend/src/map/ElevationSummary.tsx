// Altitudes de la sélection (F-04, Q6) : min, max, moyenne et dénivelé, en m NGF, mesurés par le
// worker sur l'IGN une fois la sélection stable (comme l'ancienne page Cadastre).
import { Mountain, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useSelectionElevation } from './api';
import { useDebounced } from './useDebounced';

const m = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m`;

export function ElevationSummary({ ids }: { ids: readonly string[] }) {
  const stable = useDebounced(ids.join(','), 800);
  const elevation = useSelectionElevation(stable ? stable.split(',') : []);
  const waiting = stable !== ids.join(',');
  return (
    <div className="space-y-1 text-sm" aria-label="Altitudes">
      <p className="flex items-center gap-2 text-muted-foreground">
        <Mountain className="size-4" /> Altitudes
      </p>
      {waiting || elevation.isPending ? (
        <p className="text-muted-foreground">Mesure des altitudes…</p>
      ) : elevation.isError ? (
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground">Altitudes indisponibles pour l’instant.</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void elevation.refetch()}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      ) : elevation.data.overall ? (
        <>
          <p className="tabular-nums" data-testid="elevation">
            {m(elevation.data.overall.min)} à {m(elevation.data.overall.max)} NGF · moyenne {m(elevation.data.overall.mean)} · dénivelé {m(elevation.data.overall.range)}
          </p>
          <p className="text-xs text-muted-foreground">{elevation.data.source}</p>
        </>
      ) : (
        <p className="text-muted-foreground">Pas d’altitude connue ici.</p>
      )}
    </div>
  );
}
