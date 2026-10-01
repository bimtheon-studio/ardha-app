// Écrans de l'étude (F-02) contre une fausse API : accueil, page de l'étude, corbeille, création
// depuis la carte, carte d'une étude. Les cartes Leaflet sont remplacées par des doubles.
import type { Address, ParcelFeature, Study, StudySummary } from '@contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { alice, fakeApi, renderAt } from '@/test/helpers';

vi.mock('@/map/leaflet/MapView', () => ({
  default: function FakeMap(props: { parcels: ParcelFeature[]; selected: Set<string>; onViewport: (v: unknown) => void; onParcelClick: (f: ParcelFeature) => void; target: unknown }) {
    return (
      <div data-testid="map" data-target={JSON.stringify(props.target)}>
        <button type="button" onClick={() => props.onViewport({ bbox: [2.429, 48.799, 2.431, 48.801], center: { lat: 48.8, lon: 2.43 }, zoom: 18 })}>
          zoomer
        </button>
        {props.parcels.map((f) => (
          <button key={f.id} type="button" aria-pressed={props.selected.has(f.id)} onClick={() => props.onParcelClick(f)}>
            parcelle {f.properties.label}
          </button>
        ))}
      </div>
    );
  },
}));
vi.mock('@/map/leaflet/StudyMap', () => ({
  default: ({ parcels }: { parcels: { id: string }[] }) => <div data-testid="study-map">{parcels.map((p) => p.id).join(',')}</div>,
}));

afterEach(() => vi.useRealTimers());

const NOW = new Date();
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function feature(i: number): ParcelFeature {
  const w = 2.43 + i * 0.0001;
  const n = String(i).padStart(4, '0');
  return {
    type: 'Feature',
    id: `94046000AB${n}`,
    geometry: { type: 'MultiPolygon', coordinates: [[[[w, 48.8], [w + 0.0001, 48.8], [w + 0.0001, 48.8001], [w, 48.8001], [w, 48.8]]]] },
    properties: { communeCode: '94046', prefix: '000', section: 'AB', number: n, label: `AB ${i}`, contenance: 80 },
  };
}

function address(n: number): Address {
  return {
    id: `94046_0001_0000${n}`,
    label: `${n} Rue Pasteur 94700 Maisons-Alfort`,
    name: `${n} Rue Pasteur`,
    street: 'Rue Pasteur',
    context: '94',
    kind: 'housenumber',
    lon: 2.43,
    lat: 48.8,
    communeCode: '94046',
    city: 'Maisons-Alfort',
    postcode: '94700',
    score: 0.9,
  };
}

function summary(over: Partial<StudySummary> = {}): StudySummary {
  return {
    id: '01a0f885-0000-7000-8000-000000000001',
    name: '2 Rue Pasteur, Maisons-Alfort (+1 parcelle)',
    communeCode: '94046',
    communeName: 'Maisons-Alfort',
    addressLabel: '2 Rue Pasteur 94700 Maisons-Alfort',
    parcelCount: 2,
    contenance: 160,
    area: 158,
    thumbnailUrl: '/api/studies/01a0f885-0000-7000-8000-000000000001/thumbnail?v=abc',
    createdAt: ago(3 * 3600_000),
    updatedAt: ago(2 * 3600_000),
    deletedAt: null,
    purgeAt: null,
    ...over,
  };
}

function study(over: Partial<Study> = {}): Study {
  const parcels = (over.parcels ?? [feature(0), feature(1)].map((f) => ({ ...f.properties, id: f.id, area: 79, version: '2026-09-01', geometry: f.geometry }))) as Study['parcels'];
  return {
    ...summary(),
    parcels,
    parcelCount: parcels.length,
    address: address(2),
    addresses: [address(2), address(4)],
    chosenAddressId: null,
    nameIsProvisional: false,
    addressPending: false,
    thumbnailPending: false,
    steps: [
      { key: 'parcels', label: 'Parcelles', state: 'done', lot: null },
      { key: 'urbanism', label: 'Urbanisme', state: 'upcoming', lot: 'L3' },
      { key: 'risks', label: 'Risques', state: 'todo', lot: null },
    ],
    ...over,
  };
}

