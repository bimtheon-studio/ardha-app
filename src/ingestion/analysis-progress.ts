// Déroulé d'une analyse (F-04) : les étapes connues d'avance, passées en cours puis finies, chacune
// avec un commentaire ; chaque changement est enregistré, pour être vu pendant le calcul. Plusieurs
// étapes peuvent être en cours à la fois.
import type { AnalysisStep } from '../contracts/index.ts';

export interface StepOutcome {
  state: 'done' | 'partial' | 'unavailable';
  detail: string | null;
}

export class AnalysisProgress {
  readonly steps: AnalysisStep[];
  /** Les étapes avancent en parallèle : les enregistrements, eux, passent un par un, dans l'ordre. */
  private writes: Promise<void> = Promise.resolve();

  constructor(
    steps: readonly { key: string; label: string }[],
    private readonly persist: (steps: AnalysisStep[]) => Promise<void>,
    private readonly now: () => Date,
  ) {
    this.steps = steps.map((s) => ({ ...s, state: 'pending', detail: null, startedAt: null, finishedAt: null }));
  }

  private async update(key: string, patch: Partial<AnalysisStep>): Promise<void> {
    Object.assign(this.steps.find((s) => s.key === key)!, patch);
    await this.save();
  }

  /** Enregistre l'état présent (le déroulé, et ce que `persist` y joint, comme un résultat partiel). */
  async save(): Promise<void> {
    const snapshot = this.steps.map((s) => ({ ...s }));
    const write = this.writes.then(() => this.persist(snapshot));
    this.writes = write.catch(() => {});
    await write;
  }

  /** Passe l'étape en cours, la mène à bien, puis la clôt avec ce que `describe` en dit. */
  async run<T>(key: string, fn: () => Promise<T>, describe: (result: T) => StepOutcome): Promise<T> {
    await this.update(key, { state: 'running', startedAt: this.now().toISOString() });
    const result = await fn();
    const outcome = describe(result);
    await this.update(key, { ...outcome, finishedAt: this.now().toISOString() });
    return result;
  }
}
