// Ce qui alimente les données de référence depuis les sources publiques : pour le worker et la CLI.
import { Module } from '@nestjs/common';

import { GeoModule } from '../geo/geo.module.ts';
import { SourcesModule } from '../sources/sources.module.ts';
import { CadastreLoader } from './cadastre-loader.ts';
import { LookupHandlers } from './lookup-handlers.ts';
import { ReferenceSeed } from './reference-seed.ts';

@Module({
  imports: [SourcesModule, GeoModule],
  providers: [CadastreLoader, LookupHandlers, ReferenceSeed],
  exports: [CadastreLoader, LookupHandlers, ReferenceSeed, SourcesModule],
})
export class IngestionModule {}
