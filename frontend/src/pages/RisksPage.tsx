// Risques d'une étude (F-04) : synthèse des quatre axes, détail par parcelle (argiles, hauteurs d'eau,
// altitudes), par commune (PPR et leurs zones, CatNat), alentours (cavités, installations classées,
// sols pollués, bornes incendie), carte avec couches, sources. L'analyse se lance d'elle-même à la
// première ouverture (Q1), se recalcule à la demande quand les parcelles ont changé ; une source muette
// est dite « indisponible » (Q4).
import type { AnalysisStep, CommuneRisks, RiskLayer, StudyRisks } from '@contracts';
import { FLOOD_SCENARIO_LABELS, FLOOD_TYPE_LABELS, floodClassLabel } from '@domain';
import { AlertTriangle, ArrowLeft, Check, Circle, CircleX, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';

import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/dates';
import { useMapLayers } from '@/map/api';
import { useStudy } from '@/studies/api';
import { useRequestRisks, useStudyRisks } from '@/studies/risks-api';

const RiskMap = lazy(() => import('@/map/leaflet/RiskMap'));

type Result = NonNullable<StudyRisks['result']>;
type Known<T> = { status: 'ok'; data: T } | { status: 'unavailable'; error: string };

const SEVERITY_STYLE: Record<NonNullable<StudyRisks['axes']>[number]['severity'], string> = {
  high: 'border-red-300 bg-red-50 text-red-900',
  medium: 'border-orange-300 bg-orange-50 text-orange-900',
  low: 'border-yellow-300 bg-yellow-50 text-yellow-900',
  none: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  unknown: 'border-border bg-muted text-muted-foreground',
};
const PREFS_KEY = 'ardha.risks.layers';

function readPrefs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** La donnée, ou « indisponible » quand la source n'a pas répondu. */
function Value<T>({ of, children }: { of: Known<T>; children: (data: T) => ReactNode }) {
  if (of.status === 'unavailable') {
    return (
      <span className="text-muted-foreground" title={of.error}>
        Indisponible (source muette) : à vérifier
      </span>
    );
  }
  return <>{children(of.data)}</>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className="eyebrow text-primary">{title}</h2>
      {children}
    </section>
  );
}

