// Intégration de l'étude (F-02) : l'API réelle et le worker dans le même processus, sur les réponses
// enregistrées de la BAN et des tuiles OSM (sans Internet).
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Study, StudySummary } from '../src/contracts/index.ts';
import { StudyDerivations } from '../src/ingestion/study-derivations.ts';
import { FileStore } from '../src/shared/files.ts';
import { StudiesRepository } from '../src/studies/studies.repository.ts';
import { StudiesService, thumbnailFile } from '../src/studies/studies.service.ts';
import { Reconciliation } from '../src/worker/maintenance.ts';
import { StudiesProcessor } from '../src/worker/studies.processor.ts';
import { seedParcels } from './reference.ts';
import { signedIn } from './session.ts';
import { createTestApp, type TestApp } from './test-app.ts';

const AY145 = '94046000AY0145';
const AY146 = '94046000AY0146';
const AY147 = '94046000AY0147';
const AY96 = '94046000AY0096';
const AY97 = '94046000AY0097';
const AS71 = '74010000AS0071';
const DAY = 24 * 3600 * 1000;

let t: TestApp;
let cookie: string;
const http = () => request(t.app.getHttpServer());
const as = (c: string) => ({
  get: (path: string) => http().get(path).set('Cookie', c),
  post: (path: string, body?: object) => http().post(path).set('Cookie', c).send(body),
  patch: (path: string, body: object) => http().patch(path).set('Cookie', c).send(body),
  put: (path: string) => http().put(path).set('Cookie', c),
  delete: (path: string) => http().delete(path).set('Cookie', c),
});
let me: ReturnType<typeof as>;

async function waitFor(id: string, done: (s: Study) => boolean, c = cookie): Promise<Study> {
  const end = Date.now() + 10_000;
  for (;;) {
    const s = (await as(c).get(`/api/studies/${id}`)).body as Study;
    if (done(s) || Date.now() > end) return s;
    await new Promise((r) => setTimeout(r, 25));
  }
}
const settled = (s: Study) => !s.addressPending && !s.thumbnailPending;

async function create(parcelIds: string[], c = cookie): Promise<Study> {
  const r = await as(c).post('/api/studies', { parcelIds });
  expect(r.status).toBe(201);
  return r.body as Study;
}

beforeAll(async () => {
  t = await createTestApp({ worker: true });
  await t.resetReference();
  await seedParcels(t.worker!, [AY145, AY146, AY147, AY96, AY97, AS71]);
  cookie = await signedIn(t);
  me = as(cookie);
});
afterAll(() => t.close());
beforeEach(async () => {
  await t.pool.query('TRUNCATE studies CASCADE');
});

