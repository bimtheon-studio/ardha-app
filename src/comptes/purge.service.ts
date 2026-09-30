// Ménage des comptes : sessions expirées, liens de réinitialisation périmés ou déjà utilisés.
import { Injectable } from '@nestjs/common';

import { Horloge } from '../commun/horloge.ts';
import { ReinitialisationsRepository } from './reinitialisations.repository.ts';
import { SessionsRepository } from './sessions.repository.ts';

@Injectable()
export class PurgeComptes {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly reinitialisations: ReinitialisationsRepository,
    private readonly horloge: Horloge,
  ) {}

  async purger(): Promise<{ sessions: number; liens: number }> {
    const maintenant = this.horloge.maintenant();
    return {
      sessions: await this.sessions.purgerExpirees(maintenant),
      liens: await this.reinitialisations.purger(maintenant),
    };
  }
}
