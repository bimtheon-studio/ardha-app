// Foncier et marché d'une étude (F-05) : prix au m² des ventes comparables autour des parcelles
// (maisons, appartements, terrains ; ancien et neuf), tendance sur un an, historique, prix du neuf du
// département (ECLN), logements autorisés (Sitadel), indices INSEE ; carte et liste des ventes, avec
// les parcelles vendues. L'analyse se lance d'elle-même à la première ouverture ; le rayon se choisit
// (Q2) ; une source muette est dite « indisponible ».
import type { MarketResult, MarketSale, StudyMarket } from '@contracts';
import { MARKET_RADII, newBuildPremiumPct, PRICE_GRADIENT, priceColor, priceScale, type SaleCategory, type SaleSegment } from '@domain';
import { AlertTriangle, ArrowLeft, LoaderCircle, RefreshCw } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';

import { LiveProgress, Progress, Section, Value } from '@/components/AnalysisProgress';
import { Loading } from '@/components/Loading';
import { PriceChart, type Series } from '@/components/PriceChart';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/dates';
import { useMapLayers } from '@/map/api';
import { useStudy } from '@/studies/api';
import { type SalesFilters, useMarketSales, useRequestMarket, useStudyMarket } from '@/studies/market-api';

const MarketMap = lazy(() => import('@/map/leaflet/MarketMap'));

type Result = NonNullable<StudyMarket['result']>;
type Radius = MarketResult['radiusM'];
type Dvf = Extract<Result['dvf'], { status: 'ok' }>['data'];
type Indicator = Dvf['indicators'][number];

const CATEGORY: Record<SaleCategory, string> = { apartment: 'Appartements', house: 'Maisons', land: 'Terrains à bâtir' };
const SEGMENT: Record<SaleSegment, string> = { existing: 'Ancien', new: 'Neuf (VEFA)' };
const PROPERTY: Record<MarketSale['propertyType'], string> = {
  house: 'Maison',
  apartment: 'Appartement',
  land: 'Terrain',
  commercial: 'Local d’activité',
  outbuilding: 'Dépendance',
  other: 'Autre',
};
const HOUSING: Record<string, string> = { collective: 'Collectif', individual: 'Individuel' };
const PERMIT_TYPES: Record<string, string> = {
  'individual-detached': 'individuel pur',
  'individual-grouped': 'individuel groupé',
  collective: 'collectif',
  residence: 'résidence',
};
const SERIES: Series[] = [
  { key: 'apartment-existing', label: 'Appartements anciens', color: '#0033A8', match: (p) => p.category === 'apartment' && p.segment === 'existing' },
  { key: 'house-existing', label: 'Maisons anciennes', color: '#C1272D', match: (p) => p.category === 'house' && p.segment === 'existing' },
  { key: 'apartment-new', label: 'Appartements neufs (VEFA)', color: '#2E9E6A', match: (p) => p.category === 'apartment' && p.segment === 'new' },
  { key: 'house-new', label: 'Maisons neuves (VEFA)', color: '#D98E04', match: (p) => p.category === 'house' && p.segment === 'new' },
];

const perM2 = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €/m²`;
const euros = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`;
const meters = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`);
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('fr-FR')} %`;
const dayMonthYear = (d: string) => d.split('-').reverse().join('/');

function Trend({ value }: { value: number | null }) {
  if (value === null) return null;
  const tone = value > 0 ? 'text-emerald-800' : value < 0 ? 'text-red-800' : 'text-muted-foreground';
  return <span className={`text-xs tabular-nums ${tone}`}>{pct(value)} sur un an</span>;
}

