// Géorisques, API v1 (`www.georisques.gouv.fr/api/v1`, sans clé) : risques communaux (radon,
// sismicité, GASPAR, PPR, CatNat), installations classées, sols pollués, cavités, argiles (F-04).
// Pièges vérifiés le 01/10/2026 (et par l'audit de l'ancienne équipe) : `gaspar/pprn` et
// `gaspar/pprt` prennent `codeInsee` (`code_insee` est ignoré et renvoie toute la France) ;
// `latlon` est « longitude,latitude » ; le lien `next` pointe vers un hôte interne, on pagine
// soi-même.
import { z } from 'zod';

import { type Http, SourceError } from './http.ts';

export const GEORISQUES_BASE = 'https://www.georisques.gouv.fr/api/v1';
const SOURCE = 'georisques';
/** Pages lues au plus (100 éléments chacune) : au-delà, la liste est dite tronquée. */
const MAX_PAGES = 5;

const Page = z.object({ data: z.array(z.unknown()), total_pages: z.number().default(1) });
const SpringPage = z.object({ content: z.array(z.unknown()), totalPages: z.number().default(1) });

const nullableString = z.string().nullish().transform((v) => v ?? null);
const nullableNumber = z.number().nullish().transform((v) => v ?? null);

const Radon = z.object({ classe_potentiel: z.coerce.number() });
const Seismic = z.object({ code_zone: z.coerce.number() });
const Hazards = z.object({ risques_detail: z.array(z.object({ num_risque: z.string(), libelle_risque_long: z.string() })).default([]) });
const Plan = z.object({
  idGaspar: z.string(),
  libPpr: z.string(),
  modeleProcedure: nullableString,
  dateModification: nullableString,
  zonageReglementaire: z
    .object({ listTypeReg: z.array(z.object({ code: z.string(), libelle: z.string(), nom: nullableString, codeZone: nullableString })).nullish() })
    .nullish(),
});
const CatNat = z.object({
  code_national_catnat: z.string(),
  libelle_risque_jo: z.string(),
  date_debut_evt: nullableString,
  date_fin_evt: nullableString,
  date_publication_jo: nullableString,
});
const Installation = z.object({
  raisonSociale: z.string(),
  regime: nullableString,
  statutSeveso: nullableString,
  longitude: nullableNumber,
  latitude: nullableNumber,
  codeAIOT: nullableString,
});
const Polygonal = z.object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.array(z.unknown()) });
const PollutedSite = z.object({
  identifiant_ssp: z.string(),
  nom: nullableString,
  nom_etablissement: nullableString,
  fiche_risque: nullableString,
  geom: Polygonal.nullish(),
});
const Cavity = z.object({ identifiant: z.string(), nom: nullableString, type: nullableString, longitude: z.number(), latitude: z.number() });
const Clay = z.object({ codeExposition: z.string().nullish() });

export interface Listing<T> {
  items: T[];
  /** Vrai quand la source avait plus d'éléments que les pages lues. */
  truncated: boolean;
}

export interface PlanInfo {
  id: string;
  kind: 'PPRN' | 'PPRT';
  label: string;
  model: string | null;
  /** « 27/02/2025 », tel que publié. */
  modifiedAt: string | null;
  zones: { code: string | null; label: string; name: string | null }[];
}

export interface PollutedSiteInfo {
  id: string;
  kind: 'SIS' | 'CASIAS';
  name: string | null;
  url: string | null;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] } | null;
}

function parse<S extends z.ZodType>(schema: S, items: readonly unknown[]): z.output<S>[] {
  return items.flatMap((raw) => {
    const r = schema.safeParse(raw);
    return r.success ? [r.data] : [];
  });
}

export class Georisques {
  constructor(private readonly http: Http) {}

