import 'reflect-metadata';

import { CommandFactory } from 'nest-commander';

import { CliModule } from './cli.module.ts';
import { ErreurMetier } from '../../commun/erreurs.ts';

function signaler(erreur: unknown): void {
  console.error(erreur instanceof ErreurMetier || erreur instanceof Error ? erreur.message : String(erreur));
  process.exitCode = 1;
}

await CommandFactory.run(CliModule.pour(), {
  logger: ['error', 'warn'],
  cliName: 'ardha',
  errorHandler: signaler,
  serviceErrorHandler: signaler,
});
