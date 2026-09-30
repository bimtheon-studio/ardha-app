// Ménage des comptes : sessions expirées, liens de réinitialisation périmés ou déjà utilisés.
import { Injectable } from '@nestjs/common';

import { Clock } from '../shared/clock.ts';
import { PasswordResetsRepository } from './password-resets.repository.ts';
import { SessionsRepository } from './sessions.repository.ts';

@Injectable()
export class AccountsPurge {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly passwordResets: PasswordResetsRepository,
    private readonly clock: Clock,
  ) {}

  async purge(): Promise<{ sessions: number; links: number }> {
    const now = this.clock.now();
    return {
      sessions: await this.sessions.purgeExpired(now),
      links: await this.passwordResets.purge(now),
    };
  }
}
