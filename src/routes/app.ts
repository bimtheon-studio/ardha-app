// Construction de l'application HTTP, partagée par `routes/main.ts` et les tests d'intégration.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';

import { ApiModule } from './api.module.ts';
import { CONFIG, type Config } from '../config/config.ts';
import { serveFrontend } from './http/frontend.ts';

/** Réglages HTTP communs à l'application réelle et à celle des tests. */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const c = app.get<Config>(CONFIG);
  app.set('trust proxy', c.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });
  app.enableShutdownHooks();
  if (c.FRONTEND_DIR) serveFrontend(app, c.FRONTEND_DIR);
  return app;
}

export async function createApp(config?: Config): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(ApiModule.forConfig(config), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  return configureApp(app);
}
