// Carte et parcellaire (F-01) : communes, parcelles, états des sources, recherches à la demande.
// Partagé par l'API, le worker et la CLI ; ne sort jamais vers l'extérieur.
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { Clock } from '../shared/clock.ts';
import { CADASTRE_QUEUE, LOOKUPS_QUEUE } from '../shared/queues.ts';
import { CadastreService } from './cadastre.service.ts';
import { CommunesRepository } from './communes.repository.ts';
import { ElevationService } from './elevation.service.ts';
import { HydrantsRepository } from './hydrants.repository.ts';
import { Lookups } from './lookups.ts';
import { ParcelsRepository } from './parcels.repository.ts';
import { SourceStatesRepository } from './source-states.repository.ts';

const providers = [CadastreService, ElevationService, HydrantsRepository, CommunesRepository, ParcelsRepository, SourceStatesRepository, Lookups, Clock];

const queues = BullModule.registerQueue({ name: CADASTRE_QUEUE }, { name: LOOKUPS_QUEUE });

@Module({ imports: [queues], providers, exports: [...providers, queues] })
export class GeoModule {}
