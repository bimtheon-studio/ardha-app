import 'reflect-metadata';

import { CommandFactory } from 'nest-commander';

import { CliModule } from './cli.module.ts';
import { DomainError } from '../shared/errors.ts';

function report(error: unknown): void {
  console.error(error instanceof DomainError || error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

await CommandFactory.run(CliModule.forConfig(), {
  logger: ['error', 'warn'],
  cliName: 'ardha',
  errorHandler: report,
  serviceErrorHandler: report,
});
