import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { WorkerModule } from './worker.module.ts';

const app = await NestFactory.createApplicationContext(WorkerModule.forConfig(), { bufferLogs: true });
app.useLogger(app.get(Logger));
app.enableShutdownHooks();
