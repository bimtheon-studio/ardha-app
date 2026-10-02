// Sources du marché (F-05) : geo-DVF, DiDo (ECLN, Sitadel), INSEE ; sur les réponses réelles
// enregistrées (Val-de-Marne 2024-2025, Maisons-Alfort) et sur des réponses fabriquées.
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FakeHttp } from '../../test/fake-http.ts';
import { REPO_ROOT } from '../config/config.ts';
import { dedupMutations, INDEX_SERIES } from '../domain/index.ts';
import { Dido, DIDO_BASE, ECLN_FILE, parseDidoCsv, SITADEL_FILE } from './dido.ts';
import { GEO_DVF_BASE, GeoDvf, parseGeoDvfCsv, splitCsvLine } from './dvf.ts';
import { RecordedHttp } from './http.ts';
import { BDM_SDMX, Insee, parseSdmxSeries } from './insee.ts';

const recorded = new RecordedHttp(path.join(REPO_ROOT, 'fixtures/http'));

describe('geo-DVF, réponses enregistrées', () => {
  const dvf = new GeoDvf(recorded);

  it('liste les millésimes et les fichiers départementaux avec leur date', async () => {
    expect(await dvf.years()).toEqual([2021, 2022, 2023, 2024, 2025]);
    const files = await dvf.departmentFiles(2025);
    // 101 départements, moins l'Alsace-Moselle et Mayotte, que DVF ne couvre pas.
    expect(files).toHaveLength(97);
    expect(files.map((f) => f.department)).not.toContain('57');
    expect(files.find((f) => f.department === '94')).toEqual({ year: 2025, department: '94', size: 1_117_186, modifiedAt: '2026-05-18T13:14:15.000Z' });
    expect(files.map((f) => f.department)).toEqual(expect.arrayContaining(['2A', '2B', '971', '974']));
  });

  it('lit le Val-de-Marne 2025 : 46 311 lignes, 19 047 ventes (10 sans valeur foncière écartées)', async () => {
    const rows = (await dvf.departmentRows(2025, '94'))!;
    expect(rows).toHaveLength(46_311);
    expect(rows[0]).toMatchObject({ mutationId: '2025-1223897', date: '2025-01-03', nature: 'Vente', price: 528_800, communeCode: '94046', parcelId: '940460000G0151' });
    const mutations = dedupMutations(rows);
    expect(mutations).toHaveLength(19_047);
    expect(mutations.every((m) => m.date.startsWith('2025-'))).toBe(true);
  });
});

describe('geo-DVF, cas limites', () => {
  it('découpe les guillemets et les guillemets doublés', () => {
    expect(splitCsvLine('a,"b,c","d ""e""",')).toEqual(['a', 'b,c', 'd "e"', '']);
    expect(splitCsvLine('"x";y', ';')).toEqual(['x', 'y']);
  });

  it('refuse un en-tête inconnu ; lit les nombres vides comme nuls', () => {
    expect(() => parseGeoDvfCsv('a,b\n1,2')).toThrow('en-tête inattendu');
    const [r] = parseGeoDvfCsv('id_mutation,valeur_fonciere,surface_terrain\n2025-1,,abc\n\n');
    expect(r).toMatchObject({ mutationId: '2025-1', price: null, landArea: null, streetName: '' });
  });

  it('fichier absent, panne, fichier illisible, index vide', async () => {
    const http = new FakeHttp({
      [`${GEO_DVF_BASE}/2025/departements/57`]: { status: 404 },
      [`${GEO_DVF_BASE}/2025/departements/94`]: { status: 503 },
      [`${GEO_DVF_BASE}/2025/departements/93`]: { text: 'pas du gzip' },
      [`${GEO_DVF_BASE}/2025/departements/92`]: { gzipText: 'id_mutation,valeur_fonciere\n2025-1,100000\n' },
      [`${GEO_DVF_BASE}/$`]: { text: '<html></html>' },
    });
    const dvf = new GeoDvf(http);
    expect(await dvf.departmentRows(2025, '57')).toBeNull();
    await expect(dvf.departmentRows(2025, '94')).rejects.toThrow('HTTP 503');
    await expect(dvf.departmentRows(2025, '93')).rejects.toThrow('illisible');
    expect(await dvf.departmentRows(2025, '92')).toHaveLength(1);
    await expect(dvf.years()).rejects.toThrow('aucun millésime');
    await expect(dvf.departmentFiles(2030)).rejects.toThrow('HTTP 404');
  });
});

