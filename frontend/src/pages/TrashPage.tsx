// Corbeille (F-02, Q9) : les études supprimées restent 30 jours, restaurables, puis le worker les efface.
import { ArrowLeft, Undo2 } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/dates';
import { useRestoreStudy, useStudies } from '@/studies/api';
import { describe } from '@/studies/StudyCard';

export function TrashPage() {
  const trash = useStudies('', true);
  const restore = useRestoreStudy();
  const list = trash.data ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Mes études
      </Link>
      <div className="space-y-1">
        <h1 className="text-3xl">Corbeille</h1>
        <p className="text-sm text-muted-foreground">Les études supprimées y restent 30 jours, puis elles sont effacées définitivement.</p>
      </div>
      {restore.error && (
        <p role="alert" className="text-sm text-destructive">
          {restore.error.message}
        </p>
      )}
      {trash.isError ? (
        <p role="alert" className="text-sm text-destructive">
          La corbeille n’a pas pu être chargée : {trash.error.message}
        </p>
      ) : trash.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">La corbeille est vide.</p>
      ) : (
        <ul className="divide-y border" aria-label="Études dans la corbeille">
          {list.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.name}</p>
                <p className="text-sm text-muted-foreground">{describe(s)}</p>
                <p className="text-xs text-muted-foreground">
                  Supprimée le {formatDate(s.deletedAt!)} · effacée le {formatDate(s.purgeAt!)}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={restore.isPending} onClick={() => restore.mutate(s.id)}>
                <Undo2 /> Restaurer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
