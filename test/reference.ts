// Données de référence minimales pour un test : quelques parcelles tirées des fichiers enregistrés du
// cadastre Etalab, sans charger toute la commune (5 873 parcelles à Maisons-Alfort).
import type { INestApplicationContext } from '@nestjs/common';

import { parseParcelId } from '../src/domain/index.ts';
import { CommunesRepository } from '../src/geo/communes.repository.ts';
import { ParcelsRepository } from '../src/geo/parcels.repository.ts';
import { Cadastre } from '../src/sources/cadastre.ts';
import { Communes } from '../src/sources/communes.ts';

export async function seedParcels(worker: INestApplicationContext, ids: readonly string[]): Promise<void> {
  const byCommune = new Map<string, Set<string>>();
  for (const id of ids) {
    const code = parseParcelId(id)!.commune;
    byCommune.set(code, (byCommune.get(code) ?? new Set()).add(id));
  }
  for (const [code, wanted] of byCommune) {
    const info = await worker.get(Communes).commune(code);
    const file = await worker.get(Cadastre).latestParcels(code);
    await worker.get(CommunesRepository).upsert(info!);
    await worker.get(ParcelsRepository).replaceForCommune(
      code,
      file!.version,
      file!.parcels.filter((p) => wanted.has(p.id)),
    );
  }
}