const meters = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`);

const STEP_ICON: Record<AnalysisStep['state'], ReactNode> = {
  pending: <Circle className="size-4 text-muted-foreground" aria-hidden />,
  running: <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />,
  done: <Check className="size-4 text-primary" aria-hidden />,
  partial: <AlertTriangle className="size-4 text-orange-700" aria-hidden />,
  unavailable: <CircleX className="size-4 text-destructive" aria-hidden />,
};
const STEP_STATE: Record<AnalysisStep['state'], string> = { pending: 'à venir', running: 'en cours', done: 'fait', partial: 'en partie', unavailable: 'indisponible' };

const seconds = (st: AnalysisStep) =>
  st.startedAt && st.finishedAt ? `${((Date.parse(st.finishedAt) - Date.parse(st.startedAt)) / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : null;

/** Déroulé du calcul : chaque étape, son état, ce qu'elle a trouvé (ou pourquoi la source manque). */
function Progress({ steps }: { steps: AnalysisStep[] }) {
  return (
    <ol className="divide-y border text-sm" aria-label="Déroulé de l’analyse">
      {steps.map((st) => (
        <li key={st.key} className="flex items-start gap-3 px-3 py-2" data-state={st.state}>
          <span className="mt-0.5">{STEP_ICON[st.state]}</span>
          <div className="min-w-0 flex-1">
            <p className={st.state === 'pending' ? 'text-muted-foreground' : ''}>
              {st.label} <span className="sr-only">({STEP_STATE[st.state]})</span>
            </p>
            {st.detail && <p className="text-xs text-muted-foreground">{st.detail}</p>}
          </div>
          {seconds(st) && <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{seconds(st)}</span>}
        </li>
      ))}
    </ol>
  );
}

function Commune({ c }: { c: CommuneRisks }) {
  return (
    <div className="space-y-2 border p-3 text-sm">
      <p className="font-medium">
        {c.name ?? c.code} <span className="text-muted-foreground">({c.code})</span>
      </p>
      <p>
        <span className="text-muted-foreground">Risques recensés : </span>
        <Value of={c.hazards}>{(h) => (h.length ? h.map((x) => x.label).join(', ') : 'aucun')}</Value>
      </p>
      <div>
        <p className="text-muted-foreground">Plans de prévention des risques</p>
        <Value of={c.plans}>
          {(plans) =>
            plans.length === 0 ? (
              <p>Aucun PPR sur la commune.</p>
            ) : (
              <ul className="space-y-2">
                {plans.map((p) => (
                  <li key={p.id}>
                    <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      {p.label} <ExternalLink className="size-3" />
                    </a>
                    <span className="text-muted-foreground">
                      {' '}
                      · {p.model ?? p.kind}
                      {p.modifiedAt && ` · modifié le ${p.modifiedAt}`}
                    </span>
                    {(p.state || p.hazards.length > 0) && (
                      <p className="text-xs">
                        {p.state === 'approved' && `approuvé le ${p.approvedAt}${p.prescribedAt ? ` (prescrit le ${p.prescribedAt})` : ''}`}
                        {p.state === 'prescribed' && `prescrit le ${p.prescribedAt}, pas encore approuvé`}
                        {p.state === 'repealed' && 'abrogé ou annulé'}
                        {p.hazards.length > 0 && `${p.state ? ' · ' : ''}${p.hazards.join(', ')}`}
                        {p.prefectureUrl && (
                          <>
                            {' · '}
                            <a href={p.prefectureUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              page de la préfecture
                            </a>
                          </>
                        )}
                      </p>
                    )}
                    {p.zones.length > 0 && (
                      <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground">
                        {p.zones.map((z, i) => (
                          <li key={`${z.code}-${i}`}>
                            {z.code && <span className="font-mono">{z.code}</span>} {z.label}
                            {z.name && ` : ${z.name}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </Value>
      </div>
      <p>
        <span className="text-muted-foreground">Arrêtés de catastrophe naturelle : </span>
        <Value of={c.catnat}>
          {(n) => (
            <>
              {n.count}
              {n.latest.length > 0 && ` (dernier : ${n.latest[0]!.label}${n.latest[0]!.start ? `, ${n.latest[0]!.start}` : ''})`}
            </>
          )}
        </Value>
      </p>
    </div>
  );
}

function Parcels({ result }: { result: Result }) {
  return (
    <div className="overflow-x-auto border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Parcelle</th>
            <th className="px-3 py-2 font-medium">Argiles</th>
            <th className="px-3 py-2 font-medium">Inondation (TRI)</th>
            <th className="px-3 py-2 font-medium">Altitudes</th>
          </tr>
        </thead>
        <tbody className="divide-y align-top">
          {result.parcels.map((p) => (
            <tr key={p.id}>
              <td className="px-3 py-2 font-medium">{p.label}</td>
              <td className="px-3 py-2">
                <Value of={p.clay}>{(v) => v ?? 'hors zone'}</Value>
              </td>
              <td className="px-3 py-2">
                <Value of={p.flood}>
                  {(f) =>
                    f.scenarios.length === 0 ? (
                      'hors zone'
                    ) : (
                      <>
                        <p>Aléa {f.hazard}</p>
                        <ul className="text-xs text-muted-foreground">
                          {f.scenarios.map((s) => (
                            <li key={`${s.type}-${s.scenario}`}>
                              {FLOOD_SCENARIO_LABELS[s.scenario]} : {floodClassLabel(s)}
                              {s.type !== '01' && ` (${FLOOD_TYPE_LABELS[s.type].toLowerCase()})`}
                            </li>
                          ))}
                        </ul>
                      </>
                    )
                  }
                </Value>
              </td>
              <td className="px-3 py-2 tabular-nums">
                <Value of={p.elevation}>
                  {(e) =>
                    e ? (
                      <>
                        <p>
                          {e.min.toLocaleString('fr-FR')} à {e.max.toLocaleString('fr-FR')} m
                        </p>
                        <p className="text-xs text-muted-foreground">moyenne {e.mean.toLocaleString('fr-FR')} m</p>
                      </>
                    ) : (
                      'aucune'
                    )
                  }
                </Value>
                {p.floodLevel && (
                  <p className="text-xs text-muted-foreground">
                    cote de crue indicative : {p.floodLevel.atLeast ? 'au moins ' : ''}
                    {p.floodLevel.level.toLocaleString('fr-FR')} m NGF
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Nearby({ result }: { result: Result }) {
  return (
    <ul className="divide-y border text-sm">
      <li className="px-3 py-2">
        <p className="font-medium">Cavités souterraines à moins de {meters(result.radii.nearbyM)}</p>
        <Value of={result.cavities}>
          {(c) => (c.items.length === 0 ? <p className="text-muted-foreground">Aucune.</p> : <p>{c.items.length}, la plus proche à {meters(c.items[0]!.distanceM)}</p>)}
        </Value>
      </li>
      <li className="px-3 py-2">
        <p className="font-medium">Installations classées à moins de {meters(result.radii.nearbyM)}</p>
        <Value of={result.installations}>
          {(i) => (
            <>
              <p className="text-muted-foreground">
                {i.items.length} sur {i.count} dans la commune
              </p>
              <ul className="text-xs">
                {i.items.slice(0, 5).map((x) => (
                  <li key={`${x.id}-${x.name}`}>
                    {x.name} · {meters(x.distanceM)}
                    {x.regime && ` · ${x.regime}`}
                    {x.seveso && x.seveso !== 'Non Seveso' && <strong className="text-destructive"> · {x.seveso}</strong>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Value>
      </li>
      <li className="px-3 py-2">
        <p className="font-medium">Sols pollués à moins de {meters(result.radii.nearbyM)}</p>
        <Value of={result.pollutedSites}>
          {(s) =>
            s.items.length === 0 ? (
              <p className="text-muted-foreground">Aucun ({s.count} dans la commune).</p>
            ) : (
              <ul className="text-xs">
                {s.items.map((x) => (
                  <li key={x.id}>
                    <span className="font-medium">{x.kind}</span> {x.name ?? x.id} · {meters(x.distanceM)}
                    {x.url && (
                      <a href={x.url} target="_blank" rel="noreferrer" className="ml-1 text-primary hover:underline">
                        fiche
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </Value>
      </li>
      <li className="px-3 py-2">
        <p className="font-medium">Bornes incendie à moins de {meters(result.radii.hydrantsM)} (OpenStreetMap, indicatif)</p>
        {result.hydrants.status === 'ok' && <p className="text-xs text-muted-foreground">Données OSM du {formatDate(result.hydrants.data.asOf)}</p>}
        <Value of={result.hydrants}>
          {(h) => (h.items.length === 0 ? <p className="text-muted-foreground">Aucune connue.</p> : <p>{h.items.length}, la plus proche à {meters(h.items[0]!.distanceM)}</p>)}
        </Value>
      </li>
    </ul>
  );
}

export function RisksPage() {
  const id = useParams().id!;
  const study = useStudy(id);
  const risks = useStudyRisks(id);
  const request = useRequestRisks(id);
  const layers = useMapLayers();
  const [shown, setShown] = useState<string[]>(readPrefs);
  const asked = useRef(false);

  // Première ouverture : l'analyse se demande d'elle-même (Q1).
  const status = risks.data?.status;
  const editable = study.data?.deletedAt === null;
  useEffect(() => {
    if (status === 'none' && editable && !asked.current) {
      asked.current = true;
      request.mutate(false);
    }
  }, [status, editable, request]);

  function toggle(layerId: string) {
    const next = shown.includes(layerId) ? shown.filter((l) => l !== layerId) : [...shown, layerId];
    setShown(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // Préférence de confort : sans stockage, elle ne dure que la visite.
    }
  }

  if (study.isError || risks.isError) {
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
  if (!study.data || !risks.data) return <Loading />;
  const s = study.data;
  const r = risks.data;
  const result = r.result;
  const busy = r.status === 'queued' || r.status === 'running' || request.isPending;
  const riskLayers: RiskLayer[] = layers.data?.riskLayers ?? [];
  const basemap = layers.data && (layers.data.basemaps.find((b) => b.id === layers.data.defaultBasemap) ?? layers.data.basemaps[0]!);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <Link to={`/studies/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour à l’étude
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="eyebrow text-primary">Risques</p>
          <h1 className="text-2xl">{s.name}</h1>
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            {busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> Analyse en cours…
              </>
            ) : r.computedAt ? (
              `Analyse du ${formatDate(r.computedAt)}`
            ) : (
              'Analyse pas encore faite'
            )}
          </p>
        </div>
        {editable && (
          <Button variant="outline" disabled={busy} onClick={() => request.mutate(true)}>
            <RefreshCw /> Recalculer
          </Button>
        )}
      </div>

      {r.stale && !busy && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <AlertTriangle className="size-4" />
          <p className="flex-1">Les parcelles de l’étude ont changé depuis cette analyse : elle ne vaut plus pour elles.</p>
          {editable && (
            <Button size="sm" onClick={() => request.mutate(false)}>
              Recalculer
            </Button>
          )}
        </div>
      )}
      {busy && r.progress.length > 0 && (
        <Section title="Calcul en cours">
          <Progress steps={r.progress} />
        </Section>
      )}
      {(r.status === 'failed' || request.error) && (
        <p role="alert" className="text-sm text-destructive">
          {request.error?.message ?? r.error}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {r.axes && (
            <Section title="Synthèse">
              <ul className="grid gap-2 sm:grid-cols-2">
                {r.axes.map((a) => (
                  <li key={a.key} className={`border px-3 py-2 ${SEVERITY_STYLE[a.severity]}`} data-severity={a.severity}>
                    <p className="text-xs font-medium tracking-wide uppercase opacity-80">{a.label}</p>
                    <p className="font-semibold">{a.state}</p>
                    {a.detail && <p className="text-xs">{a.detail}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {r.surcharges && (
            <Section title="Surcoûts indicatifs">
              {r.surcharges.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun surcoût de construction lié aux risques connus.</p>
              ) : (
                <div className="space-y-2">
                  <ul className="divide-y border text-sm">
                    {r.surcharges.map((c) => (
                      <li key={c.key} className="flex items-start gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{c.label}</p>
                          <p className="text-xs text-muted-foreground">{c.basis}</p>
                          <p className={`text-xs ${c.sourced ? 'text-muted-foreground' : 'text-orange-800'}`}>{c.source}</p>
                        </div>
                        <span className="tabular-nums whitespace-nowrap">+{c.perM2.toLocaleString('fr-FR')} €/m²</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    En € HT par m² de surface de plancher, à ajouter au coût de construction : total +
                    {r.surcharges.reduce((t, c) => t + c.perM2, 0).toLocaleString('fr-FR')} €/m². Ajustables dans la faisabilité (à venir).
                  </p>
                </div>
              )}
            </Section>
          )}
          {result && (
            <>
              <Section title="Par parcelle">
                <Parcels result={result} />
              </Section>
              <Section title={result.communes.length > 1 ? 'Communes' : 'Commune'}>
                {result.communes.map((c) => (
                  <Commune key={c.code} c={c} />
                ))}
              </Section>
              <Section title="Alentours">
                <Nearby result={result} />
              </Section>
            </>
          )}
          {!result && !busy && r.status !== 'failed' && <p className="text-sm text-muted-foreground">Aucune analyse pour l’instant.</p>}
          {!busy && r.progress.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Déroulé de l’analyse ({r.progress.length} étapes
                {r.progress.some((s) => s.state === 'partial' || s.state === 'unavailable') ? ', dont certaines sans réponse' : ''})
              </summary>
              <div className="mt-2">
                <Progress steps={r.progress} />
              </div>
            </details>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="h-80 border md:h-[28rem]">
            {basemap ? (
              <Suspense fallback={<Loading />}>
                <RiskMap
                  basemap={basemap}
                  layers={riskLayers.filter((l) => shown.includes(l.id))}
                  parcels={s.parcels}
                  hydrants={result?.hydrants.status === 'ok' ? result.hydrants.data.items.map((h) => ({ id: h.id, point: h.point, label: `Borne incendie · ${meters(h.distanceM)}` })) : []}
                  cavities={result?.cavities.status === 'ok' ? result.cavities.data.items.map((c) => ({ id: c.id, point: c.point, label: `Cavité ${c.type ?? ''} · ${c.name ?? c.id}` })) : []}
                />
              </Suspense>
            ) : (
              <Loading />
            )}
          </div>
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 text-muted-foreground">Couches de risques</legend>
            {riskLayers.map((l) => (
              <label key={l.id} className="flex items-center gap-2">
                <input type="checkbox" checked={shown.includes(l.id)} onChange={() => toggle(l.id)} />
                {l.label}
              </label>
            ))}
          </fieldset>
          <Section title="Sources">
            <ul className="space-y-1 text-xs text-muted-foreground">
              {r.sources.map((src) => (
                <li key={src.key}>
                  <a href={src.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {src.label}
                  </a>{' '}
                  · {src.licence}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Informations indicatives : seuls les documents officiels (PPR, arrêtés, règlement d’urbanisme) font foi.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
