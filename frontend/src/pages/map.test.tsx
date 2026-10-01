// Page de la carte (F-01), contre une fausse API. La carte Leaflet est remplacée par un double qui
// expose ses rappels (vue, clic sur une parcelle) : happy-dom ne dessine pas de carte, l'e2e s'en charge.
import type { Commune, ParcelFeature } from '@contracts';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vintage } from '@/map/CommuneStatus';
import type { Viewport } from '@/map/leaflet/MapView';
import { alice, fakeApi, renderAt } from '@/test/helpers';

let viewportCallback: ((v: Viewport) => void) | undefined;
let lastProps: Record<string, unknown> = {};

vi.mock('@/map/leaflet/MapView', () => ({
  default: function FakeMap(props: { parcels: ParcelFeature[]; selected: Set<string>; onViewport: (v: Viewport) => void; onParcelClick: (f: ParcelFeature) => void; muted: boolean; basemap: { id: string } }) {
    viewportCallback = props.onViewport;
    lastProps = props;
    const location = useLocation();
    return (
      <div data-testid="map" data-basemap={props.basemap.id} data-muted={String(props.muted)}>
        <p data-testid="url">{location.search}</p>
        {props.parcels.map((f) => (
          <button key={f.id} type="button" aria-pressed={props.selected.has(f.id)} onClick={() => props.onParcelClick(f)}>
            parcelle {f.properties.label}
          </button>
        ))}
      </div>
    );
  },
}));

/** Parcelle carrée n° i d'une rangée, de 0,0001° de côté (≈ 7 × 11 m), contenance 80 m². */
function parcel(i: number): ParcelFeature {
  const w = 2.43 + i * 0.0001;
  const s = 48.8;
  const n = String(i).padStart(4, '0');
  return {
    type: 'Feature',
    id: `94046000AB${n}`,
    geometry: { type: 'MultiPolygon', coordinates: [[[[w, s], [w + 0.0001, s], [w + 0.0001, s + 0.0001], [w, s + 0.0001], [w, s]]]] },
    properties: { communeCode: '94046', prefix: '000', section: 'AB', number: n, label: `AB ${i}`, contenance: 80 },
  };
}

const LAYERS = {
  basemaps: [
    { id: 'osm', label: 'OpenStreetMap', url: 'https://osm/{z}/{x}/{y}', attribution: 'OSM', maxZoom: 19 },
    { id: 'plan', label: 'Plan IGN', url: 'https://tuiles/{z}/{x}/{y}', attribution: 'IGN', maxZoom: 19 },
    { id: 'ortho', label: 'Photographies aériennes', url: 'https://ortho/{z}/{x}/{y}', attribution: 'IGN', maxZoom: 20 },
  ],
  defaultBasemap: 'osm',
  parcelsMinZoom: 16,
};

function commune(status: Commune['cadastre']['status'], extra: Partial<Commune['cadastre']> = {}): Commune {
  return {
    code: '94046',
    name: status === 'missing' ? null : 'Maisons-Alfort',
    center: null,
    cadastre: { status, version: status === 'ready' ? '2026-09-01' : null, loadedAt: null, parcelCount: null, error: null, ...extra },
  };
}

const ADDRESS = {
  id: '94046_7120_00009',
  label: '9 Rue Pasteur 94700 Maisons-Alfort',
  context: '94, Val-de-Marne, Île-de-France',
  kind: 'housenumber',
  lon: 2.43,
  lat: 48.8,
  communeCode: '94046',
  city: 'Maisons-Alfort',
  postcode: '94700',
  score: 0.99,
};

const near: Viewport = { bbox: [2.425, 48.795, 2.435, 48.805], center: { lat: 48.8, lon: 2.43 }, zoom: 18 };

