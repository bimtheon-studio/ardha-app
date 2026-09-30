// Parcelles sélectionnées (F-01, #10 à #16) : liste, contenance et surface calculée, morceaux,
// refus d'une parcelle qui ne touche pas la sélection.
import type { SelectionSummary } from '@domain';
import { formatArea } from '@domain';
import { AlertTriangle, LocateFixed, MapPin, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { SelectedParcel } from './selection';

interface Props {
  selection: SelectedParcel[];
  summary: SelectionSummary;
  pending: boolean;
  unknown: string[];
  refusal: string | null;
  communeNames: ReadonlyMap<string, string>;
  onRemove: (id: string) => void;
  onClear: () => void;
  onRecenter: () => void;
  onDismissRefusal: () => void;
}

export function SelectionPanel({ selection, summary, pending, unknown, refusal, communeNames, onRemove, onClear, onRecenter, onDismissRefusal }: Props) {
  return (
    <section aria-labelledby="selection-title" className="space-y-3">
      <h2 id="selection-title" className="eyebrow text-primary">
        Parcelles sélectionnées{selection.length > 0 && ` (${selection.length})`}
      </h2>
      {refusal && (
        <div role="alert" className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 p-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="flex-1">{refusal}</p>
          <button type="button" aria-label="Fermer le message" onClick={onDismissRefusal}>
            <X className="size-4" />
          </button>
        </div>
      )}
      {selection.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4" />
          <p>{pending ? 'Chargement de la sélection…' : 'Aucune parcelle. Cliquez sur une parcelle de la carte.'}</p>
        </div>
      ) : (
        <>
          <ul className="max-h-56 divide-y overflow-y-auto border" aria-label="Parcelles">
            {selection.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {p.feature.properties.label}
                    <span className="ml-2 font-normal text-muted-foreground">{communeNames.get(p.feature.properties.communeCode) ?? p.feature.properties.communeCode}</span>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{p.id}</p>
                </div>
                <span className="tabular-nums">{p.contenance === null ? '—' : formatArea(p.contenance)}</span>
                <button type="button" aria-label={`Retirer la parcelle ${p.feature.properties.label}`} className="text-muted-foreground hover:text-destructive" onClick={() => onRemove(p.id)}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Contenance cadastrale</dt>
            <dd className="font-medium tabular-nums" data-testid="total-contenance">
              {formatArea(summary.contenance)}
            </dd>
            <dt className="text-muted-foreground">Surface calculée</dt>
            <dd className="tabular-nums" data-testid="total-area">
              {formatArea(summary.area)}
            </dd>
          </dl>
          {summary.withoutContenance > 0 && (
            <p className="text-xs text-muted-foreground">{summary.withoutContenance} parcelle(s) sans contenance cadastrale, hors du total.</p>
          )}
          {summary.pieces > 1 && (
            <p role="status" className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              La sélection est en {summary.pieces} morceaux : elle n’est plus d’un seul tenant.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onRecenter}>
              <LocateFixed /> Recentrer
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              <Trash2 /> Tout effacer
            </Button>
          </div>
        </>
      )}
      {unknown.length > 0 && <p className="text-xs text-muted-foreground">Parcelle(s) introuvable(s) : {unknown.join(', ')}.</p>}
    </section>
  );
}
