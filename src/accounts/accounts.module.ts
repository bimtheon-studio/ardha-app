// Les comptes : repositories, services et journal, partagés par l'API, le worker et la CLI.
import { Module } from '@nestjs/common';

import { AuthService } from './auth.service.ts';
import { PurgeComptes } from './purge.service.ts';
import { ReinitialisationsRepository } from './password-resets.repository.ts';
import { SessionsRepository } from './sessions.repository.ts';
import { Horloge } from '../shared/clock.ts';
import { MotsDePasse } from '../shared/passwords.ts';
import { Journal } from '../audit/audit-log.ts';
import { UtilisateursRepository } from './users.repository.ts';
import { UtilisateursService } from './users.service.ts';

const fournisseurs = [
  AuthService,
  UtilisateursService,
  PurgeComptes,
  UtilisateursRepository,
  SessionsRepository,
  ReinitialisationsRepository,
  MotsDePasse,
  Journal,
  Horloge,
];

@Module({ providers: fournisseurs, exports: fournisseurs })
export class ComptesModule {}
