// Chargement du cadastre d'une commune (worker, ou CLI `commune:load --inline`) : commune depuis
// geo.api.gouv.fr, parcelles depuis le cadastre Etalab au dernier millésime, remplacement en une
// transaction, état tenu dans `source_states`.
import { Injectable, Logger } from '@nestjs/common';

import { CADASTRE_SOURCE } from '../geo/cadastre.service.ts';
import { CommunesRepository } from '../geo/communes.repository.ts';
import { ParcelsRepository } from '../geo/parcels.repository.ts';
import { SourceStatesRepository } from '../geo/source-states.repository.ts';
import { Clock } from '../shared/clock.ts';
import { Cadastre } from '../sources/cadastre.ts';
import { Communes } from '../sources/communes.ts';
import { SourceError } from '../sources/http.ts';

export interface LoadResult {
  code: string;
  name: string;
  version: string;
  parcels: number;
  skipped: number;
}

/** Échec définitif : réessayer ne changerait rien (commune inconnue, pas de cadastre publié). */
export class PermanentLoadError extends Error {
  override name = 'PermanentLoadError';
}

/** Message affiché à l'utilisateur, sans détail technique. */
export function userMessage(error: unknown): string {
  if (error instanceof PermanentLoadError) return error.message;
  if (error instanceof SourceError) return 'Le cadastre est momentanément injoignable ; nouvel essai automatique.';
  return 'Le chargement du cadastre a échoué.';
}

@Injectable()
export class CadastreLoader {
  private readonly logger = new Logger('CadastreLoader');

  constructor(
    private readonly cadastre: Cadastre,
    private readonly communeSource: Communes,
    private readonly communes: CommunesRepository,
    private readonly parcels: ParcelsRepository,
    private readonly states: SourceStatesRepository,
    private readonly clock: Clock,
  ) {}

  /** `retrying` : un échec passager laisse l'état `loading`, en attendant la prochaine tentative. */
  async load(code: string, retrying = false): Promise<LoadResult> {
    await this.states.markLoading(CADASTRE_SOURCE, code, this.clock.now());
    try {
      const info = await this.communeSource.commune(code);
      if (!info) throw new PermanentLoadError(`Commune ${code} inconnue.`);
      const file = await this.cadastre.latestParcels(code);
      if (!file) throw new PermanentLoadError(`Aucun cadastre publié pour ${info.name} (${code}).`);
      await this.communes.upsert(info);
      await this.parcels.replaceForCommune(code, file.version, file.parcels);
      await this.states.markReady(CADASTRE_SOURCE, code, file.version, file.parcels.length, this.clock.now());
      this.logger.log(`${info.name} (${code}) : ${file.parcels.length} parcelle(s), millésime ${file.version}`);
      return { code, name: info.name, version: file.version, parcels: file.parcels.length, skipped: file.skipped };
    } catch (error) {
      const permanent = error instanceof PermanentLoadError;
      await this.states.markFailed(CADASTRE_SOURCE, code, userMessage(error), this.clock.now(), retrying && !permanent);
      throw error;
    }
  }
}
