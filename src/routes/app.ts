// Construction de l'application HTTP, partagée par `main-api.ts` et les tests d'intégration.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';

import { ApiModule } from './api.module.ts';
import { CONFIG, type Config } from '../config/config.ts';

/** Réglages HTTP communs à l'application réelle et à celle des tests. */
export function configurer(app: NestExpressApplication): NestExpressApplication {
  const c = app.get<Config>(CONFIG);
  app.set('trust proxy', c.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });
  app.enableShutdownHooks();
  return app;
}

export async function creerApplication(config?: Config): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(ApiModule.pour(config), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  return configurer(app);
}
