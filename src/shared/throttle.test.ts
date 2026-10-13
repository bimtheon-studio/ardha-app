import { describe, expect, it } from 'vitest';

import { Throttle } from './throttle.ts';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Throttle', () => {
  it('ne lance pas plus de tâches en parallèle que permis', async () => {
    const throttle = new Throttle({ max: 100, windowMs: 1_000, concurrency: 2 });
    let running = 0;
    let peak = 0;
    const task = async () => {
      peak = Math.max(peak, ++running);
      await pause(10);
      running--;
    };
    await Promise.all(Array.from({ length: 6 }, () => throttle.run(task)));
    expect(peak).toBe(2);
  });

  it('ne lance pas plus de tâches par fenêtre que permis, la suite à la fenêtre suivante', async () => {
    const throttle = new Throttle({ max: 3, windowMs: 100, concurrency: 10 });
    const started: number[] = [];
    const t0 = Date.now();
    await Promise.all(Array.from({ length: 5 }, () => throttle.run(async () => void started.push(Date.now() - t0))));
    expect(started.filter((t) => t < 90)).toHaveLength(3);
    expect(started.filter((t) => t >= 90)).toHaveLength(2);
  });

  it('une tâche abandonnée avant son tour n’est jamais lancée et rend sa place', async () => {
    const throttle = new Throttle({ max: 100, windowMs: 1_000, concurrency: 1 });
    const ran: string[] = [];
    const first = throttle.run(async () => {
      await pause(30);
      ran.push('première');
    });
    const abandon = new AbortController();
    const second = throttle.run(async () => void ran.push('abandonnée'), abandon.signal);
    const third = throttle.run(async () => void ran.push('troisième'));
    abandon.abort(new Error('trop tard'));
    await expect(second).rejects.toThrow('trop tard');
    await Promise.all([first, third]);
    expect(ran).toEqual(['première', 'troisième']);
  });

  it('refuse d’emblée une tâche déjà abandonnée ; une tâche en échec rend sa place', async () => {
    const throttle = new Throttle({ max: 100, windowMs: 1_000, concurrency: 1 });
    await expect(throttle.run(async () => 1, AbortSignal.abort(new Error('déjà')))).rejects.toThrow('déjà');
    await expect(throttle.run(async () => Promise.reject(new Error('panne')))).rejects.toThrow('panne');
    expect(await throttle.run(async () => 'suivante')).toBe('suivante');
  });
});