describe('DiDo, réponses enregistrées', () => {
  const dido = new Dido(recorded);

  it('ECLN : tous départements, prix nul quand le trimestre est vide', async () => {
    const rows = await dido.newBuildPrices();
    expect(rows.length).toBeGreaterThan(24_000);
    expect(rows.find((r) => r.department === '94' && r.quarter === '2026-T2' && r.housingType === 'collective')).toEqual({
      department: '94',
      quarter: '2026-T2',
      housingType: 'collective',
      listed: 740,
      reservations: 957,
      cancellations: 216,
      stock: 6399,
      monthsToSell: 7,
      pricePerM2: 5739,
      averagePrice: null,
    });
    expect(rows.find((r) => r.department === '23' && r.quarter === '2026-T2' && r.housingType === 'all')!.pricePerM2).toBeNull();
  });

  it('Sitadel : Maisons-Alfort, par année et par type', async () => {
    const rows = await dido.housingPermits('94046');
    expect(rows.find((r) => r.year === 2024 && r.housingType === 'collective')).toEqual({
      communeCode: '94046',
      year: 2024,
      housingType: 'collective',
      authorizedUnits: 0,
      startedUnits: 185,
      authorizedArea: 0,
      startedArea: 12_242,
    });
    expect(new Set(rows.map((r) => r.housingType))).toEqual(new Set(['all', 'individual-detached', 'individual-grouped', 'collective', 'residence']));
  });
});

describe('DiDo, cas limites', () => {
  const url = (file: string) => `${DIDO_BASE}/${file}/csv`;

  it('commune sans donnée : vide ; panne ; en-têtes inattendus', async () => {
    const dido = new Dido(
      new FakeHttp({
        [`${url(SITADEL_FILE)}?COMM=eq:99999`]: { status: 400, json: { code: 400, message: 'Le fichier est vide.' } },
        [`${url(SITADEL_FILE)}?COMM=eq:11111`]: { text: '"A";"B"\n"1";"2"\n' },
        [`${url(SITADEL_FILE)}?COMM=eq:22222`]: { text: '"ANNEE";"TYPE_LGT";"LOG_AUT"\n"x";"Collectif";"1"\n"2024";"Autre";"1"\n' },
        [`${url(SITADEL_FILE)}?COMM=eq:33333`]: { status: 500 },
        [url(ECLN_FILE)]: { text: '"TRIMESTRE";"DEP_CODE"\n"2026-T2";"94"\n' },
      }),
    );
    expect(await dido.housingPermits('99999')).toEqual([]);
    await expect(dido.housingPermits('11111')).rejects.toThrow('Sitadel : en-tête inattendu');
    expect(await dido.housingPermits('22222')).toEqual([]);
    await expect(dido.housingPermits('33333')).rejects.toThrow('HTTP 500');
    await expect(dido.newBuildPrices()).rejects.toThrow('ECLN : en-tête inattendu');
    await expect(new Dido(new FakeHttp({ [url(ECLN_FILE)]: { status: 400, text: 'vide' } })).newBuildPrices()).rejects.toThrow('ECLN');
  });

  it('cellules manquantes : chaînes vides', () => {
    expect(parseDidoCsv('"a";"b"\n"1"\n')).toEqual([{ A: '1', B: '' }]);
    expect(parseDidoCsv('')).toEqual([]);
  });
});

describe('INSEE', () => {
  it('lit toutes les séries du catalogue en une requête', async () => {
    const series = await new Insee(recorded).series(INDEX_SERIES.map((s) => s.id));
    expect([...series.keys()].sort()).toEqual(INDEX_SERIES.map((s) => s.id).sort());
    expect(series.get('000008630')!.find((v) => v.period === '2026-Q2')).toEqual({ period: '2026-Q2', value: 2103 });
    expect(series.get('001710986')!.find((v) => v.period === '2026-07')).toEqual({ period: '2026-07', value: 138.9 });
  });

  it('ignore une série sans identifiant et une observation illisible ; panne ; réponse inattendue', async () => {
    const xml = '<message:StructureSpecificData><Series FREQ="T"><Obs TIME_PERIOD="2026-Q1" OBS_VALUE="1"/></Series><Series IDBANK="1"><Obs TIME_PERIOD="2026-Q1" OBS_VALUE="NaN"/><Obs OBS_VALUE="2"/><Obs TIME_PERIOD="2026-Q2" OBS_VALUE="3"/></Series></message:StructureSpecificData>';
    expect(parseSdmxSeries(xml)).toEqual(new Map([['1', [{ period: '2026-Q2', value: 3 }]]]));
    await expect(new Insee(new FakeHttp({ [BDM_SDMX]: { status: 503 } })).series(['1'])).rejects.toThrow('HTTP 503');
    await expect(new Insee(new FakeHttp({ [BDM_SDMX]: { text: '<html/>' } })).series(['1'])).rejects.toThrow('inattendue');
  });
});