const ID = summary().id;
const COPY = '01a0f885-0000-7000-8000-000000000002';
const LAYERS = { basemaps: [{ id: 'osm', label: 'OpenStreetMap', url: 'https://osm/{z}/{x}/{y}', attribution: 'OSM', maxZoom: 19 }], defaultBasemap: 'osm', parcelsMinZoom: 16, riskLayers: [] };
const base = { 'GET /api/auth/me': { status: 200, body: alice }, 'GET /api/map/layers': { status: 200, body: LAYERS } };

describe('accueil', () => {
  it('mes études : vignette, nom, commune, parcelles, surface, date ; vignette en préparation', async () => {
    fakeApi({ ...base, 'GET /api/studies': { status: 200, body: { studies: [summary(), summary({ id: COPY, name: 'Sans vignette', thumbnailUrl: null, parcelCount: 1, contenance: 0, area: 79, communeName: null })] } } });
    renderAt('/');
    const cards = within(await screen.findByRole('list', { name: 'Études' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByRole('link', { name: '2 Rue Pasteur, Maisons-Alfort (+1 parcelle)' })).toHaveAttribute('href', `/studies/${ID}`);
    expect(cards[0]).toHaveTextContent('Maisons-Alfort · 2 parcelles · 160 m²');
    expect(cards[0]).toHaveTextContent('Modifiée il y a 2 h');
    expect(cards[0]!.querySelector('img')).toHaveAttribute('src', summary().thumbnailUrl);
    expect(cards[1]).toHaveTextContent('94046 · 1 parcelle · 79 m²');
    expect(cards[1]).toHaveTextContent('Vignette en préparation');
  });

  it('recherche : envoyée après la frappe, message quand rien ne correspond', async () => {
    const calls = fakeApi({ ...base, 'GET /api/studies': (_, url) => ({ status: 200, body: { studies: url.searchParams.get('q') ? [] : [summary()] } }) });
    renderAt('/');
    await screen.findByRole('list', { name: 'Études' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher une étude' }), 'lyon');
    expect(await screen.findByText('Aucune étude ne correspond à « lyon ».')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'GET /api/studies?q=lyon')).toBe(true);
  });

  it('aucune étude : invitation à en créer une ; erreur : message et « Réessayer »', async () => {
    let fail = true;
    fakeApi({ ...base, 'GET /api/studies': () => (fail ? { status: 503, body: { message: 'Indisponible.' } } : { status: 200, body: { studies: [] } }) });
    renderAt('/');
    expect(await screen.findByText('Vos études n’ont pas pu être chargées : Indisponible.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Aucune étude pour l’instant')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Nouvelle étude' }).map((l) => l.getAttribute('href'))).toEqual(['/map', '/map', '/map']);
  });

  it('mettre à la corbeille, puis « Annuler » ; une erreur s’affiche', async () => {
    let trashed = false;
    const calls = fakeApi({
      ...base,
      'GET /api/studies': () => ({ status: 200, body: { studies: trashed ? [] : [summary()] } }),
      [`DELETE /api/studies/${ID}`]: () => {
        trashed = true;
        return { status: 204 };
      },
      [`POST /api/studies/${ID}/restore`]: () => {
        trashed = false;
        return { status: 200, body: study() };
      },
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: `Actions sur ${summary().name}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }));
    expect(await screen.findByText(`« ${summary().name} » est dans la corbeille pendant 30 jours.`)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Études' })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(await screen.findByRole('list', { name: 'Études' })).toBeInTheDocument();
    expect(screen.queryByText(/est dans la corbeille/)).toBeNull();
    expect(calls.map((c) => c.key)).toContain(`POST /api/studies/${ID}/restore`);
  });

  it('dupliquer ouvre la copie ; un échec s’affiche', async () => {
    let fail = false;
    fakeApi({
      ...base,
      'GET /api/studies': { status: 200, body: { studies: [summary()] } },
      [`POST /api/studies/${ID}/duplicate`]: () => (fail ? { status: 409, body: { message: 'Impossible.' } } : { status: 201, body: study({ id: COPY, name: 'Copie' }) }),
      [`DELETE /api/studies/${ID}`]: { status: 404, body: { message: 'Étude introuvable.' } },
      [`GET /api/studies/${COPY}`]: { status: 200, body: study({ id: COPY, name: 'Copie' }) },
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: `Actions sur ${summary().name}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Étude introuvable.');
    fail = true;
    await userEvent.click(screen.getByRole('button', { name: `Actions sur ${summary().name}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dupliquer' }));
    expect(await screen.findByText('Impossible.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: `Actions sur ${summary().name}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dupliquer' }));
    expect(await screen.findByRole('heading', { name: 'Copie' })).toBeInTheDocument();
  });
});

describe('page de l’étude', () => {
  it('fiche, carte, parcelles, étapes', async () => {
    fakeApi({ ...base, [`GET /api/studies/${ID}`]: { status: 200, body: study() } });
    renderAt(`/studies/${ID}`);
    expect(await screen.findByRole('heading', { name: study().name })).toBeInTheDocument();
    expect(screen.getByText('2 Rue Pasteur 94700 Maisons-Alfort')).toBeInTheDocument();
    expect(screen.getByTestId('study-contenance')).toHaveTextContent('160 m²');
    expect(screen.getByText('millésime 2026-09-01')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Parcelles de l’étude' })).getAllByRole('listitem')).toHaveLength(2);
    expect(await screen.findByTestId('study-map')).toHaveTextContent('94046000AB0000,94046000AB0001');
    expect(screen.getByText('à venir (L3)')).toBeInTheDocument();
    expect(screen.getByText('faite')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Modifier les parcelles' })).toHaveAttribute('href', `/studies/${ID}/map`);
    // Les étapes livrées mènent à leur écran ; les autres attendent leur lot.
    expect(screen.getByRole('link', { name: 'Risques' })).toHaveAttribute('href', `/studies/${ID}/risks`);
    expect(screen.getByRole('link', { name: 'Parcelles' })).toHaveAttribute('href', `/studies/${ID}/map`);
    expect(screen.queryByRole('link', { name: 'Urbanisme' })).toBeNull();
  });

  it('nom provisoire et calcul en cours : signalés, et relus jusqu’à la fin du calcul', async () => {
    let reads = 0;
    fakeApi({
      ...base,
      [`GET /api/studies/${ID}`]: () => {
        reads++;
        return { status: 200, body: reads < 2 ? study({ name: 'Maisons-Alfort — AB 0', nameIsProvisional: true, addressPending: true, thumbnailPending: true, address: null, addresses: [] }) : study() };
      },
    });
    renderAt(`/studies/${ID}`);
    expect(await screen.findByText('Nom provisoire : il sera proposé d’après l’adresse.')).toBeInTheDocument();
    expect(screen.getByText('Recherche de l’adresse…')).toBeInTheDocument();
    expect(screen.getByText('Calcul de l’adresse et de la vignette…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: study().name }, { timeout: 3000 })).toBeInTheDocument();
  });

  it('renommer ; un nom refusé s’affiche ; annuler', async () => {
    const calls = fakeApi({
      ...base,
      [`GET /api/studies/${ID}`]: { status: 200, body: study() },
      [`PATCH /api/studies/${ID}`]: (body) =>
        (body as { name: string }).name.trim() ? { status: 200, body: study({ name: (body as { name: string }).name }) } : { status: 400, body: { message: 'Donnez un nom à l’étude.' } },
    });
    renderAt(`/studies/${ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer l’étude' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await userEvent.click(screen.getByRole('button', { name: 'Renommer l’étude' }));
    const input = screen.getByLabelText('Nom de l’étude');
    await userEvent.clear(input);
    await userEvent.type(input, ' ');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Donnez un nom à l’étude.')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, 'Maison des fondateurs');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('heading', { name: 'Maison des fondateurs' })).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({ key: `PATCH /api/studies/${ID}`, body: { name: 'Maison des fondateurs' } });
  });

  it('changer d’adresse parmi celles trouvées ; sans adresse, le dire', async () => {
    let fail = true;
    const calls = fakeApi({
      ...base,
      [`GET /api/studies/${ID}`]: { status: 200, body: study() },
      [`PATCH /api/studies/${ID}`]: () => (fail ? { status: 400, body: { message: 'Adresse refusée.' } } : { status: 200, body: study({ address: address(4), chosenAddressId: address(4).id }) }),
    });
    renderAt(`/studies/${ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Changer d’adresse (2 trouvées)' }));
    expect(screen.getByRole('radio', { name: '2 Rue Pasteur 94700 Maisons-Alfort' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: '4 Rue Pasteur 94700 Maisons-Alfort' }));
    expect(await screen.findByText('Adresse refusée.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('radio', { name: '4 Rue Pasteur 94700 Maisons-Alfort' }));
    expect(await screen.findByText('4 Rue Pasteur 94700 Maisons-Alfort')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(calls.at(-1)?.body).toEqual({ addressId: address(4).id });
    await userEvent.click(screen.getByRole('button', { name: /Changer d’adresse/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('sans adresse trouvée ; parcelle sans contenance ; étape à faire ; fond par défaut inconnu', async () => {
    const parcels = [{ ...feature(0).properties, contenance: null, id: feature(0).id, area: 79, version: '2026-09-01', geometry: feature(0).geometry }] as Study['parcels'];
    const steps: Study['steps'] = [{ key: 'parcels', label: 'Parcelles', state: 'todo', lot: null }];
    fakeApi({
      ...base,
      'GET /api/map/layers': { status: 200, body: { ...LAYERS, defaultBasemap: 'absent' } },
      [`GET /api/studies/${ID}`]: { status: 200, body: study({ address: null, addresses: [], parcels, steps }) },
    });
    renderAt(`/studies/${ID}`);
    expect(await screen.findByText('Aucune adresse trouvée sur ces parcelles')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Parcelles de l’étude' })).getByRole('listitem')).toHaveTextContent('—');
    expect(screen.getByText('à faire')).toBeInTheDocument();
    expect(await screen.findByTestId('study-map')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Changer d’adresse/ })).toBeNull();
  });

  it('dupliquer ouvre la copie ; mettre à la corbeille ramène à l’accueil, avec « Annuler »', async () => {
    fakeApi({
      ...base,
      [`GET /api/studies/${ID}`]: { status: 200, body: study() },
      [`GET /api/studies/${COPY}`]: { status: 200, body: study({ id: COPY, name: 'Copie' }) },
      [`POST /api/studies/${ID}/duplicate`]: { status: 201, body: study({ id: COPY, name: 'Copie' }) },
      [`DELETE /api/studies/${COPY}`]: { status: 204 },
      'GET /api/studies': { status: 200, body: { studies: [summary()] } },
    });
    renderAt(`/studies/${ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Dupliquer' }));
    expect(await screen.findByRole('heading', { name: 'Copie' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mettre à la corbeille' }));
    expect(await screen.findByText('« Copie » est dans la corbeille pendant 30 jours.')).toBeInTheDocument();
  });

  it('dans la corbeille : date d’effacement, Restaurer, pas de modification ; une erreur s’affiche', async () => {
    let restored = false;
    fakeApi({
      ...base,
      [`GET /api/studies/${ID}`]: () => ({ status: 200, body: restored ? study() : study({ deletedAt: '2026-10-01T10:00:00Z', purgeAt: '2026-10-31T10:00:00Z' }) }),
      [`POST /api/studies/${ID}/restore`]: () => {
        restored = true;
        return { status: 200, body: study() };
      },
    });
    renderAt(`/studies/${ID}`);
    expect(await screen.findByText('Cette étude est dans la corbeille ; elle sera effacée le 31 octobre 2026.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renommer l’étude' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Modifier les parcelles' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Restaurer' }));
    expect(await screen.findByRole('link', { name: 'Modifier les parcelles' })).toBeInTheDocument();
  });

  it('une erreur d’action s’affiche', async () => {
    fakeApi({ ...base, [`GET /api/studies/${ID}`]: { status: 200, body: study() }, [`POST /api/studies/${ID}/duplicate`]: { status: 409, body: { message: 'Cette étude est dans la corbeille.' } } });
    renderAt(`/studies/${ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Dupliquer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette étude est dans la corbeille.');
  });

  it('introuvable', async () => {
    fakeApi({ ...base, [`GET /api/studies/${ID}`]: { status: 404, body: { message: 'Étude introuvable.' } } });
    renderAt(`/studies/${ID}`);
    expect(await screen.findByRole('heading', { name: 'Étude introuvable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mes études' })).toHaveAttribute('href', '/');
  });
});

describe('corbeille', () => {
  it('études supprimées, dates, Restaurer ; vide ; erreur', async () => {
    let restored = false;
    const trashed = summary({ deletedAt: '2026-10-01T10:00:00Z', purgeAt: '2026-10-31T10:00:00Z' });
    fakeApi({
      ...base,
      'GET /api/studies': (_, url) => ({ status: 200, body: { studies: url.searchParams.get('trash') === 'true' && !restored ? [trashed] : [] } }),
      [`POST /api/studies/${ID}/restore`]: () => {
        restored = true;
        return { status: 200, body: study() };
      },
    });
    renderAt('/studies/trash');
    const row = within(await screen.findByRole('list', { name: 'Études dans la corbeille' })).getByRole('listitem');
    expect(row).toHaveTextContent('Supprimée le 1 octobre 2026 · effacée le 31 octobre 2026');
    expect(row).toHaveTextContent('Maisons-Alfort · 2 parcelles · 160 m²');
    await userEvent.click(within(row).getByRole('button', { name: 'Restaurer' }));
    expect(await screen.findByText('La corbeille est vide.')).toBeInTheDocument();
  });

  it('erreurs de chargement et de restauration', async () => {
    fakeApi({ ...base, 'GET /api/studies': { status: 503, body: { message: 'Indisponible.' } } });
    renderAt('/studies/trash');
    expect(await screen.findByText('La corbeille n’a pas pu être chargée : Indisponible.')).toBeInTheDocument();
  });

  it('restauration refusée', async () => {
    fakeApi({
      ...base,
      'GET /api/studies': { status: 200, body: { studies: [summary({ deletedAt: '2026-10-01T10:00:00Z', purgeAt: '2026-10-31T10:00:00Z' })] } },
      [`POST /api/studies/${ID}/restore`]: { status: 404, body: { message: 'Étude introuvable.' } },
    });
    renderAt('/studies/trash');
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Étude introuvable.');
  });
});

const mapApi = {
  ...base,
  'GET /api/communes/locate': { status: 200, body: { commune: { code: '94046', name: 'Maisons-Alfort' } } },
  'GET /api/parcels/elevation': { status: 200, body: { overall: { min: 31.9, max: 32.6, mean: 32.2, range: 0.7, points: 23 }, parcels: [], source: 'IGN' } },
  'GET /api/communes/94046': { status: 200, body: { code: '94046', name: 'Maisons-Alfort', center: null, cadastre: { status: 'ready', version: '2026-09-01', loadedAt: null, parcelCount: 10, error: null } } },
  'GET /api/parcels': (_: unknown, url: URL) => {
    const all = [0, 1, 2].map(feature);
    const ids = url.searchParams.get('ids');
    return { status: 200, body: { type: 'FeatureCollection', features: ids ? all.filter((f) => ids.includes(f.id)) : all, truncated: false } };
  },
};

describe('créer une étude depuis la carte (Q1)', () => {
  it('« Créer l’étude » envoie la sélection et ouvre l’étude ; un refus s’affiche', async () => {
    let fail = true;
    const calls = fakeApi({
      ...mapApi,
      'POST /api/studies': () => (fail ? { status: 404, body: { message: 'Parcelle inconnue : 94046000AB0000.' } } : { status: 201, body: study() }),
      [`GET /api/studies/${ID}`]: { status: 200, body: study() },
    });
    renderAt('/map?at=48.8,2.43,18&parcels=94046000AB0000,94046000AB0001');
    await userEvent.click(await screen.findByRole('button', { name: 'Créer l’étude' }));
    expect(await screen.findByText('Parcelle inconnue : 94046000AB0000.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’étude' }));
    expect(await screen.findByRole('heading', { name: study().name })).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /api/studies')?.body).toEqual({ parcelIds: ['94046000AB0000', '94046000AB0001'] });
  });
});

describe('carte d’une étude (Q8)', () => {
  function studyApi(overrides: Record<string, unknown> = {}) {
    let current = study();
    const calls = fakeApi({
      ...mapApi,
      [`GET /api/studies/${ID}`]: () => ({ status: 200, body: current }),
      [`PUT /api/studies/${ID}/parcels/94046000AB0002`]: () => {
        current = study({ parcels: [...current.parcels, { ...feature(2).properties, id: feature(2).id, area: 79, version: '2026-09-01', geometry: feature(2).geometry }] as Study['parcels'] });
        return { status: 200, body: current };
      },
      [`DELETE /api/studies/${ID}/parcels/94046000AB0000`]: () => {
        current = study({ parcels: current.parcels.filter((p) => p.id !== '94046000AB0000') });
        return { status: 200, body: current };
      },
      [`DELETE /api/studies/${ID}/parcels/94046000AB0001`]: () => {
        current = study({ parcels: current.parcels.filter((p) => p.id !== '94046000AB0001') });
        return { status: 200, body: current };
      },
      ...(overrides as Record<string, never>),
    });
    return calls;
  }

  it('la sélection est celle de l’étude, cadrée sur ses parcelles ; chaque clic s’enregistre', async () => {
    const calls = studyApi();
    renderAt(`/studies/${ID}/map`);
    expect(await screen.findByRole('heading', { name: study().name })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour à l’étude' })).toHaveAttribute('href', `/studies/${ID}`);
    const list = await screen.findByRole('list', { name: 'Parcelles' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    const bounds = (JSON.parse(screen.getByTestId('map').dataset.target!) as { bounds: number[] }).bounds;
    [2.43, 48.8, 2.4302, 48.8001].forEach((v, i) => expect(bounds[i]).toBeCloseTo(v, 9));
    expect(screen.queryByRole('button', { name: 'Tout effacer' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'zoomer' }));
    await userEvent.click(await screen.findByRole('button', { name: 'parcelle AB 2' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Parcelles' })).getAllByRole('listitem')).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'parcelle AB 0' }));
    await userEvent.click(screen.getByRole('button', { name: 'Retirer la parcelle AB 1' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Parcelles' })).getAllByRole('listitem')).toHaveLength(1));
    expect(calls.map((c) => c.key).filter((k) => !k.startsWith('GET'))).toEqual([
      `PUT /api/studies/${ID}/parcels/94046000AB0002`,
      `DELETE /api/studies/${ID}/parcels/94046000AB0000`,
      `DELETE /api/studies/${ID}/parcels/94046000AB0001`,
    ]);
    // La dernière parcelle reste : refus affiché, sans appel.
    await userEvent.click(screen.getByRole('button', { name: 'parcelle AB 2' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Une étude garde au moins une parcelle.');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le message' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Chaque clic est enregistré.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terminer' })).toHaveAttribute('href', `/studies/${ID}`);
  });

  it('plafond : une étude de 50 parcelles n’en prend pas une de plus, sans appel', async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => feature(i + 10)).map((f) => ({ ...f.properties, id: f.id, area: 79, version: '2026-09-01', geometry: f.geometry }));
    const calls = studyApi({ [`GET /api/studies/${ID}`]: { status: 200, body: study({ parcels: fifty as Study['parcels'] }) } });
    renderAt(`/studies/${ID}/map?at=48.8,2.43,18`);
    await screen.findByRole('list', { name: 'Parcelles' });
    await userEvent.click(screen.getByRole('button', { name: 'zoomer' }));
    await userEvent.click(await screen.findByRole('button', { name: 'parcelle AB 2' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Une sélection compte au plus 50 parcelles.');
    expect(calls.some((c) => c.key.startsWith('PUT'))).toBe(false);
  });

  it('un clic refusé par le serveur est annulé à l’écran, avec le message', async () => {
    studyApi({ [`PUT /api/studies/${ID}/parcels/94046000AB0002`]: { status: 400, body: { message: 'Une étude compte au plus 50 parcelles.' } } });
    renderAt(`/studies/${ID}/map?at=48.8,2.43,18`);
    await screen.findByRole('list', { name: 'Parcelles' });
    await userEvent.click(screen.getByRole('button', { name: 'zoomer' }));
    await userEvent.click(await screen.findByRole('button', { name: 'parcelle AB 2' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Une étude compte au plus 50 parcelles.');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Parcelles' })).getAllByRole('listitem')).toHaveLength(2));
    // Ouverte avec une position (`at=`) : la carte n'est pas recadrée.
    expect(screen.getByTestId('map').dataset.target).toBe('null');
  });
});