function api(overrides: Record<string, unknown> = {}) {
  return fakeApi({
    'GET /api/auth/me': { status: 200, body: alice },
    'GET /api/map/layers': { status: 200, body: LAYERS },
    'GET /api/communes/locate': { status: 200, body: { commune: { code: '94046', name: 'Maisons-Alfort' } } },
    'GET /api/communes/94046': { status: 200, body: commune('ready') },
    'POST /api/communes/94046/cadastre': { status: 202, body: commune('ready') },
    'GET /api/parcels': (_, url) => {
      const ids = url.searchParams.get('ids');
      const all = [0, 1, 2, 5].map(parcel);
      const features = ids ? all.filter((f) => ids.split(',').includes(f.id)) : all;
      return { status: 200, body: { type: 'FeatureCollection', features, truncated: false } };
    },
    'GET /api/addresses/search': { status: 200, body: { addresses: [ADDRESS, { ...ADDRESS, id: 'b', label: '9 Rue Pasteur 33200 Bordeaux', context: '33, Gironde' }] } },
    ...(overrides as Record<string, never>),
  });
}

async function openMap(url = '/map') {
  renderAt(url);
  await screen.findByTestId('map');
}

function viewAt(v: Viewport) {
  act(() => viewportCallback!(v));
}

beforeEach(() => {
  viewportCallback = undefined;
  lastProps = {};
});
afterEach(() => localStorage.clear());

