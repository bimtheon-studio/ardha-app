// Routes de l'analyse de marché (F-05), conformes à `marketRoutes` du contrat.
import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { type MarketResult, type MarketSales, marketRoutes, type StudyMarket, type User } from '../contracts/index.ts';
import { MarketService } from '../studies/market.service.ts';
import { CurrentUser } from './http/session.guard.ts';
import { Validate } from './http/validation.ts';

const r = marketRoutes;
const path = (p: string) => p.replace(/^\/api\//, '');
const actor = (user: User, req: Request) => ({ userId: user.id, origin: 'api' as const, ip: req.ip ?? null });

@Controller('api')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get(path(r.studyMarket.path))
  get(@CurrentUser() user: User, @Req() req: Request, @Param(new Validate(r.studyMarket.params)) p: { id: string }): Promise<StudyMarket> {
    return this.market.get(actor(user, req), p.id);
  }

  @Post(path(r.studyMarketRequest.path))
  @HttpCode(r.studyMarketRequest.status)
  request(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param(new Validate(r.studyMarketRequest.params)) p: { id: string },
    @Body(new Validate(r.studyMarketRequest.body)) body: { force: boolean; radiusM?: MarketResult['radiusM'] },
  ): Promise<StudyMarket> {
    return this.market.request(actor(user, req), p.id, body);
  }

  @Get(path(r.studyMarketSales.path))
  sales(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param(new Validate(r.studyMarketSales.params)) p: { id: string },
    @Query(new Validate(r.studyMarketSales.query)) q: { type: string; segment: 'all' | 'existing' | 'new'; from?: number },
  ): Promise<MarketSales> {
    return this.market.sales(actor(user, req), p.id, q);
  }
}
