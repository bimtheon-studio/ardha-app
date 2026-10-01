// Construit l'image de production une fois pour les tests du déploiement (cache Docker : quasi
// gratuit si rien n'a changé). `ARDHA_IMAGE` choisit l'étiquette : la CI publie ensuite l'image
// qu'elle vient de tester ; `ARDHA_IMAGE_BUILT=true` : déjà construite (CI, cache de couches).
import { spawnSync } from 'node:child_process';

export const IMAGE = process.env.ARDHA_IMAGE ?? 'ardha:test';

export default function setup(): void {
  if (process.env.ARDHA_IMAGE_BUILT === 'true') return;
  const root = new URL('../..', import.meta.url).pathname;
  const r = spawnSync('docker', ['build', '-t', IMAGE, '.'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`docker build en échec :\n${r.stderr.toString().slice(-3000)}`);
}
