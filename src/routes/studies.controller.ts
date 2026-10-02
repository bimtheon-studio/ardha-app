// Routes de l'étude (F-02), conformes à `studyRoutes` du contrat. Chaque route agit pour
// l'utilisateur connecté, sur ses seules études.
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { studyRoutes, type Study, type StudySummary, type User } from '../contracts/index.ts';
import { type Actor, StudiesService } from '../studies/studies.service.ts';
import { CurrentUser } from './http/session.guard.ts';
import { Validate } from './http/validation.ts';

const r = studyRoutes;
const path = (p: string) => p.replace(/^\/api\//, '');

type Output<S> = S extends z.ZodType ? z.output<S> : never;
type BodyOf<K extends keyof typeof r> = Output<(typeof r)[K]['body']>;
type QueryOf<K extends keyof typeof r> = Output<(typeof r)[K]['query']>;
type ParamsOf<K extends keyof typeof r> = Output<(typeof r)[K]['params']>;

function actor(user: User, request: Request): Actor & { userId: string } {
  return { userId: user.id, origin: 'api', ip: request.ip ?? null };
}

@Controller('api')
export class StudiesController {
  constructor(private readonly studies: StudiesService) {}

  @Get(path(r.studies.path))
  async list(@CurrentUser() user: User, @Req() req: Request, @Query(new Validate(r.studies.query)) q: QueryOf<'studies'>): Promise<{ studies: StudySummary[] }> {
    return { studies: await this.studies.list(actor(user, req), q) };
  }

  @Post(path(r.studyCreate.path))
  @HttpCode(r.studyCreate.status)
  create(@CurrentUser() user: User, @Req() req: Request, @Body(new Validate(r.studyCreate.body)) body: BodyOf<'studyCreate'>): Promise<Study> {
    return this.studies.create(actor(user, req), body.parcelIds);
  }

  @Get(path(r.study.path))
  get(@CurrentUser() user: User, @Req() req: Request, @Param(new Validate(r.study.params)) p: ParamsOf<'study'>): Promise<Study> {
    return this.studies.get(actor(user, req), p.id);
  }

  @Patch(path(r.studyUpdate.path))
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param(new Validate(r.studyUpdate.params)) p: ParamsOf<'studyUpdate'>,
    @Body(new Validate(r.studyUpdate.body)) body: BodyOf<'studyUpdate'>,
  ): Promise<Study> {
    return this.studies.update(actor(user, req), p.id, body);
  }

  @Delete(path(r.studyDelete.path))
  @HttpCode(r.studyDelete.status)
  trash(@CurrentUser() user: User, @Req() req: Request, @Param(new Validate(r.studyDelete.params)) p: ParamsOf<'studyDelete'>): Promise<void> {
    return this.studies.trash(actor(user, req), p.id);
  }

  @Post(path(r.studyRestore.path))
  @HttpCode(r.studyRestore.status)
  restore(@CurrentUser() user: User, @Req() req: Request, @Param(new Validate(r.studyRestore.params)) p: ParamsOf<'studyRestore'>): Promise<Study> {
    return this.studies.restore(actor(user, req), p.id);
  }

  @Post(path(r.studyDuplicate.path))
  @HttpCode(r.studyDuplicate.status)
  duplicate(@CurrentUser() user: User, @Req() req: Request, @Param(new Validate(r.studyDuplicate.params)) p: ParamsOf<'studyDuplicate'>): Promise<Study> {
    return this.studies.duplicate(actor(user, req), p.id);
  }

  @Put(path(r.studyParcelAdd.path))
  addParcel(@CurrentUser() user: User, @Req() req: Request, @Param(new Validate(r.studyParcelAdd.params)) p: ParamsOf<'studyParcelAdd'>): Promise<Study> {
    return this.studies.addParcel(actor(user, req), p.id, p.parcelId);
  }

  @Delete(path(r.studyParcelRemove.path))
  removeParcel(@CurrentUser() user: User, @Req() req: Request, @Param(new Validate(r.studyParcelRemove.params)) p: ParamsOf<'studyParcelRemove'>): Promise<Study> {
    return this.studies.removeParcel(actor(user, req), p.id, p.parcelId);
  }

  /** L'URL porte l'empreinte (`?v=`) : l'image ne change jamais à URL égale. */
  @Get(path(r.studyThumbnail.path))
  async thumbnail(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param(new Validate(r.studyThumbnail.params)) p: ParamsOf<'studyThumbnail'>,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.studies.thumbnail(actor(user, req), p.id);
    res.set({ 'Content-Type': file.contentType, 'Cache-Control': 'private, max-age=31536000, immutable' }).send(file.body);
  }
}
