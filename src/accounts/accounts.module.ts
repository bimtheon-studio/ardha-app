// Les comptes : repositories, services et journal, partagés par l'API, le worker et la CLI.
import { Module } from '@nestjs/common';

import { AuthService } from './auth.service.ts';
import { AccountsPurge } from './purge.service.ts';
import { PasswordResetsRepository } from './password-resets.repository.ts';
import { SessionsRepository } from './sessions.repository.ts';
import { Clock } from '../shared/clock.ts';
import { Passwords } from '../shared/passwords.ts';
import { AuditLog } from '../audit/audit-log.ts';
import { UsersRepository } from './users.repository.ts';
import { UsersService } from './users.service.ts';

const providers = [
  AuthService,
  UsersService,
  AccountsPurge,
  UsersRepository,
  SessionsRepository,
  PasswordResetsRepository,
  Passwords,
  AuditLog,
  Clock,
];

@Module({ providers: providers, exports: providers })
export class AccountsModule {}