describe('carte : parcelles et sélection', () => {
  it('loin : invite à zoomer ; près : parcelles de la commune, sélection, totaux, URL', async () => {
    api();
    await openMap();
    expect(screen.getByText('Recherchez une adresse, ou zoomez pour afficher les parcelles.')).toBeInTheDocument();
    viewAt(near);
    await userEvent.click(await screen.findByRole('button', { name: 'parcelle AB 0' }));
    await userEvent.click(screen.getByRole('button', { name: 'parcelle AB 1' }));
    expect(await screen.findByText('Maisons-Alfort · cadastre du 1er septembre 2026')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Parcelles' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('total-contenance')).toHaveTextContent('160 m²');
    expect(screen.getByTestId('total-area').textContent).toMatch(/^1\d\d m²$/);
    expect(screen.getByTestId('url')).toHaveTextContent('parcels=94046000AB0000%2C94046000AB0001');

    // Sélection libre (Q4) : une parcelle isolée s'ajoute, et la sélection est dite en morceaux.
    await userEvent.click(screen.getByRole('button', { name: 'parcelle AB 5' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('La sélection est en 2 morceaux : elle n’est plus d’un seul tenant.')).toBeInTheDocument();
  });

  it('au-delà de 50 parcelles, refus expliqué', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => parcel(i).id).join(',');
    api({
      'GET /api/parcels': (_: unknown, url: URL) => {
        const all = Array.from({ length: 51 }, (_, i) => parcel(i));
        const wanted = url.searchParams.get('ids')?.split(',');
        return { status: 200, body: { type: 'FeatureCollection', features: wanted ? all.filter((f) => wanted.includes(f.id)) : all, truncated: false } };
      },
    });
    await openMap(`/map?parcels=${ids}`);
    viewAt(near);
    await userEvent.click(await screen.findByRole('button', { name: 'parcelle AB 50' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Une sélection compte au plus 50 parcelles.');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le message' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retirer la parcelle du milieu avertit que la sélection est en morceaux ; tout effacer', async () => {
    api();
    await openMap('/map?parcels=94046000AB0000,94046000AB0001,94046000AB0002');
    viewAt(near);
    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Retirer la parcelle AB 1' }));
    expect(screen.getByText('La sélection est en 2 morceaux : elle n’est plus d’un seul tenant.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'parcelle AB 0' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /Tout effacer/ }));
    expect(screen.getByText('Aucune parcelle. Cliquez sur une parcelle de la carte.')).toBeInTheDocument();
    expect(screen.getByTestId('url')).not.toHaveTextContent('parcels');
  });

  it('au rechargement, la sélection revient de l’URL par identifiants, même hors de la vue', async () => {
    const calls = api();
    await openMap('/map?at=48.8,2.43,12&parcels=94046000AB0005,37023000ZZ9999');
    expect(await screen.findByText('AB 5')).toBeInTheDocument();
    expect(calls.map((c) => c.key)).toContain('GET /api/parcels?ids=94046000AB0005%2C37023000ZZ9999');
    expect(screen.getByText('Parcelle(s) introuvable(s) : 37023000ZZ9999.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Recentrer/ }));
    expect(lastProps.target).toMatchObject({ bounds: [expect.closeTo(2.4305, 4), 48.8, expect.closeTo(2.4306, 4), expect.closeTo(48.8001, 4)] });
  });

  it('zone trop étendue, parcelles en échec ou tronquées : un message sur la carte', async () => {
    api({ 'GET /api/parcels': { status: 200, body: { type: 'FeatureCollection', features: [], truncated: true } } });
    await openMap();
    viewAt({ ...near, bbox: [2.3, 48.7, 2.5, 48.9] });
    expect(screen.getByText('Zone trop étendue : zoomez pour afficher les parcelles.')).toBeInTheDocument();
    viewAt(near);
    expect(await screen.findByText('Trop de parcelles ici : toutes ne sont pas affichées, zoomez.')).toBeInTheDocument();
  });

  it('parcelles injoignables : message', async () => {
    api({ 'GET /api/parcels': { status: 500, body: { message: 'Erreur.' } } });
    await openMap();
    viewAt(near);
    expect(await screen.findByText('Les parcelles n’ont pas pu être chargées.', {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe('carte : cadastre de la commune', () => {
  it('jamais chargé : demandé de lui-même, une seule fois', async () => {
    const calls = api({ 'GET /api/communes/94046': { status: 200, body: commune('missing') }, 'POST /api/communes/94046/cadastre': { status: 202, body: commune('loading', { error: null }) } });
    await openMap();
    viewAt(near);
    expect(await screen.findByText('Chargement du cadastre de Maisons-Alfort…')).toBeInTheDocument();
    viewAt({ ...near, zoom: 17 });
    expect(calls.filter((c) => c.key === 'POST /api/communes/94046/cadastre')).toHaveLength(1);
  });

  it('en échec : le message et « Réessayer »', async () => {
    const calls = api({ 'GET /api/communes/94046': { status: 200, body: commune('failed', { error: 'Le cadastre est injoignable.' }) } });
    await openMap();
    viewAt(near);
    expect(await screen.findByText('Le cadastre est injoignable.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    await waitFor(() => expect(calls.map((c) => c.key)).toContain('POST /api/communes/94046/cadastre'));
  });

  it('millésime en toutes lettres', () => {
    expect(vintage('2026-09-01')).toBe('1er septembre 2026');
    expect(vintage('2026-06-15')).toBe('15 juin 2026');
  });
});

describe('carte : recherche d’adresse', () => {
  it('suggère après 3 caractères ; au clavier, choisit, centre la carte et demande le cadastre', async () => {
    const calls = api();
    await openMap();
    const box = screen.getByRole('combobox', { name: 'Adresse' });
    await userEvent.type(box, '9 r');
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['9 Rue Pasteur 94700 Maisons-Alfort94, Val-de-Marne, Île-de-France', '9 Rue Pasteur 33200 Bordeaux33, Gironde']);
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}{ArrowDown}{Enter}');
    expect(box).toHaveValue('9 Rue Pasteur 94700 Maisons-Alfort');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(lastProps.target).toMatchObject({ view: { lat: 48.8, lon: 2.43, zoom: 18 } });
    expect(lastProps.marker).toEqual({ lat: 48.8, lon: 2.43, label: '9 Rue Pasteur 94700 Maisons-Alfort' });
    expect(calls.map((c) => c.key)).toContain('POST /api/communes/94046/cadastre');
    // Le libellé choisi n'est pas recherché à son tour.
    await new Promise((r) => setTimeout(r, 350));
    expect(calls.filter((c) => c.key.startsWith('GET /api/addresses/search'))).toHaveLength(1);
    // Échap ferme les suggestions ; quitter le champ aussi.
    await userEvent.type(box, ' ');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.type(box, 'x');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await userEvent.tab();
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('à la souris ; aucune suggestion ; recherche en échec', async () => {
    api({
      'GET /api/addresses/search?q=nulle+part': { status: 200, body: { addresses: [] } },
      'GET /api/addresses/search?q=panne': { status: 503, body: { message: 'La recherche est momentanément indisponible. Réessayez dans un instant.' } },
    });
    await openMap();
    const box = screen.getByRole('combobox', { name: 'Adresse' });
    await userEvent.type(box, 'Pasteur');
    const [, second] = await screen.findAllByRole('option');
    await userEvent.hover(second!);
    await userEvent.click(second!);
    expect(box).toHaveValue('9 Rue Pasteur 33200 Bordeaux');
    await userEvent.clear(box);
    await userEvent.type(box, 'nulle part');
    expect(await screen.findByText('Aucune adresse ne correspond.')).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'panne');
    expect(await screen.findByRole('alert')).toHaveTextContent('La recherche est momentanément indisponible.');
  });

  it('ma position : adresse la plus proche ; erreurs de géolocalisation', async () => {
    api({ 'GET /api/addresses/reverse': { status: 200, body: { address: ADDRESS } } });
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { longitude: 2.43, latitude: 48.8 } } as GeolocationPosition));
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    await openMap();
    await userEvent.click(screen.getByRole('button', { name: 'Ma position' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Adresse' })).toHaveValue('9 Rue Pasteur 94700 Maisons-Alfort'));

    getCurrentPosition.mockImplementation(((_: PositionCallback, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError)) as never);
    await userEvent.click(screen.getByRole('button', { name: 'Ma position' }));
    expect(await screen.findByText('Accès à la position refusé.')).toBeInTheDocument();
    getCurrentPosition.mockImplementation(((_: PositionCallback, fail: PositionErrorCallback) => fail({ code: 9 } as GeolocationPositionError)) as never);
    await userEvent.click(screen.getByRole('button', { name: 'Ma position' }));
    expect(await screen.findByText('Position indisponible.')).toBeInTheDocument();
  });

  it('ma position : rien trouvé, recherche en échec, navigateur sans géolocalisation', async () => {
    let reply: { status: number; body: unknown } = { status: 200, body: { address: null } };
    api({ 'GET /api/addresses/reverse': () => reply });
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { longitude: 0, latitude: 0 } } as GeolocationPosition) } });
    await openMap();
    await userEvent.click(screen.getByRole('button', { name: 'Ma position' }));
    expect(await screen.findByText('Aucune adresse trouvée à votre position.')).toBeInTheDocument();
    reply = { status: 503, body: { message: 'Indisponible.' } };
    await userEvent.click(screen.getByRole('button', { name: 'Ma position' }));
    expect(await screen.findByText('Indisponible.')).toBeInTheDocument();
    vi.stubGlobal('navigator', {});
    await userEvent.click(screen.getByRole('button', { name: 'Ma position' }));
    expect(await screen.findByText('La géolocalisation n’est pas disponible dans ce navigateur.')).toBeInTheDocument();
  });
});

describe('carte : fond', () => {
  it('OpenStreetMap par défaut ; photographies ; fond estompé retenu d’une visite à l’autre', async () => {
    api();
    await openMap();
    expect(screen.getByTestId('map')).toHaveAttribute('data-basemap', 'osm');
    await userEvent.click(screen.getByRole('radio', { name: 'Photographies aériennes' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-basemap', 'ortho');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Estomper le fond' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-muted', 'true');
    expect(localStorage.getItem('ardha.map.muted')).toBe('1');
  });

  it('sans stockage local (navigation privée stricte), le fond estompé ne dure que la visite', async () => {
    api();
    const blocked = () => {
      throw new Error('bloqué');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, clear: () => undefined });
    await openMap();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Estomper le fond' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-muted', 'true');
  });

  it('l’accueil mène à la carte', async () => {
    api();
    renderAt('/');
    await userEvent.click(await screen.findByRole('link', { name: 'Choisir des parcelles' }));
    expect(await screen.findByTestId('map')).toBeInTheDocument();
  });
});