describe('créer une étude', () => {
  it('nom provisoire, puis adresse, nom proposé et vignette calculés par le worker (Q1, Q2, Q3, Q6)', async () => {
    const created = await create([AY146]);
    expect(created).toMatchObject({
      name: 'Maisons-Alfort — AY 146',
      nameIsProvisional: true,
      communeCode: '94046',
      communeName: 'Maisons-Alfort',
      parcelCount: 1,
      contenance: 344,
      addressPending: true,
      thumbnailPending: true,
      thumbnailUrl: null,
      deletedAt: null,
      purgeAt: null,
    });
    expect(created.parcels).toEqual([
      expect.objectContaining({ id: AY146, label: 'AY 146', contenance: 344, version: '2026-09-01', area: expect.closeTo(342, 0) }),
    ]);
    expect(created.steps.map((s) => [s.key, s.state])).toEqual([
      ['parcels', 'done'],
      ['urbanism', 'upcoming'],
      ['risks', 'upcoming'],
      ['land', 'upcoming'],
      ['feasibility', 'upcoming'],
      ['report', 'upcoming'],
    ]);

    const s = await waitFor(created.id, settled);
    expect(s).toMatchObject({ name: '2 Rue Etienne Dolet, Maisons-Alfort', nameIsProvisional: false, addressLabel: '2 Rue Etienne Dolet 94700 Maisons-Alfort' });
    expect(s.address).toMatchObject({ kind: 'housenumber', name: '2 Rue Etienne Dolet', street: 'Rue Etienne Dolet', communeCode: '94046' });
    expect(s.thumbnailUrl).toMatch(new RegExp(`^/api/studies/${s.id}/thumbnail\\?v=[0-9a-f]{16}$`));

    const png = await me.get(s.thumbnailUrl!).buffer(true);
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');
    expect(png.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect((png.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  });

  it('refuse une parcelle inconnue, une sélection vide ou trop grande', async () => {
    const unknown = await me.post('/api/studies', { parcelIds: [AY146, '94046000ZZ9999'] });
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toBe('Parcelle inconnue : 94046000ZZ9999.');
    expect((await me.post('/api/studies', { parcelIds: [] })).body.fields).toEqual({ parcelIds: 'Sélectionnez au moins une parcelle.' });
    expect((await me.post('/api/studies', { parcelIds: [AY146, AY146] })).status).toBe(400);
    expect((await t.pool.query('SELECT count(*)::int AS n FROM studies')).rows[0].n).toBe(0);
  });

  it('exige une session ; l’étude d’un autre est introuvable', async () => {
    expect((await http().get('/api/studies')).status).toBe(401);
    const s = await create([AY146]);
    const other = as(await signedIn(t));
    for (const r of [
      await other.get(`/api/studies/${s.id}`),
      await other.patch(`/api/studies/${s.id}`, { name: 'x' }),
      await other.put(`/api/studies/${s.id}/parcels/${AY145}`),
      await other.delete(`/api/studies/${s.id}`),
      await other.get(`/api/studies/${s.id}/thumbnail`),
    ]) {
      expect(r.status).toBe(404);
      expect(r.body.message).toBe('Étude introuvable.');
    }
    expect((await other.get('/api/studies')).body.studies).toEqual([]);
    expect((await me.get('/api/studies/pas-un-uuid')).status).toBe(400);
  });
});

describe('liste et recherche (Q5)', () => {
  it('les plus récemment modifiées d’abord ; recherche sans accents ni casse, sur nom, commune et adresse', async () => {
    const dolet = await waitFor((await create([AY146])).id, settled);
    const morette = await waitFor((await create([AS71])).id, settled);
    const list = (q = '') => me.get(`/api/studies?q=${encodeURIComponent(q)}`).then((r) => (r.body.studies as StudySummary[]).map((s) => s.name));
    expect(await list()).toEqual([morette.name, dolet.name]);
    expect(await list('étienne')).toEqual([dolet.name]);
    expect(await list('ANNECY morette')).toEqual(['8 Rue de Morette, Annecy']);
    expect(await list('74000')).toEqual([morette.name]);
    expect(await list('lyon')).toEqual([]);
    // Une modification remonte l'étude.
    await me.patch(`/api/studies/${dolet.id}`, { name: 'Dolet' });
    expect(await list()).toEqual(['Dolet', morette.name]);
    const [summary] = (await me.get('/api/studies?q=dolet')).body.studies as StudySummary[];
    expect(summary).toMatchObject({ parcelCount: 1, contenance: 344, communeName: 'Maisons-Alfort', thumbnailUrl: expect.any(String) });
    expect(summary).not.toHaveProperty('parcels');
  });
});

describe('modifier une étude', () => {
  it('renommer fige le nom : il ne bouge plus quand les parcelles changent (Q2)', async () => {
    const s = await waitFor((await create([AY146])).id, settled);
    const renamed = await me.patch(`/api/studies/${s.id}`, { name: '  Maison des fondateurs ' });
    expect(renamed.body).toMatchObject({ name: 'Maison des fondateurs', nameIsProvisional: false });
    const added = await me.put(`/api/studies/${s.id}/parcels/${AY145}`);
    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({ parcelCount: 2, addressPending: true, thumbnailPending: true });
    const after = await waitFor(s.id, settled);
    expect(after.name).toBe('Maison des fondateurs');
    expect(after.thumbnailUrl).not.toBe(s.thumbnailUrl);
    expect((await me.patch(`/api/studies/${s.id}`, { name: ' ' })).body.fields).toEqual({ name: 'Donnez un nom à l’étude.' });
  });

  it('un nom proposé ne suit pas non plus les parcelles ajoutées ensuite', async () => {
    const s = await waitFor((await create([AY146])).id, settled);
    await me.put(`/api/studies/${s.id}/parcels/${AY145}`);
    expect((await waitFor(s.id, settled)).name).toBe('2 Rue Etienne Dolet, Maisons-Alfort');
  });

  it('choisir une autre adresse parmi celles trouvées ; elle tient tant qu’elle est trouvée (Q3)', async () => {
    const s = await waitFor((await create([AS71])).id, settled);
    expect(s.addresses.map((a) => a.name)).toEqual(['8 Rue de Morette', '10 Rue de Morette', '12 Rue de Morette', '14 Rue de Morette', '16 Rue de Morette', '18 Rue de Morette']);
    const eighteen = s.addresses.at(-1)!;
    const chosen = await me.patch(`/api/studies/${s.id}`, { addressId: eighteen.id });
    expect(chosen.body).toMatchObject({ addressLabel: '18 Rue de Morette 74000 Annecy', chosenAddressId: eighteen.id, name: '8 Rue de Morette, Annecy' });
    // Recalcul (CLI `study:refresh --inline`) : le choix est retrouvé, il reste.
    expect(await t.worker!.get(StudyDerivations).deriveNow(s.id)).toEqual({ address: 'done', thumbnail: 'done' });
    expect((await me.get(`/api/studies/${s.id}`)).body.addressLabel).toBe('18 Rue de Morette 74000 Annecy');
    const refused = await me.patch(`/api/studies/${s.id}`, { addressId: '94046_7120_00009' });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe('Cette adresse n’est pas rattachée aux parcelles de l’étude.');
  });

  it('ajouter ou retirer une parcelle ; jamais la dernière ; sans effet si rien ne change', async () => {
    const s = await create([AY146, AY145]);
    const same = await me.put(`/api/studies/${s.id}/parcels/${AY145}`);
    expect(same.body.parcels.map((p: { id: string }) => p.id)).toEqual([AY146, AY145]);
    expect((await me.delete(`/api/studies/${s.id}/parcels/${AY147}`)).body.parcelCount).toBe(2);
    expect((await me.delete(`/api/studies/${s.id}/parcels/${AY146}`)).body.parcels.map((p: { id: string }) => p.id)).toEqual([AY145]);
    const last = await me.delete(`/api/studies/${s.id}/parcels/${AY145}`);
    expect(last.status).toBe(400);
    expect(last.body.message).toBe('Une étude garde au moins une parcelle.');
    expect((await me.put(`/api/studies/${s.id}/parcels/94046000ZZ9999`)).status).toBe(404);
    expect((await me.put(`/api/studies/${s.id}/parcels/pas-une-parcelle`)).status).toBe(400);
  });

  it('deux ajouts simultanés ne s’écrasent pas (verrou de l’étude)', async () => {
    const s = await create([AY146]);
    await Promise.all([me.put(`/api/studies/${s.id}/parcels/${AY145}`), me.put(`/api/studies/${s.id}/parcels/${AY147}`)]);
    const after = (await me.get(`/api/studies/${s.id}`)).body as Study;
    expect(after.parcels.map((p) => p.id).sort()).toEqual([AY145, AY146, AY147]);
    expect(new Set(after.parcels.map((p) => p.id)).size).toBe(3);
    // Le nom est proposé par le premier calcul qui aboutit (1 ou 3 parcelles selon l'ordre), puis ne bouge plus.
    const settledStudy = await waitFor(s.id, settled);
    expect(settledStudy.name).toMatch(/^2 Rue Etienne Dolet, Maisons-Alfort/);
    expect(settledStudy.addressPending).toBe(false);
  });

  it('plafond de 50 parcelles', async () => {
    const s = await create([AY146]);
    const ids = Array.from({ length: 49 }, (_, i) => `94046000ZY${String(i).padStart(4, '0')}`);
    await t.pool.query(
      `INSERT INTO study_parcels (study_id, parcel_id, position, commune_code, prefix, section, number, area, geometry, version)
       SELECT $1, id, 10 + n, '94046', '000', 'ZY', '0001', 1, geometry, '2026-09-01'
       FROM unnest($2::text[]) WITH ORDINALITY AS u(id, n), (SELECT geometry FROM study_parcels WHERE study_id = $1) g`,
      [s.id, ids],
    );
    const r = await me.put(`/api/studies/${s.id}/parcels/${AY145}`);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Une étude compte au plus 50 parcelles.');
  });
});

describe('dupliquer (Q10)', () => {
  it('copie le nom « (copie) », l’adresse, les parcelles et la vignette, sans recalcul', async () => {
    const s = await waitFor((await create([AY96, AY97])).id, settled);
    const r = await me.post(`/api/studies/${s.id}/duplicate`);
    expect(r.status).toBe(201);
    const copy = r.body as Study;
    expect(copy.id).not.toBe(s.id);
    expect(copy).toMatchObject({
      name: `${s.name} (copie)`,
      addressLabel: s.addressLabel,
      addressPending: false,
      thumbnailPending: false,
      parcelCount: 2,
    });
    expect(copy.parcels.map((p) => p.id)).toEqual([AY96, AY97]);
    expect((await me.get(copy.thumbnailUrl!)).status).toBe(200);
    expect((await me.get('/api/studies')).body.studies).toHaveLength(2);
  });
});

describe('corbeille (Q9)', () => {
  it('supprimer met à la corbeille ; restaurable ; non modifiable entre-temps', async () => {
    const s = await create([AY146]);
    expect((await me.delete(`/api/studies/${s.id}`)).status).toBe(204);
    expect((await me.delete(`/api/studies/${s.id}`)).status).toBe(204);
    expect((await me.get('/api/studies')).body.studies).toEqual([]);
    const [trashed] = (await me.get('/api/studies?trash=true')).body.studies as StudySummary[];
    expect(trashed!.id).toBe(s.id);
    expect(new Date(trashed!.purgeAt!).getTime() - new Date(trashed!.deletedAt!).getTime()).toBe(30 * DAY);
    const blocked = await me.patch(`/api/studies/${s.id}`, { name: 'x' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe('Cette étude est dans la corbeille : restaurez-la pour la modifier.');
    expect((await me.post(`/api/studies/${s.id}/duplicate`)).status).toBe(409);
    expect((await me.get(`/api/studies/${s.id}`)).status).toBe(200);

    const restored = await me.post(`/api/studies/${s.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.deletedAt).toBeNull();
    expect((await me.get('/api/studies')).body.studies).toHaveLength(1);
    const audit = await t.pool.query(`SELECT action FROM audit_logs WHERE target_id = $1 ORDER BY created_at`, [s.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(['study.created', 'study.trashed', 'study.restored']);
  });

  it('la purge efface les études restées 30 jours, et leur vignette', async () => {
    const old = await waitFor((await create([AY146])).id, settled);
    const recent = await create([AY145]);
    await me.delete(`/api/studies/${old.id}`);
    t.clock.advance(20 * DAY);
    await me.delete(`/api/studies/${recent.id}`);
    t.clock.advance(11 * DAY);
    const files = t.app.get(FileStore);
    expect(await files.get(thumbnailFile(old.id))).not.toBeNull();
    expect(await t.app.get(StudiesService).purge('worker')).toEqual([old.id]);
    expect(await files.get(thumbnailFile(old.id))).toBeNull();
    expect((await me.get('/api/studies?trash=true')).body.studies.map((s: StudySummary) => s.id)).toEqual([recent.id]);
    t.clock.advance(-31 * DAY);
  });
});

describe('réconciliation', () => {
  it('réenfile l’adresse et la vignette d’une étude dont le job s’est perdu', async () => {
    const s = await waitFor((await create([AY146])).id, settled);
    await t.pool.query(`UPDATE studies SET address_key = NULL, thumbnail_key = NULL, updated_at = now() - interval '2 minutes' WHERE id = $1`, [s.id]);
    expect((await t.worker!.get(Reconciliation).run()).studies).toEqual([s.id]);
    expect(settled(await waitFor(s.id, settled))).toBe(true);
    expect(await t.worker!.get(StudiesRepository).lagging(new Date())).toEqual([]);
  });
});

describe('cas limites', () => {
  const cli = { userId: null, origin: 'cli' as const };

  it('vignette pas encore prête ; copie sans vignette ; restaurer une étude hors corbeille', async () => {
    const s = await waitFor((await create([AY146])).id, settled);
    await t.pool.query('UPDATE studies SET thumbnail_key = NULL WHERE id = $1', [s.id]);
    const missing = await me.get(`/api/studies/${s.id}/thumbnail`);
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('Vignette pas encore prête.');
    const copy = (await me.post(`/api/studies/${s.id}/duplicate`)).body as Study;
    expect(copy.thumbnailUrl).toBeNull();
    expect((await waitFor(copy.id, settled)).thumbnailUrl).toMatch(/thumbnail\?v=/);
    expect((await me.post(`/api/studies/${s.id}/restore`)).body.deletedAt).toBeNull();
  });

  it('le service refuse une sélection vide ou trop grande (la CLI n’a pas le contrat)', async () => {
    const service = t.app.get(StudiesService);
    const owner = { userId: (await t.pool.query('SELECT id FROM users LIMIT 1')).rows[0].id as string, origin: 'cli' as const };
    await expect(service.create(owner, [])).rejects.toThrow('Une étude garde au moins une parcelle.');
    await expect(service.create(owner, Array.from({ length: 51 }, (_, i) => `94046000ZY${String(i).padStart(4, '0')}`))).rejects.toThrow('au plus 50');
    expect((await service.list(cli, { trash: false })).length).toBe(0);
  });

  it('le worker ne calcule rien pour des parcelles qui ont changé, une étude supprimée ou inconnue', async () => {
    const s = await waitFor((await create([AY146])).id, settled);
    const derivations = t.worker!.get(StudyDerivations);
    const key = (await t.worker!.get(StudiesRepository).get(s.id))!.parcelsKey;
    expect(await derivations.resolveAddress({ studyId: s.id, parcelsKey: key })).toBe('fresh');
    expect(await derivations.renderThumbnail({ studyId: s.id, parcelsKey: 'autre' })).toBe('stale');
    await me.delete(`/api/studies/${s.id}`);
    expect(await derivations.resolveAddress({ studyId: s.id, parcelsKey: key, force: true })).toBe('stale');
    expect(await derivations.deriveNow('0193a8b4-0000-7000-8000-000000000000')).toEqual({ address: 'stale', thumbnail: 'stale' });
    await expect(t.worker!.get(StudiesProcessor).process({ name: 'autre', data: {} } as never)).rejects.toThrow('Tâche inconnue : autre');
  });
});
