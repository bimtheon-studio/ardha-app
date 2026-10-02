// Page Foncier et marché d'une étude (F-05) contre une fausse API ; la carte Leaflet est remplacée par
// un double qui expose ses propriétés.
import type { MarketSale, Study, StudyMarket } from '@contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PriceChart, ticks } from '@/components/PriceChart';
import { alice, fakeApi, renderAt } from '@/test/helpers';

type MapProps = { sales: MarketSale[]; selectedId: string | null; radiusM: number; onSelect: (id: string) => void; color: (s: MarketSale) => string; label: (s: MarketSale) => string };
let mapProps: MapProps | undefined;
vi.mock('@/map/leaflet/MarketMap', () => ({
  default: (props: MapProps) => {
    mapProps = props;
    return <div data-testid="market-map">{props.sales.length}</div>;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  mapProps = undefined;
});

const ID = '01a0f885-0000-7000-8000-000000000002';
const ok = <T,>(data: T) => ({ status: 'ok' as const, data });
const off = { status: 'unavailable' as const, error: 'HTTP 503' };
const nbsp = (s: string | null) => (s ?? '').replace(/\u202f/g, ' ');

const study: Study = {
  id: ID,
  name: '6 Rue Pasteur, Maisons-Alfort (+1 parcelle)',
  communeCode: '94046',
  communeName: 'Maisons-Alfort',
  addressLabel: null,
  parcelCount: 1,
  contenance: 240,
  area: 240,
  thumbnailUrl: null,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  deletedAt: null,
  purgeAt: null,
  marketRadiusM: 500,
  parcels: [],
  address: null,
  addresses: [],
  chosenAddressId: null,
  nameIsProvisional: false,
  addressPending: false,
  thumbnailPending: false,
  steps: [],
};

const summary = (median: number, count: number) => ({ count, median, p25: median - 500, p75: median + 500 });
type Result = NonNullable<StudyMarket['result']>;
const result: Result = {
  version: 1,
  center: [2.43, 48.8],
  radiusM: 500,
  covered: true,
  dvf: ok({
    departments: [{ code: '94', years: [{ year: 2025, modifiedAt: '2026-05-18T13:14:15.000Z' }] }],
    from: '2024-01-12',
    horizon: '2025-12-31',
    saleCount: 331,
    comparableCount: 276,
    indicators: [
      { category: 'house', segment: 'existing', current: summary(6056, 11), previous: summary(6100, 5), trendPct: -0.6, lowSample: true },
      { category: 'house', segment: 'new', current: null, previous: null, trendPct: null, lowSample: true },
      { category: 'apartment', segment: 'existing', current: summary(5465, 131), previous: summary(5540, 116), trendPct: -1.3, lowSample: false },
      { category: 'apartment', segment: 'new', current: summary(7131, 1), previous: null, trendPct: null, lowSample: true },
      { category: 'land', segment: 'existing', current: summary(1068, 1), previous: null, trendPct: 2, lowSample: true },
      { category: 'land', segment: 'new', current: null, previous: null, trendPct: null, lowSample: true },
    ],
    history: {
      year: [
        { period: '2024', category: 'apartment', segment: 'existing', count: 116, median: 5539 },
        { period: '2025', category: 'apartment', segment: 'existing', count: 131, median: 5465 },
        { period: '2025', category: 'house', segment: 'existing', count: 11, median: 6056 },
      ],
      quarter: [{ period: '2025-T4', category: 'apartment', segment: 'existing', count: 30, median: 5400 }],
    },
    communes: [{ code: '94046', name: 'Maisons-Alfort', sales: 331 }],
  }),
  newBuild: ok({
    department: '94',
    quarters: [
      { quarter: '2026-T2', housingType: 'collective', pricePerM2: 5739, averagePrice: null, reservations: 957, listed: 740, stock: 6399, monthsToSell: 7 },
      { quarter: '2026-T2', housingType: 'individual', pricePerM2: 6476, averagePrice: 740_855, reservations: 5, listed: 10, stock: 46, monthsToSell: 8.4 },
      { quarter: '2026-T2', housingType: 'all', pricePerM2: 5747, averagePrice: null, reservations: 962, listed: 750, stock: 6445, monthsToSell: 7 },
      { quarter: '2026-T1', housingType: 'collective', pricePerM2: null, averagePrice: null, reservations: null, listed: null, stock: null, monthsToSell: null },
      { quarter: '2026-T1', housingType: 'individual', pricePerM2: 5841, averagePrice: null, reservations: 6, listed: 1, stock: 3, monthsToSell: null },
      { quarter: '2025-T4', housingType: 'individual', pricePerM2: null, averagePrice: null, reservations: 11, listed: 1, stock: 3, monthsToSell: 6.4 },
    ],
  }),
  permits: ok({
    communeCode: '94046',
    communeName: 'Maisons-Alfort',
    asOf: '2026-10-02T10:00:00.000Z',
    rows: [
      { year: 2025, housingType: 'all', authorizedUnits: 95, startedUnits: null, authorizedArea: 7775, startedArea: null },
      { year: 2025, housingType: 'collective', authorizedUnits: 83, startedUnits: null, authorizedArea: 6241, startedArea: null },
      { year: 2025, housingType: 'residence', authorizedUnits: 0, startedUnits: null, authorizedArea: 0, startedArea: null },
      { year: 2024, housingType: 'new-kind', authorizedUnits: 2, startedUnits: 1, authorizedArea: 100, startedArea: 50 },
    ],
  }),
  indices: ok([
    { id: '000008630', label: 'Indice du coût de la construction (ICC)', kind: 'construction', propertyType: null, last: { period: '2026-Q2', value: 2103 }, yearChangePct: 0.8 },
    { id: '001710986', label: 'Index du bâtiment BT01', kind: 'construction', propertyType: null, last: { period: '2026-07', value: 138.9 }, yearChangePct: null },
  ]),
};
type DvfData = Extract<Result['dvf'], { status: 'ok' }>['data'];
const dvfData = (result.dvf as { data: DvfData }).data;
const progress: StudyMarket['progress'] = [
  { key: 'area', label: 'Départements du cercle', state: 'done', detail: 'Département 94, dans 500 m', startedAt: '2026-10-02T10:00:00.000Z', finishedAt: '2026-10-02T10:00:00.200Z' },
  { key: 'dvf', label: 'Ventes DVF (DGFiP, Etalab)', state: 'running', detail: null, startedAt: '2026-10-02T10:00:00.200Z', finishedAt: null },
  { key: 'prices', label: 'Prix des ventes comparables', state: 'pending', detail: null, startedAt: null, finishedAt: null },
];
const sources: StudyMarket['sources'] = [{ key: 'dvf', label: 'Demandes de valeurs foncières', url: 'https://dvf', licence: 'Licence ouverte 2.0' }];
const done = progress.map((p) => ({ ...p, state: p.key === 'prices' ? ('unavailable' as const) : ('done' as const) }));
const ready: StudyMarket = { status: 'ready', radiusM: 500, stale: false, newerData: false, requestedAt: '2026-10-02T10:00:00Z', computedAt: '2026-10-02T10:01:00Z', error: null, result, sources, progress: done };
const none: StudyMarket = { status: 'none', radiusM: 500, stale: false, newerData: false, requestedAt: null, computedAt: null, error: null, result: null, sources, progress: [] };

const sale = (i: number, over: Partial<MarketSale> = {}): MarketSale => ({
  id: `2025-${i}`,
  date: `2025-12-${String(28 - i).padStart(2, '0')}`,
  nature: 'Vente',
  vefa: false,
  price: 300_000 + i,
  propertyType: 'apartment',
  category: 'apartment',
  pricePerM2: 5000 + i * 10,
  builtArea: 60,
  landArea: null,
  rooms: 3,
  dwellingCount: 1,
  address: `${i} RUE MARCEAU`,
  postcode: '94700',
  communeCode: '94046',
  position: [2.43, 48.8],
  distanceM: 400 - i,
  parcels: [],
  parcelIds: [],
  ...over,
});
const sales = [
  sale(1, { parcels: [{ id: '94046000AY0096', geometry: { type: 'MultiPolygon', coordinates: [] } }] }),
  sale(2, { propertyType: 'house', category: 'house', vefa: true, dwellingCount: 2, rooms: null, address: null }),
  sale(3, { propertyType: 'land', category: 'land', builtArea: null, landArea: 600, pricePerM2: 1068, rooms: null }),
  sale(4, { propertyType: 'outbuilding', category: null, builtArea: null, pricePerM2: null, rooms: null }),
  ...Array.from({ length: 60 }, (_, i) => sale(5 + i, { date: '2024-06-01' })),
];
const LAYERS = { basemaps: [{ id: 'osm', label: 'OSM', url: 'https://osm/{z}/{x}/{y}', attribution: 'OSM', maxZoom: 19 }], defaultBasemap: 'osm', parcelsMinZoom: 16, riskLayers: [] };

function api(routes: Record<string, unknown>, s: Study = study) {
  return fakeApi({
    'GET /api/auth/me': { status: 200, body: alice },
    'GET /api/map/layers': { status: 200, body: LAYERS },
    [`GET /api/studies/${ID}`]: { status: 200, body: s },
    [`GET /api/studies/${ID}/market/sales`]: { status: 200, body: { center: [2.43, 48.8], radiusM: 500, sales, truncated: false } },
    ...(routes as Record<string, never>),
  });
}

describe('page Foncier et marché', () => {
  it('jamais analysée : l’analyse se demande d’elle-même, puis prix, historique, neuf, Sitadel, indices', async () => {
    let state: StudyMarket = none;
    const calls = api({
      [`GET /api/studies/${ID}/market`]: () => ({ status: 200, body: state }),
      [`POST /api/studies/${ID}/market`]: () => {
        state = ready;
        return { status: 202, body: { ...none, status: 'running', progress } };
      },
    });
    renderAt(`/studies/${ID}/market`);
    expect(await screen.findByText('Analyse en cours…')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Calcul en cours' })).getByTestId('step-count')).toHaveTextContent('2 / 3');
    expect(calls.find((c) => c.key === `POST /api/studies/${ID}/market`)?.body).toEqual({ force: false });

    const prices = await screen.findByRole('region', { name: 'Prix au m²' }, { timeout: 3000 });
    expect(nbsp(prices.textContent)).toContain('jusqu’au 31/12/2025, dans 500 m : 276 ventes comparables sur 331');
    const apartment = within(prices).getByText('Appartements').closest('li')!;
    expect(nbsp(apartment.textContent)).toContain('Ancien5 465 €/m²');
    expect(nbsp(apartment.textContent)).toContain('-1,3 % sur un an');
    expect(nbsp(apartment.textContent)).toContain('Neuf (VEFA)7 131 €/m²');
    const house = within(prices).getByText('Maisons').closest('li')!;
    expect(house).toHaveTextContent('Peu de ventes');
    expect(house).toHaveTextContent('Neuf (VEFA) : aucune vente sur 12 mois');
    const land = within(prices).getByText('Terrains à bâtir').closest('li')!;
    expect(nbsp(land.textContent)).toContain('Prix du terrain1 068 €/m²');
    expect(land).toHaveTextContent('+2 % sur un an');
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByText('Analyse du 2 octobre 2026')).toBeInTheDocument();

    const history = screen.getByRole('region', { name: 'Historique' });
    expect(within(history).getByRole('img', { name: 'Prix médian au m² par année' })).toBeInTheDocument();
    expect(history).toHaveTextContent('Appartements anciensMaisons anciennes');
    await userEvent.click(within(history).getByRole('button', { name: 'Par trimestre' }));
    expect(within(history).getByRole('img', { name: 'Prix médian au m² par trimestre' })).toBeInTheDocument();
    expect(within(history).getByRole('table')).toHaveTextContent('2025-T4');

    const newBuild = screen.getByRole('region', { name: 'Neuf' });
    expect(nbsp(newBuild.textContent)).toContain('Appartements : 7 131 €/m² (1 vente) · +30,5 % sur l’ancien');
    const rows = within(newBuild).getAllByRole('row').map((r) => nbsp(r.textContent));
    expect(rows.slice(1)).toEqual([
      '2026-T2Collectif5 739 €/m²9577 mois',
      '2026-T2Individuel740 855 €58,4 mois',
      '2026-T1Collectif———',
      '2026-T1Individuel5 841 €/m²6—',
      '2025-T4Individuel—116,4 mois',
    ]);

    const permits = screen.getByRole('region', { name: 'Logements autorisés (Sitadel)' });
    expect(permits).toHaveTextContent('Maisons-Alfort · données du 2 octobre 2026');
    expect(within(permits).getAllByRole('row').map((r) => r.textContent)).toEqual(['AnnéeAutorisésCommencésDont autorisés', '202595—83 collectif', '2024——2 new-kind']);

    const indices = screen.getByRole('region', { name: 'Indices INSEE' });
    expect(nbsp(indices.textContent)).toContain('Indice du coût de la construction (ICC)2 103 (2026-Q2)+0,8 % sur un an');
    expect(indices).toHaveTextContent('138,9 (2026-07)');
    expect(screen.getByText(/Déroulé de l’analyse \(3 étapes, dont certaines sans réponse\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Demandes de valeurs foncières' })).toHaveAttribute('href', 'https://dvf');
  });

  it('ventes : carte, échelle, liste, choix d’une vente, filtres, ordre, suite de la liste', async () => {
    const calls = api({ [`GET /api/studies/${ID}/market`]: { status: 200, body: ready } });
    renderAt(`/studies/${ID}/market`);
    const list = await screen.findByRole('list', { name: 'Ventes' });
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(50));
    expect(screen.getByText('64 ventes dans 500 m · parcelles vendues en couleur sur la carte')).toBeInTheDocument();
    const [first, second, third, fourth] = within(list).getAllByRole('button').map((b) => nbsp(b.textContent));
    expect(first).toBe('Appartement300 001 €27/12/2025 · 399 m · 60 m² · 3 p.5 010 €/m²1 RUE MARCEAU');
    expect(second).toBe('Maisonneuf (VEFA)2 logements300 002 €26/12/2025 · 398 m · 60 m²5 020 €/m²');
    expect(third).toContain('600 m² de terrain');
    expect(fourth).toContain('hors prix');
    expect(screen.getByLabelText('Échelle des prix au m²')).toBeInTheDocument();
    expect(mapProps!.sales).toHaveLength(64);
    expect(mapProps!.color(sales[3]!)).toBe('#8A8F98');
    expect(mapProps!.color(sales[0]!)).toMatch(/^rgb\(/);
    expect(nbsp(mapProps!.label(sales[1]!))).toBe('Maison neuf · 300 002 € · 5 020 €/m² · 26/12/2025');
    expect(nbsp(mapProps!.label(sales[3]!))).toBe('Dépendance · 300 004 € · 24/12/2025');

    await userEvent.click(within(list).getAllByRole('button')[2]!);
    expect(mapProps!.selectedId).toBe('2025-3');
    expect(within(list).getAllByRole('button')[2]).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Voir 14 ventes de plus' }));
    expect(within(list).getAllByRole('button')).toHaveLength(64);

    await userEvent.selectOptions(screen.getByLabelText('Ordre'), 'distance');
    expect(within(list).getAllByRole('button')[0]).toHaveTextContent('64 RUE MARCEAU');

    await userEvent.selectOptions(screen.getByLabelText('Type de bien'), 'house');
    await userEvent.selectOptions(screen.getByLabelText('Ancien ou neuf'), 'new');
    const year = new Date().getFullYear() - 1;
    await userEvent.selectOptions(screen.getByLabelText('Période'), String(year));
    await waitFor(() => expect(calls.map((c) => c.key)).toContain(`GET /api/studies/${ID}/market/sales?type=house&segment=new&from=${year}`));
    await userEvent.selectOptions(screen.getByLabelText('Période'), '');
    await waitFor(() => expect(calls.at(-1)!.key).toBe(`GET /api/studies/${ID}/market/sales?type=house&segment=new`));
  });

  it('peu de ventes : élargir le rayon ; changer le rayon ; recalculer ; ventes tronquées ou illisibles', async () => {
    const few: Result = { ...result, dvf: ok({ ...dvfData, indicators: dvfData.indicators.map((i) => ({ ...i, lowSample: true })) }) };
    let body: StudyMarket = { ...ready, result: few };
    const calls = api({
      [`GET /api/studies/${ID}/market`]: () => ({ status: 200, body }),
      [`POST /api/studies/${ID}/market`]: (b: unknown) => {
        body = { ...ready, radiusM: ((b as { radiusM?: 500 | 1000 }).radiusM ?? 500) as 500 };
        return { status: 202, body };
      },
      [`GET /api/studies/${ID}/market/sales`]: { status: 200, body: { center: [2.43, 48.8], radiusM: 500, sales: sales.slice(0, 2), truncated: true } },
    });
    renderAt(`/studies/${ID}/market`);
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('Moins de 20 ventes de logements anciens');
    expect(await screen.findByText('Les 2 ventes les plus récentes dans 500 m · parcelles vendues en couleur sur la carte')).toBeInTheDocument();
    await userEvent.click(within(note).getByRole('button', { name: 'Élargir à 1 km' }));
    await waitFor(() => expect(calls.find((c) => c.key === `POST /api/studies/${ID}/market`)?.body).toEqual({ force: false, radiusM: 1000 }));
    await waitFor(() => expect(screen.getByRole('button', { name: '1 km' })).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.click(screen.getByRole('button', { name: '2 km' }));
    await waitFor(() => expect(calls.filter((c) => c.key === `POST /api/studies/${ID}/market`).at(-1)?.body).toEqual({ force: false, radiusM: 2000 }));
    await userEvent.click(screen.getByRole('button', { name: /Recalculer/ }));
    await waitFor(() => expect(calls.filter((c) => c.key === `POST /api/studies/${ID}/market`).at(-1)?.body).toEqual({ force: true }));
  });

  it('au plus grand rayon, pas d’élargissement ; ventes illisibles', async () => {
    const few: Result = { ...result, radiusM: 2000, dvf: ok({ ...dvfData, comparableCount: 1, indicators: [{ category: 'apartment', segment: 'existing', current: summary(5000, 1), previous: null, trendPct: 0, lowSample: true }] }) };
    api({
      [`GET /api/studies/${ID}/market`]: { status: 200, body: { ...ready, radiusM: 2000, result: few } },
      [`GET /api/studies/${ID}/market/sales`]: { status: 500, body: { message: 'Erreur' } },
    });
    renderAt(`/studies/${ID}/market`);
    const note = await screen.findByRole('note');
    expect(within(note).queryByRole('button')).toBeNull();
    expect(screen.getByRole('region', { name: 'Prix au m²' })).toHaveTextContent('1 vente comparable sur 331');
    expect(screen.getByRole('region', { name: 'Prix au m²' })).toHaveTextContent('0 % sur un an');
    expect(await screen.findByText('Les ventes n’ont pas pu être lues.')).toBeInTheDocument();
  });

  it('périmée, données plus récentes, hors DVF, sources muettes', async () => {
    const outside: Result = { ...result, covered: false, dvf: off, newBuild: off, permits: off, indices: off };
    let body: StudyMarket = { ...ready, stale: true, result: outside };
    const calls = api({
      [`GET /api/studies/${ID}/market`]: () => ({ status: 200, body }),
      [`POST /api/studies/${ID}/market`]: () => ({ status: 202, body: { ...ready, status: 'queued', progress: [] } }),
    });
    const view = renderAt(`/studies/${ID}/market`);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Les parcelles ou le rayon ont changé');
    expect(screen.getByRole('region', { name: 'Prix au m²' })).toHaveTextContent('DVF ne couvre pas l’Alsace-Moselle ni Mayotte');
    expect(screen.queryByRole('region', { name: 'Historique' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Neuf' })).toHaveTextContent('Aucune vente d’appartement en VEFA sur 12 mois.');
    expect(screen.getAllByText('Indisponible (source muette) : à vérifier')).toHaveLength(3);
    await userEvent.click(within(alert).getByRole('button', { name: 'Recalculer' }));
    await waitFor(() => expect(calls.filter((c) => c.key === `POST /api/studies/${ID}/market`).at(-1)?.body).toEqual({ force: false }));
    expect(await screen.findByText('Préparation du calcul…')).toBeInTheDocument();
    view.unmount();

    body = { ...ready, newerData: true, result: { ...result, dvf: off, newBuild: ok({ department: '971', quarters: [] }), permits: ok({ communeCode: '97101', communeName: null, asOf: '2026-10-02T10:00:00.000Z', rows: [] }) } };
    renderAt(`/studies/${ID}/market`);
    const newer = await screen.findByRole('alert');
    expect(newer).toHaveTextContent('Des ventes DVF plus récentes sont en base');
    expect(screen.getByRole('region', { name: 'Neuf' })).toHaveTextContent('Pas de chiffres publiés pour ce département.');
    expect(screen.getByRole('region', { name: 'Logements autorisés (Sitadel)' })).toHaveTextContent('Aucun logement autorisé publié pour la commune.');
    await userEvent.click(within(newer).getByRole('button', { name: 'Recalculer' }));
    await waitFor(() => expect(calls.filter((c) => c.key === `POST /api/studies/${ID}/market`).at(-1)?.body).toEqual({ force: true }));
  });

  it('en échec ; dans la corbeille, rien ne se demande ; étude introuvable', async () => {
    api({ [`GET /api/studies/${ID}/market`]: { status: 200, body: { ...none, status: 'failed', error: 'L’analyse de marché a échoué.' } } }, { ...study, deletedAt: '2026-10-02T10:00:00Z' });
    const view = renderAt(`/studies/${ID}/market`);
    expect(await screen.findByText('L’analyse de marché a échoué.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recalculer/ })).toBeNull();
    expect(screen.getByRole('button', { name: '500 m' })).toBeDisabled();
    view.unmount();

    api({ [`GET /api/studies/${ID}/market`]: { status: 200, body: none } }, { ...study, deletedAt: '2026-10-02T10:00:00Z' });
    const second = renderAt(`/studies/${ID}/market`);
    expect(await screen.findByText('Aucune analyse pour l’instant.')).toBeInTheDocument();
    expect(screen.getByText('Analyse pas encore faite')).toBeInTheDocument();
    second.unmount();

    api({ [`GET /api/studies/${ID}/market`]: { status: 404, body: { message: 'Étude introuvable.' } } });
    renderAt(`/studies/${ID}/market`);
    expect(await screen.findByRole('heading', { name: 'Étude introuvable' })).toBeInTheDocument();
  });

  it('le lien de l’étape Foncier et marché mène à la page', async () => {
    api({ [`GET /api/studies/${ID}/thumbnail`]: { status: 404 } }, { ...study, steps: [{ key: 'land', label: 'Foncier et marché', state: 'todo', lot: null }] });
    renderAt(`/studies/${ID}`);
    expect(await screen.findByRole('link', { name: 'Foncier et marché' })).toHaveAttribute('href', `/studies/${ID}/market`);
  });
});

describe('graduations du graphique', () => {
  it('pas rond, couvrant les valeurs ; une seule valeur', () => {
    expect(ticks(4800, 7300)).toEqual([4000, 5000, 6000, 7000, 8000]);
    expect(ticks(5100, 5900)).toEqual([5000, 5200, 5400, 5600, 5800, 6000]);
    expect(ticks(100, 100)).toEqual([100]);
  });
});

describe('graphique de l’historique', () => {
  const series = [{ key: 'a', label: 'Appartements', color: '#000', match: (p: { category: string }) => p.category === 'apartment' }];
  const point = (period: string, median: number) => ({ period, category: 'apartment' as const, segment: 'existing' as const, count: 4, median });

  it('sans point : un message ; un seul point : centré ; beaucoup de trimestres : une étiquette sur deux', () => {
    const empty = render(<PriceChart points={[]} series={series} title="Vide" />);
    expect(empty.container).toHaveTextContent('Pas assez de ventes pour un historique.');
    empty.unmount();
    const single = render(<PriceChart points={[point('2025', 5000)]} series={series} title="Un point" />);
    expect(single.container.querySelector('circle')).toHaveAttribute('cx', '320');
    single.unmount();
    const quarters = Array.from({ length: 12 }, (_, i) => point(`${2023 + Math.floor(i / 4)}-T${(i % 4) + 1}`, 5000 + i * 10));
    const many = render(<PriceChart points={quarters} series={series} title="Trimestres" />);
    expect([...many.container.querySelectorAll('svg > text')].map((t) => t.textContent)).toEqual(['2023-T1', '2023-T3', '2024-T1', '2024-T3', '2025-T1', '2025-T3', '2025-T4']);
    expect(many.getByRole('table')).toHaveTextContent('2025-T4');
  });
});

