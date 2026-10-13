// Carte et parcellaire (F-01) : communes, parcelles, états des sources, recherches à la demande.
// Partagé par l'API, le worker et la CLI ; ne sort vers l'extérieur que pour les recherches à la
// demande (`Lookups`, DT-20).
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { Clock } from '../shared/clock.ts';
import { CADASTRE_QUEUE } from '../shared/queues.ts';
import { CadastreService } from './cadastre.service.ts';
import { CommunesRepository } from './communes.repository.ts';
import { ElevationService } from './elevation.service.ts';
import { HydrantsRepository } from './hydrants.repository.ts';
import { CommuneRisksRepository } from './commune-risks.repository.ts';
import { MarketRepository } from './market.repository.ts';
import { LookupsModule } from './lookups.ts';
import { ParcelsRepository } from './parcels.repository.ts';
import { SourceStatesRepository } from './source-states.repository.ts';

const providers = [CadastreService, ElevationService, HydrantsRepository, CommuneRisksRepository, MarketRepository, CommunesRepository, ParcelsRepository, SourceStatesRepository, Clock];

const queues = BullModule.registerQueue({ name: CADASTRE_QUEUE });

@Module({ imports: [queues, LookupsModule], providers, exports: [...providers, queues, LookupsModule] })
export class GeoModule {}
