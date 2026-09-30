// Panneaux de la carte, rendus seuls : cas que la page atteint rarement.
import type { ParcelFeature } from '@contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CommuneStatus } from './CommuneStatus';
import { SelectionPanel } from './SelectionPanel';

const feature: ParcelFeature = {
  type: 'Feature',
  id: '37023000AB0001',
  geometry: { type: 'Polygon', coordinates: [] },
  properties: { communeCode: '37023', prefix: '000', section: 'AB', number: '0001', label: 'AB 1', contenance: null },
};
const noop = vi.fn();
const panel = { summary: { count: 1, contenance: 0, withoutContenance: 1, area: 12, pieces: 1 }, unknown: [], refusal: null, onRemove: noop, onClear: noop, onRecenter: noop, onDismissRefusal: noop };

describe('SelectionPanel', () => {
  it('parcelle sans contenance ni nom de commune connu', () => {
    render(<SelectionPanel {...panel} pending={false} communeNames={new Map()} selection={[{ id: feature.id, geometry: feature.geometry, contenance: null, feature }]} />);
    expect(screen.getByText('37023')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('1 parcelle(s) sans contenance cadastrale, hors du total.')).toBeInTheDocument();
  });

  it('sélection en attente de ses géométries', () => {
    render(<SelectionPanel {...panel} pending communeNames={new Map()} selection={[]} />);
    expect(screen.getByText('Chargement de la sélection…')).toBeInTheDocument();
  });
});

describe('CommuneStatus', () => {
  const base = { code: '37023', name: null, center: null };
  it('commune pas encore trouvée', () => {
    const { container } = render(<CommuneStatus commune={undefined} loading={false} onRetry={noop} />);
    expect(container).toBeEmptyDOMElement();
    render(<CommuneStatus commune={undefined} loading onRetry={noop} />);
    expect(screen.getByText('Recherche de la commune…')).toBeInTheDocument();
  });

  it('échec sans message, chargement avec reprise annoncée', () => {
    render(<CommuneStatus commune={{ ...base, cadastre: { status: 'failed', version: null, loadedAt: null, parcelCount: null, error: null } }} loading={false} onRetry={noop} />);
    expect(screen.getByText('Le chargement du cadastre a échoué.')).toBeInTheDocument();
    render(<CommuneStatus commune={{ ...base, cadastre: { status: 'loading', version: null, loadedAt: null, parcelCount: null, error: 'Nouvel essai automatique.' } }} loading={false} onRetry={noop} />);
    expect(screen.getByText('Chargement du cadastre de 37023… Nouvel essai automatique.')).toBeInTheDocument();
  });
});
