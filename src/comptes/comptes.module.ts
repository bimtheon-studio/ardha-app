// Les comptes : repositories, services et journal, partagés par l'API, le worker et la CLI.
import { Module } from '@nestjs/common';

import { AuthService } from './auth.service.ts';
import { PurgeComptes } from './purge.service.ts';
import { ReinitialisationsRepository } from './reinitialisations.repository.ts';
import { SessionsRepository } from './sessions.repository.ts';
import { Horloge } from '../commun/horloge.ts';
import { MotsDePasse } from '../commun/mots-de-passe.ts';
import { Journal } from '../journal/journal.ts';
import { UtilisateursRepository } from './utilisateurs.repository.ts';
import { UtilisateursService } from './utilisateurs.service.ts';

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
