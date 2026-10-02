// Morceaux communs aux pages d'analyse d'une étude (risques F-04, marché F-05) : une donnée ou
// « indisponible », une section titrée, le déroulé du calcul (en entier, ou en compact pendant le
// calcul, sur une hauteur fixe).
import type { AnalysisStep } from '@contracts';
import { AlertTriangle, Check, Circle, CircleX, LoaderCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';

export type Known<T> = { status: 'ok'; data: T } | { status: 'unavailable'; error: string };

/** La donnée, ou « indisponible » quand la source n'a pas répondu. */
export function Value<T>({ of, children }: { of: Known<T>; children: (data: T) => ReactNode }) {
  if (of.status === 'unavailable') {
    return (
      <span className="text-muted-foreground" title={of.error}>
        Indisponible (source muette) : à vérifier
      </span>
    );
  }
  return <>{children(of.data)}</>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className="eyebrow text-primary">{title}</h2>
      {children}
    </section>
  );
}

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
export function Progress({ steps }: { steps: AnalysisStep[] }) {
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

/**
 * Calcul en cours, en compact : l'étape courante, la dernière trouvaille et une barre, sur une hauteur
 * fixe (l'écran ne bouge pas d'une étape à l'autre, sur mobile surtout) ; le détail se déplie.
 */
export function LiveProgress({ steps }: { steps: AnalysisStep[] }) {
  const [open, setOpen] = useState(false);
  const finished = steps.filter((s) => s.state !== 'pending' && s.state !== 'running').length;
  const current = steps.find((s) => s.state === 'running') ?? steps.find((s) => s.state === 'pending');
  const last = [...steps].reverse().find((s) => s.finishedAt && s.detail);
  return (
    <section className="space-y-2 border bg-card px-3 py-2 text-sm" aria-label="Calcul en cours">
      {/* Une ligne, quelle que soit la largeur : l'étape en chiffres va à côté de la barre. */}
      <div className="flex items-center justify-between gap-3 whitespace-nowrap">
        <p className="eyebrow text-primary">Calcul en cours</p>
        {steps.length > 0 && (
          <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Masquer le détail' : `Voir les ${steps.length} étapes`}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={finished} aria-label="Avancement du calcul">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${steps.length ? (finished / steps.length) * 100 : 0}%` }} />
        </div>
        <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums" data-testid="step-count">
          {steps.length ? `${Math.min(finished + 1, steps.length)} / ${steps.length}` : '…'}
        </span>
      </div>
      <p className="flex items-center gap-2 truncate">
        <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        <span className="truncate">{steps.length === 0 ? 'Préparation du calcul…' : (current?.label ?? 'Enregistrement de l’analyse')}</span>
      </p>
      <p className="truncate text-xs text-muted-foreground" data-testid="last-step">
        {last ? `${last.label.split(' (')[0]} : ${last.detail}` : 'Premiers appels aux sources…'}
      </p>
      {open && <Progress steps={steps} />}
    </section>
  );
}
