// Limiteur de débit en mémoire, pour un processus : au plus `concurrency` tâches en cours, et au plus
// `max` lancées par fenêtre glissante de `windowMs`. Les tâches attendent leur tour dans l'ordre ; une
// tâche abandonnée (signal) avant son tour n'est jamais lancée.
export interface ThrottleOptions {
  max: number;
  windowMs: number;
  concurrency: number;
}

export class Throttle {
  private active = 0;
  /** Instants de lancement encore dans la fenêtre, du plus ancien au plus récent. */
  private readonly starts: number[] = [];
  /** Tâches en attente de leur tour : de quoi les lancer. */
  private readonly waiting: (() => void)[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: ThrottleOptions) {}

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.turn(signal);
    try {
      return await task();
    } finally {
      this.active--;
      this.drain();
    }
  }

  private turn(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const start = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        this.waiting.splice(this.waiting.indexOf(start), 1);
        reject(signal?.reason);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(start);
      this.drain();
    });
  }

  private drain(): void {
    const { max, windowMs, concurrency } = this.options;
    const now = Date.now();
    while (this.starts.length > 0 && this.starts[0]! <= now - windowMs) this.starts.shift();
    while (this.waiting.length > 0 && this.active < concurrency && this.starts.length < max) {
      this.active++;
      this.starts.push(now);
      this.waiting.shift()!();
    }
    // Fenêtre pleine : reprendre quand le plus ancien lancement en sort. (Toutes les places prises :
    // la fin d'une tâche relance la distribution.)
    if (this.waiting.length > 0 && this.active < concurrency && this.timer === undefined) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.drain();
      }, this.starts[0]! + windowMs - now);
      this.timer.unref();
    }
  }
}
