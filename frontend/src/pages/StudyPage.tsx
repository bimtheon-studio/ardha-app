// Page d'une étude (F-02, Q7) : la fiche (nom, adresse, commune, parcelles, surfaces), la carte
// cadrée sur les parcelles, les étapes ; renommer, changer d'adresse, modifier les parcelles,
// dupliquer, mettre à la corbeille. Une seule colonne sur mobile.
import type { Study } from '@contracts';
import { formatArea } from '@domain';
import { ArrowLeft, Check, Circle, Copy, LoaderCircle, MapPinned, Pencil, Trash2, Undo2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/dates';
import { useMapLayers } from '@/map/api';
import type { TrashedState } from '@/pages/Home';
import { useDuplicateStudy, useRestoreStudy, useStudy, useTrashStudy, useUpdateStudy } from '@/studies/api';

const StudyMap = lazy(() => import('@/map/leaflet/StudyMap'));

/** Écran de chaque étape livrée, sous `/studies/:id/`. */
const STEP_LINKS: Partial<Record<Study['steps'][number]['key'], string>> = { parcels: 'map', risks: 'risks', land: 'market' };

function Rename({ study, onDone }: { study: Study; onDone: () => void }) {
  const update = useUpdateStudy(study.id);
  const [name, setName] = useState(study.name);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({ name }, { onSuccess: onDone });
      }}
    >
      <label className="sr-only" htmlFor="study-name">
        Nom de l’étude
      </label>
      <Input id="study-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
      {update.error && (
        <p role="alert" className="text-sm text-destructive">
          {update.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={update.isPending}>
          Enregistrer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function AddressChoice({ study, onDone }: { study: Study; onDone: () => void }) {
  const update = useUpdateStudy(study.id);
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-sm text-muted-foreground">Adresses rattachées aux parcelles</legend>
      {study.addresses.map((a) => (
        <label key={a.id} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="address"
            checked={a.id === study.address?.id}
            disabled={update.isPending}
            onChange={() => update.mutate({ addressId: a.id }, { onSuccess: onDone })}
          />
          {a.label}
        </label>
      ))}
      {update.error && (
        <p role="alert" className="text-sm text-destructive">
          {update.error.message}
        </p>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Fermer
      </Button>
    </fieldset>
  );
}

function AddressValue({ study }: { study: Study }) {
  if (study.addressPending) return <span className="text-muted-foreground">Recherche de l’adresse…</span>;
  return <span>{study.address?.label ?? 'Aucune adresse trouvée sur ces parcelles'}</span>;
}

export function StudyPage() {
  const id = useParams().id!;
  const study = useStudy(id);
  const layers = useMapLayers();
  const navigate = useNavigate();
  const duplicate = useDuplicateStudy();
  const trash = useTrashStudy();
  const restore = useRestoreStudy();
  const [editing, setEditing] = useState<'name' | 'address' | null>(null);

  if (study.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-12">
        <h1 className="text-2xl">Étude introuvable</h1>
        <p className="text-muted-foreground">{study.error.message}</p>
        <Button variant="outline" asChild>
          <Link to="/">
            <ArrowLeft /> Mes études
          </Link>
        </Button>
      </div>
    );
  }
  if (!study.data) return <Loading />;
  const s = study.data;
  const inTrash = s.deletedAt !== null;
  const actionError = duplicate.error ?? trash.error ?? restore.error;
  const version = [...new Set(s.parcels.map((p) => p.version))].join(', ');

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Mes études
      </Link>

      {inTrash && (
        <div role="status" className="flex flex-wrap items-center gap-3 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <p className="flex-1">Cette étude est dans la corbeille ; elle sera effacée le {formatDate(s.purgeAt!)}.</p>
          <Button variant="outline" size="sm" disabled={restore.isPending} onClick={() => restore.mutate(s.id)}>
            <Undo2 /> Restaurer
          </Button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="min-w-0 space-y-5" aria-labelledby="study-title">
          <div className="space-y-2">
            <p className="eyebrow text-primary">Étude</p>
            {editing === 'name' ? (
              <Rename study={s} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex items-start gap-2">
                <h1 id="study-title" className="min-w-0 flex-1 text-2xl break-words">
                  {s.name}
                </h1>
                {!inTrash && (
                  <Button variant="ghost" size="icon" aria-label="Renommer l’étude" onClick={() => setEditing('name')}>
                    <Pencil />
                  </Button>
                )}
              </div>
            )}
            {s.nameIsProvisional && <p className="text-xs text-muted-foreground">Nom provisoire : il sera proposé d’après l’adresse.</p>}
          </div>

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Adresse</dt>
            <dd className="space-y-1">
              {editing === 'address' ? (
                <AddressChoice study={s} onDone={() => setEditing(null)} />
              ) : (
                <>
                  <AddressValue study={s} />
                  {!inTrash && s.addresses.length > 1 && (
                    <button type="button" className="block text-primary underline-offset-2 hover:underline" onClick={() => setEditing('address')}>
                      Changer d’adresse ({s.addresses.length} trouvées)
                    </button>
                  )}
                </>
              )}
            </dd>
            <dt className="text-muted-foreground">Commune</dt>
            <dd>
              {s.communeName ?? s.communeCode} <span className="text-muted-foreground">({s.communeCode})</span>
            </dd>
            <dt className="text-muted-foreground">Contenance</dt>
            <dd className="tabular-nums" data-testid="study-contenance">
              {formatArea(s.contenance)}
            </dd>
            <dt className="text-muted-foreground">Surface calculée</dt>
            <dd className="tabular-nums">{formatArea(s.area)}</dd>
            <dt className="text-muted-foreground">Cadastre</dt>
            <dd>millésime {version}</dd>
          </dl>

          <div className="space-y-2">
            <h2 className="eyebrow text-primary">Parcelles ({s.parcelCount})</h2>
            <ul className="divide-y border" aria-label="Parcelles de l’étude">
              {s.parcels.map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{p.label}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{p.id}</span>
                  <span className="tabular-nums">{p.contenance === null ? '—' : formatArea(p.contenance)}</span>
                </li>
              ))}
            </ul>
          </div>

          {!inTrash && (
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={`/studies/${s.id}/map`}>
                  <MapPinned /> Modifier les parcelles
                </Link>
              </Button>
              <Button variant="outline" disabled={duplicate.isPending} onClick={() => duplicate.mutate(s.id, { onSuccess: (copy) => void navigate(`/studies/${copy.id}`) })}>
                <Copy /> Dupliquer
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={trash.isPending}
                onClick={() => trash.mutate(s.id, { onSuccess: () => void navigate('/', { state: { trashed: { id: s.id, name: s.name } } satisfies TrashedState }) })}
              >
                <Trash2 /> Mettre à la corbeille
              </Button>
            </div>
          )}
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError.message}
            </p>
          )}
        </section>

        <div className="min-w-0 space-y-6">
          <div className="h-72 border md:h-96">
            {layers.data ? (
              <Suspense fallback={<Loading />}>
                <StudyMap basemap={layers.data.basemaps.find((b) => b.id === layers.data.defaultBasemap) ?? layers.data.basemaps[0]!} parcels={s.parcels} />
              </Suspense>
            ) : (
              <Loading />
            )}
          </div>

          <section className="space-y-2" aria-labelledby="steps-title">
            <h2 id="steps-title" className="eyebrow text-primary">
              Étapes
            </h2>
            <ol className="divide-y border">
              {s.steps.map((step) => (
                <li key={step.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                  {step.state === 'done' ? <Check className="size-4 text-primary" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}
                  {STEP_LINKS[step.key] && step.state !== 'upcoming' ? (
                    <Link to={`/studies/${s.id}/${STEP_LINKS[step.key]}`} className="flex-1 text-primary hover:underline">
                      {step.label}
                    </Link>
                  ) : (
                    <span className={step.state === 'upcoming' ? 'flex-1 text-muted-foreground' : 'flex-1'}>{step.label}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{step.state === 'done' ? 'faite' : step.state === 'todo' ? 'à faire' : `à venir (${step.lot})`}</span>
                </li>
              ))}
            </ol>
          </section>
          {(s.addressPending || s.thumbnailPending) && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" /> Calcul de l’adresse et de la vignette…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
