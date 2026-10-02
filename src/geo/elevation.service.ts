// Altitudes d'une sélection de parcelles (F-04, Q6), pour la carte : mesurées par le worker
// (IGN, file `lookups`, en cache 24 h), sur le même échantillon que l'analyse des risques.
import { Injectable } from '@nestjs/common';

import type { SelectionElevation } from '../contracts/index.ts';
import { elevationSamples, elevationStats } from '../domain/index.ts';
import { DomainError } from '../shared/errors.ts';
import { Lookups } from './lookups.ts';
import { ParcelsRepository } from './parcels.repository.ts';

export const ELEVATION_SOURCE = 'IGN, RGE ALTI® (m NGF-IGN69, IGN78 en Corse)';

@Injectable()
export class ElevationService {
  constructor(
    private readonly parcels: ParcelsRepository,
    private readonly lookups: Lookups,
  ) {}

  async ofParcels(ids: readonly string[]): Promise<SelectionElevation> {
    const records = await this.parcels.byIds([...new Set(ids)]);
    if (records.length === 0) throw new DomainError('unknown-parcel');
    const samples = elevationSamples(records.map((r) => r.geometry));
    const points = samples.flat().map((p) => [p[0]!, p[1]!] as [number, number]);
    const altitudes = await this.lookups.run('elevation:points', { points });
    let offset = 0;
    const zsOf = (n: number) => {
      const zs = altitudes.slice(offset, offset + n).flatMap((a) => (a.z === null ? [] : [a.z]));
      offset += n;
      return zs;
    };
    const all: number[] = [];
    const parcels = records.map((r, i) => {
      const zs = zsOf(samples[i]!.length);
      all.push(...zs);
      const stats = elevationStats(zs);
      return { id: r.id, stats: stats && { ...stats, points: zs.length } };
    });
    const overall = elevationStats(all);
    return { overall: overall && { ...overall, points: all.length }, parcels, source: ELEVATION_SOURCE };
  }
}
