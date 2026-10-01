// Lanceur du conteneur de production (lot LD) : once n'admet qu'un conteneur par application, qui
// porte donc l'API et le worker. Ordre : migrations (sous verrou, `db.ts`), puis API et worker, puis
// le seed s'il est demandé (environnements de PR). Le worker qui tombe est relancé ; l'API qui
// tombe arrête le conteneur, que Docker relance (`restart: always`, posé par once). SIGTERM est
// transmis aux processus, tués s'ils ne s'arrêtent pas dans le délai.
import { type ChildProcess, spawn } from 'node:child_process';

export interface ProcessSpec {
  name: string;
  command: string;
  args: string[];
}

export interface LauncherOptions {
  migrate: ProcessSpec;
  api: ProcessSpec;
  worker: ProcessSpec;
  /** Seed lancé une fois l'API démarrée ; son échec est signalé sans arrêter le conteneur. */
  seed?: ProcessSpec;
  /** Délai laissé aux processus pour s'arrêter avant SIGKILL (Docker attend 10 s). */
  stopTimeoutMs: number;
  /** Attente avant la n-ième relance consécutive du worker (n ≥ 1). */
  restartDelayMs: (attempt: number) => number;
  /** Un worker resté en vie au moins ce temps remet le compteur de relances à zéro (60 s par défaut). */
  stableAfterMs?: number;
  log: (message: string) => void;
}

/** 1 s, 2 s, 4 s… plafonné à 30 s. */
export function backoff(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** (attempt - 1));
}

export class Launcher {
  private readonly running = new Map<string, ChildProcess>();
  private stopping = false;
  private exitCode = 0;
  private restartTimer: NodeJS.Timeout | undefined;
  private resolveExit!: (code: number) => void;
  private readonly exited = new Promise<number>((resolve) => (this.resolveExit = resolve));

  constructor(private readonly options: LauncherOptions) {}

  /** Rend le code de sortie du conteneur. */
  async start(): Promise<number> {
    const { log } = this.options;
    const migration = await this.runOnce(this.options.migrate);
    if (this.stopping) return this.finish();
    if (migration !== 0) {
      log(`migrations en échec (code ${migration}) : rien n'est démarré`);
      return 1;
    }
    this.startApi();
    this.startWorker(0);
    if (this.options.seed) void this.seed(this.options.seed);
    return this.exited;
  }

  /** Arrêt demandé (signal reçu par le conteneur). */
  stop(signal: NodeJS.Signals): void {
    if (this.stopping) return;
    this.options.log(`${signal} reçu : arrêt`);
    this.shutdown(0);
  }

  // Privé

  private spawn(spec: ProcessSpec): ChildProcess {
    const child = spawn(spec.command, spec.args, { stdio: 'inherit' });
    this.running.set(spec.name, child);
    child.on('exit', () => {
      if (this.running.get(spec.name) === child) this.running.delete(spec.name);
      if (this.stopping && this.running.size === 0) this.finish();
    });
    return child;
  }

  private runOnce(spec: ProcessSpec): Promise<number> {
    return new Promise((resolve) => {
      this.spawn(spec).on('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
    });
  }

  private startApi(): void {
    this.spawn(this.options.api).on('exit', (code, signal) => {
      if (this.stopping) return;
      this.options.log(`API arrêtée (code ${code ?? signal}) : arrêt du conteneur`);
      this.shutdown(code || 1);
    });
  }

  private startWorker(attempt: number): void {
    const startedAt = Date.now();
    this.spawn(this.options.worker).on('exit', (code, signal) => {
      if (this.stopping) return;
      const next = Date.now() - startedAt >= (this.options.stableAfterMs ?? 60_000) ? 1 : attempt + 1;
      const delay = this.options.restartDelayMs(next);
      this.options.log(`worker arrêté (code ${code ?? signal}), relance dans ${delay} ms`);
      this.restartTimer = setTimeout(() => this.startWorker(next), delay);
    });
  }

  private async seed(spec: ProcessSpec): Promise<void> {
    const code = await this.runOnce(spec);
    if (code !== 0 && !this.stopping) this.options.log(`seed en échec (code ${code}) : le conteneur continue`);
  }

  private shutdown(code: number): void {
    this.stopping = true;
    this.exitCode = code;
    clearTimeout(this.restartTimer);
    if (this.running.size === 0) {
      this.finish();
      return;
    }
    for (const [name, child] of this.running) {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          this.options.log(`${name} ne s’arrête pas : SIGKILL`);
          child.kill('SIGKILL');
        }
      }, this.options.stopTimeoutMs).unref();
    }
  }

  private finish(): number {
    this.resolveExit(this.exitCode);
    return this.exitCode;
  }
}