/** Un type de bien : le prix courant de l'ancien et du neuf, leur fourchette et leur effectif. */
function PriceCard({ category, indicators }: { category: SaleCategory; indicators: Indicator[] }) {
  const rows = indicators.filter((i) => i.category === category && (category !== 'land' || i.segment === 'existing'));
  return (
    <li className="space-y-2 border p-3" data-category={category}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{CATEGORY[category]}</p>
      {rows.map((i) =>
        i.current ? (
          <div key={i.segment} data-segment={i.segment}>
            <p className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="text-sm">{category === 'land' ? 'Prix du terrain' : SEGMENT[i.segment]}</span>
              <span className="text-lg font-semibold tabular-nums">{perM2(i.current.median)}</span>
            </p>
            <p className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {perM2(i.current.p25)} à {perM2(i.current.p75)} · {i.current.count} vente{i.current.count > 1 ? 's' : ''}
              </span>
              <Trend value={i.trendPct} />
            </p>
            {i.lowSample && <p className="text-xs text-orange-800">Peu de ventes : prix à prendre avec prudence.</p>}
          </div>
        ) : (
          <p key={i.segment} className="text-sm text-muted-foreground" data-segment={i.segment}>
            {category === 'land' ? 'Prix du terrain' : SEGMENT[i.segment]} : aucune vente sur 12 mois
          </p>
        ),
      )}
    </li>
  );
}

