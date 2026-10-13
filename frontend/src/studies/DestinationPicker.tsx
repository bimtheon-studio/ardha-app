// Choix des destinations d'une étude (F-02b) : les destinations produit en boutons à bascule, « Autre »
// pour les sous-destinations CNIG, et la principale dès qu'il y en a deux (Q1 à Q3). La dernière
// cochée ne se décoche pas : une étude a toujours une destination.
import { CNIG_SUB_DESTINATIONS, cnigLabel, cnigParent, destinationLabel, normalizeDestinations, STUDY_DESTINATIONS } from '@domain';

interface Props {
  value: readonly string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  /** La légende reste lue, mais ne s'affiche pas (page de l'étude, où la ligne porte déjà le titre). */
  hideLegend?: boolean;
}

const PRODUCT_KEYS = new Set(STUDY_DESTINATIONS.map((d) => d.key));

/** Sous-destinations CNIG, rangées sous leur destination. */
const CNIG_GROUPS = [...new Set(CNIG_SUB_DESTINATIONS.map((c) => cnigParent(c)!))].map((parent) => ({
  parent,
  label: cnigLabel(parent)!,
  codes: CNIG_SUB_DESTINATIONS.filter((c) => cnigParent(c) === parent),
}));

function Toggle({ label, pressed, disabled, onClick }: { label: string; pressed: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`border px-2.5 py-1 text-sm disabled:cursor-not-allowed ${pressed ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
    >
      {label}
    </button>
  );
}

export function DestinationPicker({ value, onChange, disabled = false, hideLegend = false }: Props) {
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  const add = (code: string) => onChange(normalizeDestinations([...value, code]));
  const others = value.filter((v) => !PRODUCT_KEYS.has(v));
  const last = value.length === 1;

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className={hideLegend ? 'sr-only' : 'text-sm font-medium'}>
        Destination
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {STUDY_DESTINATIONS.map((d) => (
          <Toggle key={d.key} label={d.label} pressed={value.includes(d.key)} disabled={disabled || (last && value[0] === d.key)} onClick={() => toggle(d.key)} />
        ))}
        {others.map((code) => (
          <Toggle key={code} label={destinationLabel(code)} pressed disabled={disabled || last} onClick={() => toggle(code)} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <select
          aria-label="Autre destination"
          className="max-w-full border bg-background px-2 py-1"
          value=""
          disabled={disabled}
          onChange={(e) => e.target.value && add(e.target.value)}
        >
          <option value="">Autre…</option>
          {CNIG_GROUPS.map((g) => (
            <optgroup key={g.parent} label={g.label}>
              {g.codes.map((c) => (
                <option key={c} value={c}>
                  {cnigLabel(c)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {value.length > 1 && (
          <label className="flex min-w-0 items-center gap-1">
            <span className="text-muted-foreground">Principale</span>
            <select
              aria-label="Destination principale"
              className="min-w-0 border bg-background px-2 py-1"
              value={value[0]}
              disabled={disabled}
              onChange={(e) => onChange([e.target.value, ...value.filter((v) => v !== e.target.value)])}
            >
              {value.map((v) => (
                <option key={v} value={v}>
                  {destinationLabel(v)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </fieldset>
  );
}
