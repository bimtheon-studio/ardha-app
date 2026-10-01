// Routes de l'analyse des risques (F-04), conformes à `riskRoutes` du contrat.
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { riskRoutes, type StudyRisks, type User } from '../contracts/index.ts';
import { RisksService } from '../studies/risks.service.ts';
import { CurrentUser } from './http/session.guard.ts';
import { Validate } from './http/validation.ts';

const r = riskRoutes;
const path = (p: string) => p.replace(/^\/api\//, '');

@Controller('api')
export class RisksController {
  constructor(private readonly risks: RisksService) {}

  @Get(path(r.studyRisks.path))
  get(@CurrentUser() user: User, @Req() req: Request, @Param(new Validate(r.studyRisks.params)) p: { id: string }): Promise<StudyRisks> {
    return this.risks.get({ userId: user.id, origin: 'api', ip: req.ip ?? null }, p.id);
  }

  @Post(path(r.studyRisksRequest.path))
  @HttpCode(r.studyRisksRequest.status)
  request(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param(new Validate(r.studyRisksRequest.params)) p: { id: string },
    @Body(new Validate(r.studyRisksRequest.body)) body: { force: boolean },
  ): Promise<StudyRisks> {
    return this.risks.request({ userId: user.id, origin: 'api', ip: req.ip ?? null }, p.id, body.force);
  }
}
