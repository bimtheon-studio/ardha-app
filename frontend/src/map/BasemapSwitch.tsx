// Choix du fond de carte (F-01, Q8) et fond estompé (#23).
import type { Basemap } from '@contracts';

interface Props {
  basemaps: Basemap[];
  value: string;
  muted: boolean;
  onChange: (id: string) => void;
  onMutedChange: (muted: boolean) => void;
}

export function BasemapSwitch({ basemaps, value, muted, onChange, onMutedChange }: Props) {
  return (
    <fieldset className="space-y-2">
      <legend className="eyebrow mb-2 text-primary">Fond de carte</legend>
      {basemaps.map((b) => (
        <label key={b.id} className="flex items-center gap-2 text-sm">
          <input type="radio" name="basemap" value={b.id} checked={value === b.id} onChange={() => onChange(b.id)} />
          {b.label}
        </label>
      ))}
      <label className="flex items-center gap-2 pt-1 text-sm">
        <input type="checkbox" checked={muted} onChange={(e) => onMutedChange(e.target.checked)} />
        Estomper le fond
      </label>
      <p className="pl-6 text-xs text-muted-foreground">Seule la sélection reste en évidence.</p>
    </fieldset>
  );
}
