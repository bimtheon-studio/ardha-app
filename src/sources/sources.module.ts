// Les sources publiques, pour le worker et la CLI seulement (le lint l'interdit ailleurs). En
// `ARDHA_SOURCES=recorded`, les réponses viennent de `fixtures/http` : aucun appel à Internet ; en
// `record`, les réponses réelles y sont enregistrées au passage.
import { Module } from '@nestjs/common';

import { CONFIG, type Config } from '../config/config.ts';
import { Cadastre } from './cadastre.ts';
import { Communes } from './communes.ts';
import { Geocoding } from './geocoding.ts';
import { Http, LiveHttp, RecordedHttp, RecordingHttp } from './http.ts';
import { Tiles } from './tiles.ts';
import { Elevation } from './elevation.ts';
import { FloodHeights } from './flood-heights.ts';
import { Georisques } from './georisques.ts';
import { Hydrants } from './hydrants.ts';

@Module({
  providers: [
    {
      provide: Http,
      inject: [CONFIG],
      useFactory: (c: Config): Http => {
        if (c.ARDHA_SOURCES === 'recorded') return new RecordedHttp(c.FIXTURES_DIR);
        if (c.ARDHA_SOURCES === 'record') return new RecordingHttp(new LiveHttp(), c.FIXTURES_DIR);
        return new LiveHttp();
      },
    },
    { provide: Geocoding, inject: [Http], useFactory: (http: Http) => new Geocoding(http) },
    { provide: Communes, inject: [Http], useFactory: (http: Http) => new Communes(http) },
    { provide: Cadastre, inject: [Http], useFactory: (http: Http) => new Cadastre(http) },
    { provide: Tiles, inject: [Http], useFactory: (http: Http) => new Tiles(http) },
    { provide: Georisques, inject: [Http], useFactory: (http: Http) => new Georisques(http) },
    { provide: FloodHeights, inject: [Http], useFactory: (http: Http) => new FloodHeights(http) },
    { provide: Elevation, inject: [Http], useFactory: (http: Http) => new Elevation(http) },
    { provide: Hydrants, inject: [Http], useFactory: (http: Http) => new Hydrants(http) },
  ],
  exports: [Http, Geocoding, Communes, Cadastre, Tiles, Georisques, FloodHeights, Elevation, Hydrants],
})
export class SourcesModule {}
