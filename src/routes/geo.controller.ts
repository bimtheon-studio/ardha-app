// Routes de la carte et du parcellaire (F-01), conformes à `geoRoutes` du contrat. L'API ne lit que
// la base ; les recherches passent par le worker (`Lookups`).
import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';

import { geoRoutes, type Commune, type MapLayers, type Parcels } from '../contracts/index.ts';
import { parseBbox } from '../domain/index.ts';
import { CadastreService } from '../geo/cadastre.service.ts';
import { Lookups } from '../geo/lookups.ts';
import { MAP_LAYERS } from '../geo/map-layers.ts';
import { Validate } from './http/validation.ts';

const r = geoRoutes;
const path = (p: string) => p.replace(/^\/api\//, '');

type Output<S> = S extends z.ZodType ? z.output<S> : never;
type QueryOf<K extends keyof typeof r> = Output<(typeof r)[K]['query']>;
type ParamsOf<K extends keyof typeof r> = Output<(typeof r)[K]['params']>;
type ResponseOf<K extends keyof typeof r> = Output<(typeof r)[K]['response']>;

@Controller('api')
export class GeoController {
  constructor(
    private readonly cadastre: CadastreService,
    private readonly lookups: Lookups,
  ) {}

  @Get(path(r.addressSearch.path))
  async addressSearch(@Query(new Validate(r.addressSearch.query)) q: QueryOf<'addressSearch'>): Promise<ResponseOf<'addressSearch'>> {
    return { addresses: await this.lookups.run('address:search', { q: q.q, limit: q.limit }) };
  }

  @Get(path(r.addressReverse.path))
  async addressReverse(@Query(new Validate(r.addressReverse.query)) q: QueryOf<'addressReverse'>): Promise<ResponseOf<'addressReverse'>> {
    return { address: await this.lookups.run('address:reverse', { lon: q.lon, lat: q.lat }) };
  }

  // Déclarée avant `communes/:code`, qui l'avalerait sinon.
  @Get(path(r.communeLocate.path))
  async communeLocate(@Query(new Validate(r.communeLocate.query)) q: QueryOf<'communeLocate'>): Promise<ResponseOf<'communeLocate'>> {
    return { commune: await this.cadastre.locate(q.lon, q.lat) };
  }

  @Get(path(r.commune.path))
  commune(@Param(new Validate(r.commune.params)) p: ParamsOf<'commune'>): Promise<Commune> {
    return this.cadastre.commune(p.code);
  }

  @Post(path(r.communeCadastreLoad.path))
  @HttpCode(r.communeCadastreLoad.status)
  communeCadastreLoad(@Param(new Validate(r.communeCadastreLoad.params)) p: ParamsOf<'communeCadastreLoad'>): Promise<Commune> {
    return this.cadastre.requestLoad(p.code);
  }

  @Get(path(r.parcels.path))
  parcels(@Query(new Validate(r.parcels.query)) q: QueryOf<'parcels'>): Promise<Parcels> {
    if (q.bbox) return this.cadastre.parcelsInBbox(parseBbox(q.bbox)!);
    return this.cadastre.parcelsByIds([...new Set(q.ids!.split(','))]);
  }

  @Get(path(r.mapLayers.path))
  mapLayers(): MapLayers {
    return MAP_LAYERS;
  }
}