  private async json(path: string, params: Record<string, string>): Promise<unknown> {
    const url = `${GEORISQUES_BASE}/${path}?${new URLSearchParams(params)}`;
    const r = await this.http.get({ url, timeoutMs: 10_000 });
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `Géorisques ${path} : HTTP ${r.status}`);
    try {
      return JSON.parse(r.body.toString('utf8'));
    } catch {
      throw new SourceError(SOURCE, 'invalid', `Géorisques ${path} : réponse illisible`);
    }
  }

  /** Liste paginée « data / total_pages » (format v1 courant). */
  private async list(path: string, params: Record<string, string>): Promise<Listing<unknown>> {
    const items: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const p = Page.safeParse(await this.json(path, { ...params, page: String(page), page_size: '100' }));
      if (!p.success) throw new SourceError(SOURCE, 'invalid', `Géorisques ${path} : réponse inattendue`);
      items.push(...p.data.data);
      if (page >= p.data.total_pages) return { items, truncated: false };
    }
    return { items, truncated: true };
  }

  /** Classe de potentiel radon de la commune (1 à 3), `null` si inconnue. */
  async radon(code: string): Promise<number | null> {
    return parse(Radon, (await this.list('radon', { code_insee: code })).items)[0]?.classe_potentiel ?? null;
  }

  /** Zone de sismicité (1 à 5), `null` si inconnue. */
  async seismic(code: string): Promise<number | null> {
    return parse(Seismic, (await this.list('zonage_sismique', { code_insee: code })).items)[0]?.code_zone ?? null;
  }

  /** Risques recensés par la base GASPAR sur la commune. */
  async hazards(code: string): Promise<{ code: string; label: string }[]> {
    const rows = parse(Hazards, (await this.list('gaspar/risques', { code_insee: code })).items);
    return rows.flatMap((r) => r.risques_detail.map((d) => ({ code: d.num_risque, label: d.libelle_risque_long })));
  }

  /** PPR naturels et technologiques de la commune, avec leurs zones réglementaires. */
  async plans(code: string): Promise<PlanInfo[]> {
    const plans: PlanInfo[] = [];
    for (const kind of ['PPRN', 'PPRT'] as const) {
      const page = SpringPage.safeParse(await this.json(`gaspar/${kind.toLowerCase()}`, { codeInsee: code, page: '1', page_size: '50' }));
      if (!page.success) throw new SourceError(SOURCE, 'invalid', `Géorisques ${kind} : réponse inattendue`);
      for (const p of parse(Plan, page.data.content)) {
        plans.push({
          id: p.idGaspar,
          kind,
          label: p.libPpr,
          model: p.modeleProcedure,
          modifiedAt: p.dateModification,
          zones: (p.zonageReglementaire?.listTypeReg ?? []).map((z) => ({ code: z.codeZone, label: z.libelle, name: z.nom })),
        });
      }
    }
    return plans;
  }

  /** Arrêtés de catastrophe naturelle de la commune. */
  async catnat(code: string): Promise<Listing<z.output<typeof CatNat>>> {
    const r = await this.list('gaspar/catnat', { code_insee: code });
    return { items: parse(CatNat, r.items), truncated: r.truncated };
  }

  async installations(code: string): Promise<Listing<z.output<typeof Installation>>> {
    const r = await this.list('installations_classees', { code_insee: code });
    return { items: parse(Installation, r.items), truncated: r.truncated };
  }

  /** Secteurs d'information sur les sols (SIS) et anciens sites industriels (CASIAS) de la commune. */
  async pollutedSites(code: string): Promise<Listing<PollutedSiteInfo>> {
    const [sis, casias] = await Promise.all([this.list('ssp/conclusions_sis', { code_insee: code }), this.list('ssp/casias', { code_insee: code })]);
    const map = (kind: PollutedSiteInfo['kind']) => (s: z.output<typeof PollutedSite>) => ({
      id: s.identifiant_ssp,
      kind,
      name: s.nom ?? s.nom_etablissement,
      url: s.fiche_risque,
      geometry: s.geom ?? null,
    });
    return { items: [...parse(PollutedSite, sis.items).map(map('SIS')), ...parse(PollutedSite, casias.items).map(map('CASIAS'))], truncated: sis.truncated || casias.truncated };
  }

  /** Cavités souterraines à moins de `radiusM` mètres d'un point. */
  async cavities(lon: number, lat: number, radiusM: number): Promise<Listing<z.output<typeof Cavity>>> {
    const r = await this.list('cavites', { latlon: `${lon.toFixed(6)},${lat.toFixed(6)}`, rayon: String(radiusM) });
    return { items: parse(Cavity, r.items), truncated: r.truncated };
  }

  /** Exposition au retrait-gonflement des argiles en un point : `'1'`, `'2'`, `'3'`, ou `null` hors zone. */
  async clay(lon: number, lat: number): Promise<string | null> {
    const url = `${GEORISQUES_BASE}/rga?${new URLSearchParams({ latlon: `${lon.toFixed(6)},${lat.toFixed(6)}` })}`;
    const r = await this.http.get({ url, timeoutMs: 8_000 });
    if (r.status !== 200) throw new SourceError(SOURCE, 'unavailable', `Géorisques rga : HTTP ${r.status}`);
    const text = r.body.toString('utf8').trim();
    // Hors zone d'exposition, la réponse est vide.
    if (text === '' || text === '{}') return null;
    try {
      return Clay.parse(JSON.parse(text)).codeExposition ?? null;
    } catch {
      throw new SourceError(SOURCE, 'invalid', 'Géorisques rga : réponse illisible');
    }
  }
}