function Prices({ dvf, radiusM, next, onWiden }: { dvf: Dvf; radiusM: number; next: Radius | null; onWiden: ((r: Radius) => void) | null }) {
  const main = dvf.indicators.filter((i) => i.category !== 'land' && i.segment === 'existing');
  const few = main.every((i) => i.lowSample);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Médianes des ventes des 12 mois jusqu’au {dvf.horizon ? dayMonthYear(dvf.horizon) : '—'}, dans {meters(radiusM)} : {dvf.comparableCount} vente{dvf.comparableCount > 1 ? 's' : ''} comparable
        {dvf.comparableCount > 1 ? 's' : ''} sur {dvf.saleCount} (ventes d’une seule maison ou d’un seul appartement, terrains à bâtir).
      </p>
      {few && (
        <div role="note" className="flex flex-wrap items-center gap-3 border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <AlertTriangle className="size-4" />
          <p className="flex-1">Moins de 20 ventes de logements anciens sur 12 mois dans ce rayon.</p>
          {next && onWiden && (
            <Button size="sm" variant="outline" onClick={() => onWiden(next)}>
              Élargir à {meters(next)}
            </Button>
          )}
        </div>
      )}
      <ul className="grid gap-2 sm:grid-cols-3">
        {(['apartment', 'house', 'land'] as const).map((c) => (
          <PriceCard key={c} category={c} indicators={dvf.indicators} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Prix au m² de surface bâtie (le terrain d’une maison est compris), au m² de terrain pour les terrains. Fourchette : 1er et 3e quartiles.</p>
    </div>
  );
}

function History({ dvf }: { dvf: Dvf }) {
  const [quarterly, setQuarterly] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-xs" role="group" aria-label="Pas de l’historique">
        {[false, true].map((q) => (
          <button key={String(q)} type="button" aria-pressed={quarterly === q} onClick={() => setQuarterly(q)} className={`border px-2 py-1 ${quarterly === q ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
            {q ? 'Par trimestre' : 'Par année'}
          </button>
        ))}
      </div>
      <PriceChart points={quarterly ? dvf.history.quarter : dvf.history.year} series={SERIES} title={`Prix médian au m² ${quarterly ? 'par trimestre' : 'par année'}`} />
    </div>
  );
}

function NewBuild({ result }: { result: Result }) {
  const dvf = result.dvf.status === 'ok' ? result.dvf.data : null;
  const of = (category: SaleCategory, segment: SaleSegment) => dvf?.indicators.find((i) => i.category === category && i.segment === segment)?.current;
  const vefa = of('apartment', 'new');
  const premium = newBuildPremiumPct(vefa?.median, of('apartment', 'existing')?.median);
  return (
    <div className="space-y-3 text-sm">
      <div className="border p-3">
        <p className="font-medium">Ventes en VEFA dans le rayon (DVF)</p>
        {vefa ? (
          <p>
            Appartements : <span className="font-semibold tabular-nums">{perM2(vefa.median)}</span> ({vefa.count} vente{vefa.count > 1 ? 's' : ''})
            {premium !== null && <span className="text-muted-foreground"> · {pct(premium)} sur l’ancien</span>}
          </p>
        ) : (
          <p className="text-muted-foreground">Aucune vente d’appartement en VEFA sur 12 mois.</p>
        )}
        <p className="text-xs text-muted-foreground">Ventes réelles, publiées avec 6 mois à 2 ans de décalage.</p>
      </div>
      <div className="border p-3">
        <p className="font-medium">Logements neufs réservés dans le département (ECLN)</p>
        <Value of={result.newBuild}>
          {(n) => {
            const rows = n.quarters.filter((q) => q.housingType !== 'all');
            return rows.length === 0 ? (
              <p className="text-muted-foreground">Pas de chiffres publiés pour ce département.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2 font-medium">Trimestre</th>
                      <th className="py-1 pr-2 font-medium">Type</th>
                      <th className="py-1 pr-2 text-right font-medium">Prix</th>
                      <th className="py-1 pr-2 text-right font-medium">Réservations</th>
                      <th className="py-1 text-right font-medium">Délai</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {rows.map((q) => (
                      <tr key={`${q.quarter}-${q.housingType}`} className="border-t">
                        <td className="py-1 pr-2">{q.quarter}</td>
                        <td className="py-1 pr-2">{HOUSING[q.housingType]}</td>
                        <td className="py-1 pr-2 text-right">{q.housingType === 'collective' ? (q.pricePerM2 ? perM2(q.pricePerM2) : '—') : q.averagePrice ? euros(q.averagePrice) : q.pricePerM2 ? perM2(q.pricePerM2) : '—'}</td>
                        <td className="py-1 pr-2 text-right">{q.reservations ?? '—'}</td>
                        <td className="py-1 text-right">{q.monthsToSell !== null ? `${q.monthsToSell.toLocaleString('fr-FR')} mois` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }}
        </Value>
        <p className="text-xs text-muted-foreground">Prix moyen des réservations (au m² en collectif, par logement en individuel) ; délai d’écoulement du stock.</p>
      </div>
    </div>
  );
}

function Permits({ result }: { result: Result }) {
  return (
    <Value of={result.permits}>
      {(p) => {
        const years = [...new Set(p.rows.map((r) => r.year))].sort((a, b) => b - a);
        if (years.length === 0) return <p className="text-sm text-muted-foreground">Aucun logement autorisé publié pour la commune.</p>;
        return (
          <div className="overflow-x-auto border">
            <table className="w-full text-sm">
              <caption className="px-3 pt-2 text-left text-xs text-muted-foreground">
                {p.communeName ?? p.communeCode} · données du {formatDate(p.asOf)}
              </caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-1 font-medium">Année</th>
                  <th className="px-3 py-1 text-right font-medium">Autorisés</th>
                  <th className="px-3 py-1 text-right font-medium">Commencés</th>
                  <th className="hidden px-3 py-1 font-medium sm:table-cell">Dont autorisés</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {years.map((y) => {
                  const all = p.rows.find((r) => r.year === y && r.housingType === 'all');
                  const parts = p.rows.filter((r) => r.year === y && r.housingType !== 'all' && r.authorizedUnits);
                  return (
                    <tr key={y} className="border-t">
                      <td className="px-3 py-1">{y}</td>
                      <td className="px-3 py-1 text-right">{all?.authorizedUnits ?? '—'}</td>
                      <td className="px-3 py-1 text-right">{all?.startedUnits ?? '—'}</td>
                      <td className="hidden px-3 py-1 text-xs text-muted-foreground sm:table-cell">{parts.map((r) => `${r.authorizedUnits} ${PERMIT_TYPES[r.housingType] ?? r.housingType}`).join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }}
    </Value>
  );
}

function Indices({ result }: { result: Result }) {
  return (
    <Value of={result.indices}>
      {(list) => (
        <ul className="divide-y border text-sm">
          {list.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
              <span className="min-w-0 flex-1">{i.label}</span>
              <span className="tabular-nums">
                {i.last.value.toLocaleString('fr-FR')} <span className="text-xs text-muted-foreground">({i.last.period})</span>
              </span>
              {i.yearChangePct !== null && <span className="w-full text-xs text-muted-foreground sm:w-auto">{pct(i.yearChangePct)} sur un an</span>}
            </li>
          ))}
        </ul>
      )}
    </Value>
  );
}

const saleLabel = (s: MarketSale) =>
  `${PROPERTY[s.propertyType]}${s.vefa ? ' neuf' : ''} · ${euros(s.price)}${s.pricePerM2 ? ` · ${perM2(s.pricePerM2)}` : ''} · ${dayMonthYear(s.date)}`;

function SaleRow({ sale, selected, onSelect }: { sale: MarketSale; selected: boolean; onSelect: () => void }) {
  const area = sale.builtArea ? `${sale.builtArea.toLocaleString('fr-FR')} m²` : sale.landArea ? `${sale.landArea.toLocaleString('fr-FR')} m² de terrain` : null;
  return (
    <li>
      <button type="button" onClick={onSelect} aria-pressed={selected} className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${selected ? 'bg-primary/10' : ''}`}>
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">
            {PROPERTY[sale.propertyType]}
            {sale.vefa && <span className="ml-1 text-xs text-emerald-800">neuf (VEFA)</span>}
            {sale.dwellingCount > 1 && <span className="ml-1 text-xs text-muted-foreground">{sale.dwellingCount} logements</span>}
          </span>
          <span className="tabular-nums">{euros(sale.price)}</span>
        </span>
        <span className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
          <span>
            {dayMonthYear(sale.date)} · {meters(sale.distanceM)}
            {area && ` · ${area}`}
            {sale.rooms ? ` · ${sale.rooms} p.` : ''}
          </span>
          <span className="tabular-nums">{sale.pricePerM2 ? perM2(sale.pricePerM2) : 'hors prix'}</span>
        </span>
        {sale.address && <span className="block truncate text-xs text-muted-foreground">{sale.address}</span>}
      </button>
    </li>
  );
}

const PAGE = 50;

function Sales({ id, radiusM, computedAt, basemap, study, center }: { id: string; radiusM: number; computedAt: string | null; basemap: Parameters<typeof MarketMap>[0]['basemap'] | undefined; study: Parameters<typeof MarketMap>[0]['parcels']; center: [number, number] | null }) {
  const [filters, setFilters] = useState<SalesFilters>({ type: 'all', segment: 'all' });
  const [order, setOrder] = useState<'date' | 'distance'>('date');
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const sales = useMarketSales(id, radiusM, computedAt, filters);
  const list = useMemo(() => {
    const all = sales.data?.sales ?? [];
    return order === 'date' ? all : [...all].sort((a, b) => a.distanceM - b.distanceM);
  }, [sales.data, order]);
  const scale = useMemo(() => priceScale(list.map((s) => s.pricePerM2 ?? 0)), [list]);
  const color = (s: MarketSale) => (s.pricePerM2 && scale ? priceColor(s.pricePerM2, scale) : '#8A8F98');
  const thisYear = new Date().getFullYear();
  const mapCenter = sales.data?.center ?? center;
  return (
    <div className="space-y-3">
      <div className="h-80 border md:h-[28rem]">
        {basemap && mapCenter ? (
          <Suspense fallback={<Loading />}>
            <MarketMap basemap={basemap} parcels={study} center={mapCenter} radiusM={radiusM} sales={list} color={color} selectedId={selected} onSelect={setSelected} label={saleLabel} />
          </Suspense>
        ) : (
          <Loading />
        )}
      </div>
      {scale && (
        <div className="space-y-1" aria-label="Échelle des prix au m²">
          <div className="h-2" style={{ background: `linear-gradient(to right, ${PRICE_GRADIENT.map(([t, [r, g, b]]) => `rgb(${r},${g},${b}) ${t * 100}%`).join(', ')})` }} />
          <p className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{perM2(scale.lo)}</span>
            <span>prix au m² des ventes affichées</span>
            <span>{perM2(scale.hi)}</span>
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        <label className="flex items-center gap-1">
          <span className="sr-only">Type de bien</span>
          <select className="border bg-background px-2 py-1" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value as SalesFilters['type'] })} aria-label="Type de bien">
            <option value="all">Tous les biens</option>
            <option value="apartment">Appartements</option>
            <option value="house">Maisons</option>
            <option value="land">Terrains</option>
            <option value="commercial">Locaux d’activité</option>
            <option value="outbuilding">Dépendances</option>
          </select>
        </label>
        <select className="border bg-background px-2 py-1" value={filters.segment} onChange={(e) => setFilters({ ...filters, segment: e.target.value as SalesFilters['segment'] })} aria-label="Ancien ou neuf">
          <option value="all">Ancien et neuf</option>
          <option value="existing">Ancien</option>
          <option value="new">Neuf (VEFA)</option>
        </select>
        <select
          className="border bg-background px-2 py-1"
          value={filters.from ?? ''}
          onChange={(e) => setFilters({ type: filters.type, segment: filters.segment, ...(e.target.value && { from: Number(e.target.value) }) })}
          aria-label="Période"
        >
          <option value="">Toutes les années</option>
          {[1, 2, 3].map((n) => (
            <option key={n} value={thisYear - n}>
              Depuis {thisYear - n}
            </option>
          ))}
        </select>
        <select className="border bg-background px-2 py-1" value={order} onChange={(e) => setOrder(e.target.value as 'date' | 'distance')} aria-label="Ordre">
          <option value="date">Plus récentes</option>
          <option value="distance">Plus proches</option>
        </select>
      </div>
      {sales.data && (
        <p className="text-xs text-muted-foreground" role="status">
          {sales.data.truncated ? `Les ${list.length} ventes les plus récentes` : `${list.length} vente${list.length > 1 ? 's' : ''}`} dans {meters(radiusM)}
          {list.some((s) => s.parcels.length > 0) && ' · parcelles vendues en couleur sur la carte'}
        </p>
      )}
      {sales.isError && <p className="text-sm text-destructive">Les ventes n’ont pas pu être lues.</p>}
      <ul className="max-h-[32rem] divide-y overflow-y-auto border" aria-label="Ventes">
        {list.slice(0, limit).map((s) => (
          <SaleRow key={s.id} sale={s} selected={s.id === selected} onSelect={() => setSelected(s.id)} />
        ))}
      </ul>
      {list.length > limit && (
        <Button variant="outline" size="sm" onClick={() => setLimit(limit + PAGE)}>
          Voir {Math.min(PAGE, list.length - limit)} ventes de plus
        </Button>
      )}
    </div>
  );
}

export function MarketPage() {
  const id = useParams().id!;
  const study = useStudy(id);
  const market = useStudyMarket(id);
  const request = useRequestMarket(id);
  const layers = useMapLayers();
  const asked = useRef(false);

  // Première ouverture : l'analyse se demande d'elle-même.
  const status = market.data?.status;
  const editable = study.data?.deletedAt === null;
  useEffect(() => {
    if (status === 'none' && editable && !asked.current) {
      asked.current = true;
      request.mutate({});
    }
  }, [status, editable, request]);

  if (study.isError || market.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-12">
        <h1 className="text-2xl">Étude introuvable</h1>
        <Button variant="outline" asChild>
          <Link to="/">
            <ArrowLeft /> Mes études
          </Link>
        </Button>
      </div>
    );
  }
  if (!study.data || !market.data) return <Loading />;
  const s = study.data;
  const m = market.data;
  const busy = m.status === 'queued' || m.status === 'running' || request.isPending;
  const result = m.result;
  const radius = (request.isPending && request.variables.radiusM) || m.radiusM;
  const next = (MARKET_RADII.find((r) => r > radius) ?? null) as Radius | null;
  const basemap = layers.data && (layers.data.basemaps.find((b) => b.id === layers.data.defaultBasemap) ?? layers.data.basemaps[0]!);
  const widen = editable ? (r: Radius) => request.mutate({ radiusM: r }) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <Link to={`/studies/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour à l’étude
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="eyebrow text-primary">Foncier et marché</p>
          <h1 className="text-2xl">{s.name}</h1>
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            {busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> Analyse en cours…
              </>
            ) : m.computedAt ? (
              `Analyse du ${formatDate(m.computedAt)}`
            ) : (
              'Analyse pas encore faite'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex" role="group" aria-label="Rayon des ventes comparables">
            {MARKET_RADII.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={radius === r}
                disabled={!editable || busy}
                onClick={() => request.mutate({ radiusM: r as Radius })}
                className={`-ml-px border px-2.5 py-1.5 text-sm first:ml-0 disabled:opacity-60 ${radius === r ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {meters(r)}
              </button>
            ))}
          </div>
          {editable && (
            <Button variant="outline" disabled={busy} onClick={() => request.mutate({ force: true })}>
              <RefreshCw /> Recalculer
            </Button>
          )}
        </div>
      </div>

      {(m.stale || m.newerData) && !busy && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <AlertTriangle className="size-4" />
          <p className="flex-1">{m.stale ? 'Les parcelles ou le rayon ont changé depuis cette analyse : elle ne vaut plus pour eux.' : 'Des ventes DVF plus récentes sont en base : recalculez pour en tenir compte.'}</p>
          {editable && (
            <Button size="sm" onClick={() => request.mutate({ force: !m.stale })}>
              Recalculer
            </Button>
          )}
        </div>
      )}
      {busy && <LiveProgress steps={m.progress} />}
      {(m.status === 'failed' || request.error) && (
        <p role="alert" className="text-sm text-destructive">
          {request.error?.message ?? m.error}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {result && (
            <>
              <Section title="Prix au m²">
                {!result.covered ? (
                  <p className="border bg-muted px-3 py-2 text-sm">DVF ne couvre pas l’Alsace-Moselle ni Mayotte (livre foncier) : pas de prix de vente pour cette étude.</p>
                ) : (
                  <Value of={result.dvf}>{(dvf) => <Prices dvf={dvf} radiusM={result.radiusM} next={next} onWiden={widen} />}</Value>
                )}
              </Section>
              {result.dvf.status === 'ok' && (
                <Section title="Historique">
                  <History dvf={result.dvf.data} />
                </Section>
              )}
              <Section title="Neuf">
                <NewBuild result={result} />
              </Section>
              <Section title="Logements autorisés (Sitadel)">
                <Permits result={result} />
              </Section>
              <Section title="Indices INSEE">
                <Indices result={result} />
              </Section>
            </>
          )}
          {!result && !busy && m.status !== 'failed' && <p className="text-sm text-muted-foreground">Aucune analyse pour l’instant.</p>}
          {!busy && m.progress.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Déroulé de l’analyse ({m.progress.length} étapes
                {m.progress.some((st) => st.state === 'partial' || st.state === 'unavailable') ? ', dont certaines sans réponse' : ''})
              </summary>
              <div className="mt-2">
                <Progress steps={m.progress} />
              </div>
            </details>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Section title="Ventes">
            <Sales id={id} radiusM={m.radiusM} computedAt={m.computedAt} basemap={basemap} study={s.parcels} center={result?.center ?? null} />
          </Section>
          <Section title="Sources">
            <ul className="space-y-1 text-xs text-muted-foreground">
              {m.sources.map((src) => (
                <li key={src.key}>
                  <a href={src.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {src.label}
                  </a>{' '}
                  · {src.licence}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Ventes publiées par la DGFiP deux fois par an, sans l’Alsace-Moselle ni Mayotte. Prix indicatifs : ils ne remplacent pas une estimation.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
