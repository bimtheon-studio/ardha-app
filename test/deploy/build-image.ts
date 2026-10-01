// Construit l'image de production une fois pour les tests du déploiement ; `ARDHA_IMAGE=<image>`
// teste une image déjà construite (CI).
import { spawnSync } from 'node:child_process';

export const IMAGE = process.env.ARDHA_IMAGE ?? 'ardha:test';

export default function setup(): void {
  if (process.env.ARDHA_IMAGE) return;
  const root = new URL('../..', import.meta.url).pathname;
  const r = spawnSync('docker', ['build', '-t', IMAGE, '.'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`docker build en échec :\n${r.stderr.toString().slice(-3000)}`);
}
