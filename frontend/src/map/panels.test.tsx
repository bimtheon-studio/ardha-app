// Panneaux de la carte, rendus seuls : cas que la page atteint rarement.
import type { ParcelFeature } from '@contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { fakeApi } from '@/test/helpers';

import { CommuneStatus } from './CommuneStatus';
import { ElevationSummary } from './ElevationSummary';
import { SelectionPanel } from './SelectionPanel';

const feature: ParcelFeature = {
  type: 'Feature',
  id: '37023000AB0001',
  geometry: { type: 'Polygon', coordinates: [] },
  properties: { communeCode: '37023', prefix: '000', section: 'AB', number: '0001', label: 'AB 1', contenance: null },
};
const noop = vi.fn();
// Le panneau de sélection lit les altitudes par TanStack Query.
const render = (ui: ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const panel = { summary: { count: 1, contenance: 0, withoutContenance: 1, area: 12, pieces: 1 }, unknown: [], refusal: null, onRemove: noop, onClear: noop, onRecenter: noop, onDismissRefusal: noop };

describe('SelectionPanel', () => {
  it('parcelle sans contenance ni nom de commune connu', () => {
    fakeApi({ 'GET /api/parcels/elevation': { status: 200, body: { overall: { min: 31.9, max: 32.6, mean: 32.2, range: 0.7, points: 23 }, parcels: [], source: 'IGN' } } });
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

describe('ElevationSummary (Q6)', () => {
  const stats = { min: 31.88, max: 32.55, mean: 32.2, range: 0.67, points: 23 };

  it('mesure une fois la sélection stable : min, max, moyenne, dénivelé, source', async () => {
    const calls = fakeApi({ 'GET /api/parcels/elevation': { status: 200, body: { overall: stats, parcels: [], source: 'IGN, RGE ALTI®' } } });
    render(<ElevationSummary ids={['94046000AY0097', '94046000AY0096']} />);
    expect(screen.getByText('Mesure des altitudes…')).toBeInTheDocument();
    expect(await screen.findByTestId('elevation', {}, { timeout: 3000 })).toHaveTextContent('31,88 m à 32,55 m NGF · moyenne 32,2 m · dénivelé 0,67 m');
    expect(screen.getByText('IGN, RGE ALTI®')).toBeInTheDocument();
    expect(calls.map((c) => c.key)).toEqual(['GET /api/parcels/elevation?ids=94046000AY0096%2C94046000AY0097']);
  });

  it('indisponible : « Réessayer » ; aucune altitude connue', async () => {
    let fail = true;
    fakeApi({ 'GET /api/parcels/elevation': () => (fail ? { status: 503, body: { message: 'Indisponible.' } } : { status: 200, body: { overall: null, parcels: [], source: 'IGN' } }) });
    render(<ElevationSummary ids={['94046000AY0096']} />);
    expect(await screen.findByText('Altitudes indisponibles pour l’instant.', {}, { timeout: 3000 })).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Pas d’altitude connue ici.')).toBeInTheDocument();
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
