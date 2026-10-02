// Réponses aux recherches à la demande (file `lookups`) : le worker interroge la source.
import { Injectable } from '@nestjs/common';

import type { LookupJobs, LookupName } from '../geo/lookups.ts';
import { Communes } from '../sources/communes.ts';
import { Elevation } from '../sources/elevation.ts';
import { Geocoding } from '../sources/geocoding.ts';

@Injectable()
export class LookupHandlers {
  constructor(
    private readonly geocoding: Geocoding,
    private readonly communes: Communes,
    private readonly elevation: Elevation,
  ) {}

  handle<N extends LookupName>(name: N, input: LookupJobs[N]['input']): Promise<LookupJobs[N]['output']>;
  async handle(name: LookupName, input: never): Promise<unknown> {
    switch (name) {
      case 'address:search': {
        const { q, limit } = input as LookupJobs['address:search']['input'];
        return this.geocoding.search(q, limit);
      }
      case 'address:reverse': {
        const { lon, lat } = input as LookupJobs['address:reverse']['input'];
        return this.geocoding.reverse(lon, lat);
      }
      case 'commune:locate': {
        const { lon, lat } = input as LookupJobs['commune:locate']['input'];
        return this.communes.locate(lon, lat);
      }
      case 'elevation:points': {
        const { points } = input as LookupJobs['elevation:points']['input'];
        return this.elevation.points(points);
      }
      default:
        throw new Error(`Recherche inconnue : ${String(name)}`);
    }
  }
}
