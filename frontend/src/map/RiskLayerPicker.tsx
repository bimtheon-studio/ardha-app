// Couche de la carte des risques (F-04, Q8) : une seule à la fois, ou aucune, avec sa légende (image
// du service WMS) et celle des symboles de la carte (retour du porteur du produit, 13/10/2026).
import type { RiskLayer } from '@contracts';
import { NEARBY_RADIUS_M } from '@domain';
import { type ReactNode, useState } from 'react';

import { RISK_MAP_COLORS as C } from './risk-styles';

export const NO_RISK_LAYER = 'none';

interface Props {
  layers: RiskLayer[];
  /** Identifiant de la couche montrée, ou `NO_RISK_LAYER`. */
  value: string;
  onChange: (id: string) => void;
}

export function RiskLayerPicker({ layers, value, onChange }: Props) {
  const layer = layers.find((l) => l.id === value);
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      <fieldset className="space-y-1">
        <legend className="mb-1 text-muted-foreground">Couche de risques</legend>
        {[...layers, { id: NO_RISK_LAYER, label: 'Aucune' }].map((l) => (
          <label key={l.id} className="flex items-center gap-2">
            <input type="radio" name="risk-layer" value={l.id} checked={value === l.id} onChange={() => onChange(l.id)} />
            {l.label}
          </label>
        ))}
      </fieldset>
      <section aria-label="Légende" className="space-y-2">
        <p className="text-muted-foreground">Légende</p>
        <ul className="space-y-1">
          <Symbol label="Parcelles de l’étude">
            <span className="block size-3.5 border-2" style={{ borderColor: C.parcel, backgroundColor: `${C.parcel}26` }} />
          </Symbol>
          <Symbol label={`Alentours, à moins de ${NEARBY_RADIUS_M} m`}>
            <span className="block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: C.zone }} />
          </Symbol>
          <Symbol label="Borne incendie">
            <span className="block size-3 rounded-full border-2 border-white" style={{ backgroundColor: C.hydrant }} />
          </Symbol>
          <Symbol label="Cavité souterraine recensée">
            <span className="block size-2.5 rounded-full border border-white" style={{ backgroundColor: C.cavity }} />
          </Symbol>
        </ul>
        {layer && <LayerLegend key={layer.id} layer={layer} />}
      </section>
    </div>
  );
}

function Symbol({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex w-4 justify-center" aria-hidden>
        {children}
      </span>
      {label}
    </li>
  );
}

/** Légende fournie par le service ; s'il ne la sert pas, on le dit plutôt que de laisser un vide. */
function LayerLegend({ layer }: { layer: RiskLayer }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <p className="text-xs text-muted-foreground">Légende de « {layer.label} » indisponible.</p>
  ) : (
    <img src={layer.legendUrl} alt={`Légende : ${layer.label}`} className="max-w-full" onError={() => setFailed(true)} />
  );
}
