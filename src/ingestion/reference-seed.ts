// Seed des données de référence : les communes de référence (PLAN §7, F-01 Q11) chargées depuis les
// réponses enregistrées de `fixtures/http`, sans Internet (D-09). Idempotent : une commune déjà
// chargée au même millésime n'est pas rechargée.
import { Inject, Injectable } from '@nestjs/common';

import { CONFIG, type Config } from '../config/config.ts';
import { CADASTRE_SOURCE } from '../geo/cadastre.service.ts';
import { CommunesRepository } from '../geo/communes.repository.ts';
import { ParcelsRepository } from '../geo/parcels.repository.ts';
import { SourceStatesRepository } from '../geo/source-states.repository.ts';
import { Clock } from '../shared/clock.ts';
import { Cadastre } from '../sources/cadastre.ts';
import { Communes } from '../sources/communes.ts';
import { RecordedHttp } from '../sources/http.ts';
import { CadastreLoader } from './cadastre-loader.ts';

/** Maisons-Alfort (PLUi à secteurs), Tours (PLU de grande ville), Beaumont-Village (RNU). */
export const REFERENCE_COMMUNES = ['94046', '37261', '37023'] as const;

export interface SeededCommune {
  code: string;
  name: string;
  parcels: number;
  version: string;
  skipped: boolean;
}

@Injectable()
export class ReferenceSeed {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly communes: CommunesRepository,
    private readonly parcels: ParcelsRepository,
    private readonly states: SourceStatesRepository,
    private readonly clock: Clock,
  ) {}

  async run(codes: readonly string[] = REFERENCE_COMMUNES): Promise<SeededCommune[]> {
    const recorded = new RecordedHttp(this.config.FIXTURES_DIR);
    const cadastre = new Cadastre(recorded);
    const loader = new CadastreLoader(cadastre, new Communes(recorded), this.communes, this.parcels, this.states, this.clock);
    const [latest] = await cadastre.versions();
    const seeded: SeededCommune[] = [];
    for (const code of codes) {
      const state = await this.states.get(CADASTRE_SOURCE, code);
      if (state?.status === 'ready' && state.version === latest) {
        const c = await this.communes.byCode(code);
        seeded.push({ code, name: c?.name ?? code, parcels: state.itemCount ?? 0, version: state.version, skipped: true });
        continue;
      }
      const r = await loader.load(code);
      seeded.push({ code, name: r.name, parcels: r.parcels, version: r.version, skipped: false });
    }
    return seeded;
  }
}
