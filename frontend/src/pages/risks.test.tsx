// Page des risques d'une étude (F-04) contre une fausse API ; la carte Leaflet est remplacée par un double.
import type { Study, StudyRisks } from '@contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { alice, fakeApi, renderAt } from '@/test/helpers';

let mapProps: { layers: { id: string }[]; hydrants: { id: string; label: string }[]; cavities: { id: string }[] } | undefined;
vi.mock('@/map/leaflet/RiskMap', () => ({
  default: (props: NonNullable<typeof mapProps>) => {
    mapProps = props;
    return <div data-testid="risk-map">{props.layers.map((l) => l.id).join(',')}</div>;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  mapProps = undefined;
});

const ID = '01a0f885-0000-7000-8000-000000000001';
const ok = <T,>(data: T) => ({ status: 'ok' as const, data });
const off = { status: 'unavailable' as const, error: 'HTTP 503' };

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
  parcels: [
    {
      id: '94046000AY0096',
      communeCode: '94046',
      prefix: '000',
      section: 'AY',
      number: '0096',
      label: 'AY 96',
      contenance: 240,
      area: 240,
      version: '2026-09-01',
      geometry: { type: 'Polygon', coordinates: [[[2.4297, 48.7999], [2.43, 48.7999], [2.43, 48.8001], [2.4297, 48.7999]]] },
    },
  ],
  address: null,
  addresses: [],
  chosenAddressId: null,
  nameIsProvisional: false,
  addressPending: false,
  thumbnailPending: false,
  steps: [],
};

const result: NonNullable<StudyRisks['result']> = {
  version: 3,
  center: [2.43, 48.8],
  radii: { nearbyM: 500, hydrantsM: 400 },
  communes: [
    {
      code: '94046',
      name: 'Maisons-Alfort',
      asOf: '2026-09-25T08:00:00.000Z',
      radon: ok(1),
      seismic: ok(1),
      hazards: ok([{ code: '11', label: 'Inondation' }]),
      plans: ok([
        {
          id: '94DDT20090002',
          kind: 'PPRN',
          label: 'PPRI Marne et Seine',
          model: 'PPRN-I',
          modifiedAt: '27/02/2025',
          flood: true,
          zones: [{ code: 'ZR', label: 'Interdiction', name: 'zone rouge de grand écoulement' }],
          url: 'https://www.georisques.gouv.fr/risques/plans-prevention-risques/donnees#/dossier/94DDT20090002',
          state: 'approved',
          approvedAt: '12/11/2007',
          prescribedAt: '04/04/2003',
          hazards: ['Inondation'],
          prefectureUrl: 'https://www.val-de-marne.gouv.fr/ppr',
        },
        { id: 'P2', kind: 'PPRT', label: 'PPRT dépôt', model: null, modifiedAt: null, flood: false, zones: [], url: 'u', state: 'prescribed', approvedAt: null, prescribedAt: '01/01/2020', hazards: [], prefectureUrl: null },
        { id: 'P3', kind: 'PPRM', label: 'PPRM ancien', model: null, modifiedAt: null, flood: false, zones: [], url: 'u3', state: 'repealed', approvedAt: '01/01/1990', prescribedAt: null, hazards: [], prefectureUrl: null },
        { id: 'P4', kind: 'PPRN', label: 'PPR v1', model: null, modifiedAt: null, flood: false, zones: [], url: 'u4', state: null, approvedAt: null, prescribedAt: null, hazards: [], prefectureUrl: null },
      ]),
      catnat: ok({ count: 9, truncated: false, latest: [{ id: 'X', label: 'Inondations et/ou Coulées de Boue', start: '15/01/2018', published: null }] }),
    },
    { code: '94080', name: null, asOf: null, radon: off, seismic: off, hazards: ok([]), plans: ok([]), catnat: ok({ count: 0, truncated: false, latest: [] }) },
  ],
  parcels: [
    {
      id: '94046000AY0096',
      label: 'AY 96',
      point: [2.4298, 48.8],
      clay: ok('moyen'),
      flood: ok({
        hazard: 'moyen',
        scenarios: [
          { type: '01', scenario: '02MOY', heightMin: 2, heightMax: 10 },
          { type: '03', scenario: '04FAI', heightMin: 0.5, heightMax: 1 },
        ],
        reference: { height: 2, atLeast: true },
      }),
      elevation: ok({ min: 32.14, max: 32.55, mean: 32.31, range: 0.41, points: 11 }),
      floodLevel: { level: 34.31, atLeast: true },
    },
    { id: '94046000AY0097', label: 'AY 97', point: [2.43, 48.8], clay: off, flood: ok({ hazard: null, scenarios: [], reference: null }), elevation: ok(null), floodLevel: null },
  ],
  cavities: ok({ truncated: false, items: [{ id: 'C1', name: 'Carrière', type: 'naturelle', point: [2.43, 48.8], distanceM: 1500 }] }),
  installations: ok({ truncated: false, items: [{ id: '1', name: 'BIO SPRINGER', regime: 'Autorisation', seveso: 'Seveso seuil bas', point: [2.43, 48.8], distanceM: 392 }] }),
  pollutedSites: ok({ truncated: false, items: [{ id: 'S', kind: 'CASIAS', name: 'Ancien garage', url: 'https://fiche', distanceM: 330 }, { id: 'S2', kind: 'SIS', name: null, url: null, distanceM: 900 }] }),
  hydrants: ok({ asOf: '2026-09-20T00:00:00.000Z', items: [{ id: 'node/1', point: [2.43, 48.8], type: 'pillar', flowRate: null, diameter: null, ref: null, distanceM: 111 }] }),
};

const axes: StudyRisks['axes'] = [
  { key: 'flood', label: 'Inondation', state: 'Aléa moyen', severity: 'medium', detail: 'Parcelle en zone inondable' },
  { key: 'clay', label: 'Retrait-gonflement des argiles', state: 'Source indisponible : à vérifier', severity: 'unknown', detail: null },
];
const sources: StudyRisks['sources'] = [{ key: 'georisques', label: 'Géorisques', url: 'https://www.georisques.gouv.fr', licence: 'Licence ouverte 2.0' }];
const surcharges: StudyRisks['surcharges'] = [
  { key: 'flood', label: 'Adaptation à l’inondation', perM2: 150, basis: 'Parcelle en zone inondable (TRI), aléa moyen', source: 'Forfait non sourcé', sourced: false },
  { key: 'seismic', label: 'Dispositions parasismiques', perM2: 27, basis: 'Zone 3', source: 'Eurocode 8', sourced: true },
];
const progress: StudyRisks['progress'] = [
  { key: 'commune-94046', label: 'Risques de la commune : Maisons-Alfort (Géorisques)', state: 'done', detail: 'radon 1 · 3 PPR', startedAt: '2026-10-01T10:00:00.000Z', finishedAt: '2026-10-01T10:00:01.200Z' },
  { key: 'parcel-AY96', label: 'Argiles et hauteurs d’eau, parcelle AY 96', state: 'partial', detail: 'argiles moyen · sans réponse : hauteurs d’eau', startedAt: null, finishedAt: null },
  { key: 'cavities', label: 'Cavités à moins de 500 m', state: 'unavailable', detail: 'sources muettes : cavités', startedAt: null, finishedAt: null },
  { key: 'elevation', label: 'Altitudes de 23 points (IGN)', state: 'running', detail: null, startedAt: '2026-10-01T10:00:01.200Z', finishedAt: null },
  { key: 'hydrants', label: 'Bornes incendie à moins de 400 m', state: 'pending', detail: null, startedAt: null, finishedAt: null },
];
const finished = progress.map((p) => (p.state === 'running' || p.state === 'pending' ? { ...p, state: 'done' as const } : p));
const ready: StudyRisks = { status: 'ready', stale: false, requestedAt: '2026-10-01T10:00:00Z', computedAt: '2026-10-01T10:01:00Z', error: null, result, axes, surcharges, sources, progress: finished };
const none: StudyRisks = { status: 'none', stale: false, requestedAt: null, computedAt: null, error: null, result: null, axes: null, surcharges: null, sources, progress: [] };
const LAYERS = {
  basemaps: [{ id: 'osm', label: 'OSM', url: 'https://osm/{z}/{x}/{y}', attribution: 'OSM', maxZoom: 19 }],
  defaultBasemap: 'absent',
  parcelsMinZoom: 16,
  riskLayers: [
    { id: 'ppr-flood', label: 'Zonage des PPR inondation', url: 'https://wms', layers: 'PPRN_ZONE_INOND', attribution: 'G' },
    { id: 'clay', label: 'Retrait-gonflement des argiles', url: 'https://wms', layers: 'ALEARG_REALISE', attribution: 'G' },
  ],
};

function api(routes: Record<string, unknown>) {
  return fakeApi({
    'GET /api/auth/me': { status: 200, body: alice },
    'GET /api/map/layers': { status: 200, body: LAYERS },
    [`GET /api/studies/${ID}`]: { status: 200, body: study },
    ...(routes as Record<string, never>),
  });
}

describe('page des risques', () => {
  it('jamais analysée : l’analyse se demande d’elle-même, puis tout s’affiche', async () => {
    let state: StudyRisks = none;
    const calls = api({
      [`GET /api/studies/${ID}/risks`]: () => ({ status: 200, body: state }),
      [`POST /api/studies/${ID}/risks`]: () => {
        state = ready;
        return { status: 202, body: { ...none, status: 'running', progress } };
      },
    });
    renderAt(`/studies/${ID}/risks`);
    expect(await screen.findByText('Analyse en cours…')).toBeInTheDocument();
    // Pendant le calcul : en compact, l'étape courante, la dernière trouvaille et l'avancement ;
    // le détail se déplie.
    const compact = screen.getByRole('region', { name: 'Calcul en cours' });
    expect(await within(compact).findByTestId('step-count')).toHaveTextContent('4 / 5');
    expect(compact).toHaveTextContent('Altitudes de 23 points (IGN)');
    expect(screen.getByTestId('last-step')).toHaveTextContent('Risques de la commune : Maisons-Alfort : radon 1 · 3 PPR');
    expect(screen.getByRole('progressbar', { name: 'Avancement du calcul' })).toHaveAttribute('aria-valuenow', '3');
    expect(screen.queryByRole('list', { name: 'Déroulé de l’analyse' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 5 étapes' }));
    const live = screen.getByRole('list', { name: 'Déroulé de l’analyse' });
    expect(within(live).getAllByRole('listitem').map((li) => li.dataset.state)).toEqual(['done', 'partial', 'unavailable', 'running', 'pending']);
    expect(live).toHaveTextContent('radon 1 · 3 PPR');
    expect(live).toHaveTextContent('1,2 s');
    expect(live).toHaveTextContent('(en cours)');
    expect(calls.find((c) => c.key === `POST /api/studies/${ID}/risks`)?.body).toEqual({ force: false });

    const synthesis = await screen.findByRole('region', { name: 'Synthèse' }, { timeout: 3000 });
    expect(within(synthesis).getAllByRole('listitem').map((li) => li.dataset.severity)).toEqual(['medium', 'unknown']);
    expect(synthesis).toHaveTextContent('Aléa moyen');
    expect(screen.getByText('Analyse du 1 octobre 2026')).toBeInTheDocument();
    const costs = screen.getByRole('region', { name: 'Surcoûts indicatifs' });
    expect(costs).toHaveTextContent('Adaptation à l’inondation');
    expect(costs).toHaveTextContent('+150 €/m²');
    expect(costs).toHaveTextContent('total +177 €/m²');

    const parcels = screen.getByRole('region', { name: 'Par parcelle' });
    expect(parcels).toHaveTextContent('moyen (centennal) : plus de 2 m');
    expect(parcels).toHaveTextContent('extrême : 0,5 à 1 m (submersion marine)');
    expect(parcels).toHaveTextContent('cote de crue indicative : au moins 34,31 m NGF');
    expect(parcels).toHaveTextContent('Indisponible (source muette) : à vérifier');
    expect(parcels).toHaveTextContent('hors zone');
    expect(parcels).toHaveTextContent('aucune');

    const communes = screen.getByRole('region', { name: 'Communes' });
    expect(within(communes).getByRole('link', { name: 'PPRI Marne et Seine' })).toHaveAttribute('href', result.communes[0]!.plans.status === 'ok' ? result.communes[0]!.plans.data[0]!.url : '');
    expect(communes).toHaveTextContent('ZR Interdiction : zone rouge de grand écoulement');
    expect(communes).toHaveTextContent('approuvé le 12/11/2007 (prescrit le 04/04/2003) · Inondation');
    expect(within(communes).getByRole('link', { name: 'page de la préfecture' })).toHaveAttribute('href', 'https://www.val-de-marne.gouv.fr/ppr');
    expect(communes).toHaveTextContent('prescrit le 01/01/2020');
    expect(communes).toHaveTextContent('abrogé');
    expect(communes).toHaveTextContent('9 (dernier : Inondations et/ou Coulées de Boue, 15/01/2018)');
    expect(communes).toHaveTextContent('Aucun PPR sur la commune.');

    const nearby = screen.getByRole('region', { name: 'Alentours' });
    expect(nearby).toHaveTextContent('1, la plus proche à 1,5 km');
    expect(nearby).toHaveTextContent('1, la plus proche à 392 m');
    expect(communes).toHaveTextContent('Données Géorisques du 25 septembre 2026');
    expect(nearby).toHaveTextContent('Seveso seuil bas');
    expect(within(nearby).getByRole('link', { name: 'fiche' })).toHaveAttribute('href', 'https://fiche');
    expect(nearby).toHaveTextContent('1, la plus proche à 111 m');
    expect(nearby).toHaveTextContent('Données OSM du 20 septembre 2026');
    expect(screen.getByRole('region', { name: 'Sources' })).toHaveTextContent('Géorisques · Licence ouverte 2.0');
    // Calcul fini : le déroulé reste consultable, replié.
    expect(screen.getByText(/Déroulé de l’analyse \(5 étapes, dont certaines sans réponse\)/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Calcul en cours' })).toBeNull();
    await waitFor(() => expect(mapProps?.hydrants).toEqual([{ id: 'node/1', point: [2.43, 48.8], label: 'Borne incendie · 111 m' }]));
    expect(mapProps!.cavities).toHaveLength(1);
  });

  it('couches de risques : cochées, retenues dans le navigateur ; sans stockage, pour la visite', async () => {
    api({ [`GET /api/studies/${ID}/risks`]: { status: 200, body: ready } });
    renderAt(`/studies/${ID}/risks`);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Zonage des PPR inondation' }));
    expect(await screen.findByTestId('risk-map')).toHaveTextContent('ppr-flood');
    expect(localStorage.getItem('ardha.risks.layers')).toBe('["ppr-flood"]');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Zonage des PPR inondation' }));
    expect(screen.getByTestId('risk-map')).toHaveTextContent('');
  });

  it('préférence relue ; stockage bloqué sans effet', async () => {
    localStorage.setItem('ardha.risks.layers', '["clay", 3]');
    api({ [`GET /api/studies/${ID}/risks`]: { status: 200, body: ready } });
    renderAt(`/studies/${ID}/risks`);
    expect(await screen.findByRole('checkbox', { name: 'Retrait-gonflement des argiles' })).toBeChecked();
    const blocked = () => {
      throw new Error('bloqué');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, clear: () => undefined });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Zonage des PPR inondation' }));
    expect(screen.getByRole('checkbox', { name: 'Zonage des PPR inondation' })).toBeChecked();
  });

  it('périmée : bandeau et « Recalculer » ; recalcul forcé ; échec affiché', async () => {
    let state: StudyRisks = { ...ready, stale: true };
    const calls = api({
      [`GET /api/studies/${ID}/risks`]: () => ({ status: 200, body: state }),
      [`POST /api/studies/${ID}/risks`]: () => {
        state = { ...ready, status: 'failed', error: 'L’analyse des risques a échoué.', stale: false };
        return { status: 202, body: state };
      },
    });
    renderAt(`/studies/${ID}/risks`);
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Les parcelles de l’étude ont changé depuis cette analyse');
    await userEvent.click(within(banner).getByRole('button', { name: 'Recalculer' }));
    expect(await screen.findByText('L’analyse des risques a échoué.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recalculer' }));
    expect(calls.filter((c) => c.key.startsWith('POST')).map((c) => c.body)).toEqual([{ force: false }, { force: true }]);
  });

  it('demande refusée : message ; étude à la corbeille : ni demande ni recalcul', async () => {
    api({
      [`GET /api/studies/${ID}`]: { status: 200, body: { ...study, deletedAt: '2026-10-01T10:00:00Z', purgeAt: '2026-10-31T10:00:00Z' } },
      [`GET /api/studies/${ID}/risks`]: { status: 200, body: none },
    });
    renderAt(`/studies/${ID}/risks`);
    expect(await screen.findByText('Aucune analyse pour l’instant.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recalculer' })).toBeNull();
    expect(screen.getByText('Analyse pas encore faite')).toBeInTheDocument();
  });

  it('avant la première étape : le bloc compact est déjà là ; toutes finies : enregistrement', async () => {
    let state: StudyRisks = { ...none, status: 'queued' };
    api({ [`GET /api/studies/${ID}/risks`]: () => ({ status: 200, body: state }) });
    renderAt(`/studies/${ID}/risks`);
    expect(await screen.findByText('Préparation du calcul…')).toBeInTheDocument();
    expect(screen.getByText('Premiers appels aux sources…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voir les/ })).toBeNull();
    state = { ...none, status: 'running', progress: finished };
    expect(await screen.findByText('Enregistrement de l’analyse', {}, { timeout: 3000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 5 étapes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Masquer le détail' }));
    expect(screen.queryByRole('list', { name: 'Déroulé de l’analyse' })).toBeNull();
  });

  it('une demande en erreur s’affiche', async () => {
    api({ [`GET /api/studies/${ID}/risks`]: { status: 200, body: none }, [`POST /api/studies/${ID}/risks`]: { status: 409, body: { message: 'Cette étude est dans la corbeille.' } } });
    renderAt(`/studies/${ID}/risks`);
    expect(await screen.findByText('Cette étude est dans la corbeille.')).toBeInTheDocument();
  });

  it('résultat calme, une commune : aucun alentour, cote exacte, préférences illisibles ignorées', async () => {
    localStorage.setItem('ardha.risks.layers', '{"pas":"une liste"}');
    const calm: NonNullable<StudyRisks['result']> = {
      ...result,
      communes: [{ ...result.communes[0]!, catnat: ok({ count: 1, truncated: false, latest: [{ id: 'Y', label: 'Tempête', start: null, published: null }] }) }],
      parcels: [{ ...result.parcels[0]!, clay: ok(null), floodLevel: { level: 33.31, atLeast: false } }],
      cavities: ok({ truncated: false, items: [] }),
      pollutedSites: ok({ truncated: false, items: [] }),
      hydrants: ok({ asOf: '2026-09-20T00:00:00.000Z', items: [] }),
    };
    api({ [`GET /api/studies/${ID}/risks`]: { status: 200, body: { ...ready, result: calm, surcharges: [] } } });
    renderAt(`/studies/${ID}/risks`);
    expect(await screen.findByRole('region', { name: 'Commune' })).toHaveTextContent('1 (dernier : Tempête)');
    expect(screen.getByRole('region', { name: 'Par parcelle' })).toHaveTextContent('cote de crue indicative : 33,31 m NGF');
    const nearby = screen.getByRole('region', { name: 'Alentours' });
    expect(nearby).toHaveTextContent('Aucune.');
    expect(nearby).toHaveTextContent('Aucun.');
    expect(nearby).toHaveTextContent('Aucune connue.');
    expect(screen.getByRole('region', { name: 'Surcoûts indicatifs' })).toHaveTextContent('Aucun surcoût de construction lié aux risques connus.');
    expect(screen.getByRole('checkbox', { name: 'Zonage des PPR inondation' })).not.toBeChecked();
  });

  it('cavités indisponibles : pas de point sur la carte ; préférence en JSON invalide', async () => {
    localStorage.setItem('ardha.risks.layers', '{');
    api({ [`GET /api/studies/${ID}/risks`]: { status: 200, body: { ...ready, result: { ...result, cavities: off, hydrants: off } } } });
    renderAt(`/studies/${ID}/risks`);
    await screen.findByRole('region', { name: 'Alentours' });
    await waitFor(() => expect(mapProps?.cavities).toEqual([]));
    expect(mapProps!.hydrants).toEqual([]);
  });

  it('étude introuvable', async () => {
    api({ [`GET /api/studies/${ID}`]: { status: 404, body: { message: 'Étude introuvable.' } }, [`GET /api/studies/${ID}/risks`]: { status: 404, body: { message: 'Étude introuvable.' } } });
    renderAt(`/studies/${ID}/risks`);
    expect(await screen.findByRole('heading', { name: 'Étude introuvable' })).toBeInTheDocument();
  });
});
