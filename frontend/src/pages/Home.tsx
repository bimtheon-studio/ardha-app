// Accueil connecté (F-02, Q5) : mes études, des plus récemment modifiées aux plus anciennes, une
// recherche (nom, commune, adresse), « Nouvelle étude », la corbeille.
import { Plus, Search, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { useMe } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebounced } from '@/map/useDebounced';
import { useDuplicateStudy, useRestoreStudy, useStudies, useTrashStudy } from '@/studies/api';
import { StudyCard } from '@/studies/StudyCard';

/** Étude tout juste mise à la corbeille, pour proposer de l'en sortir (aussi depuis la page de l'étude). */
export interface TrashedState {
  trashed?: { id: string; name: string };
}

export function Home() {
  const { data: me } = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const studies = useStudies(q);
  const duplicate = useDuplicateStudy();
  const trash = useTrashStudy();
  const restore = useRestoreStudy();
  const [trashed, setTrashed] = useState((location.state as TrashedState | null)?.trashed ?? null);
  const [error, setError] = useState<string | null>(null);

  function moveToTrash(id: string, name: string) {
    setError(null);
    trash.mutate(id, { onSuccess: () => setTrashed({ id, name }), onError: (e) => setError(e.message) });
  }

  function undo(id: string) {
    restore.mutate(id, { onSuccess: () => setTrashed(null), onError: (e) => setError(e.message) });
  }

  const list = studies.data ?? [];
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow text-primary">Bonjour {me?.name}</p>
          <h1 className="text-3xl">Mes études</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/studies/trash">
              <Trash2 /> Corbeille
            </Link>
          </Button>
          <Button asChild>
            <Link to="/map">
              <Plus /> Nouvelle étude
            </Link>
          </Button>
        </div>
      </div>

      {trashed && (
        <div role="status" className="flex flex-wrap items-center gap-3 border bg-card px-4 py-3 text-sm">
          <p className="flex-1">« {trashed.name} » est dans la corbeille pendant 30 jours.</p>
          <Button variant="outline" size="sm" onClick={() => undo(trashed.id)} disabled={restore.isPending}>
            <Undo2 /> Annuler
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <label className="relative block max-w-md">
        <span className="sr-only">Rechercher une étude</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, commune ou adresse" className="pl-9" />
      </label>

      {studies.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="text-destructive">Vos études n’ont pas pu être chargées : {studies.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => void studies.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : studies.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement de vos études…</p>
      ) : list.length === 0 && q ? (
        <p className="text-sm text-muted-foreground">Aucune étude ne correspond à « {q} ».</p>
      ) : list.length === 0 ? (
        <div className="space-y-3 border border-dashed p-8 text-center">
          <p className="font-medium">Aucune étude pour l’instant</p>
          <p className="text-sm text-muted-foreground">Choisissez des parcelles sur la carte, puis créez votre première étude.</p>
          <Button asChild>
            <Link to="/map">
              <Plus /> Nouvelle étude
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Études">
          {list.map((s) => (
            <StudyCard
              key={s.id}
              study={s}
              onDuplicate={() => duplicate.mutate(s.id, { onSuccess: (copy) => void navigate(`/studies/${copy.id}`), onError: (e) => setError(e.message) })}
              onTrash={() => moveToTrash(s.id, s.name)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
