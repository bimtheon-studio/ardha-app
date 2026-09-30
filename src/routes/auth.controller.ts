// Routes de l'authentification, conformes à `authRoutes` du contrat.
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Login, Signup, PasswordReset, authRoutes, type User } from '../contracts/index.ts';
import type { Request, Response } from 'express';

import { CONFIG, type Config } from '../config/config.ts';
import { clearSessionCookie, setSessionCookie } from './http/cookie.ts';
import { RateLimiter } from './http/rate-limit.ts';
import { Public, CurrentUser } from './http/session.guard.ts';
import { Validate } from './http/validation.ts';
import { AuthService, type RequestContext } from '../accounts/auth.service.ts';

const r = authRoutes;
const path = (c: string) => c.replace(/^\/api\/auth\//, '');

function context(request: Request): RequestContext {
  return { ip: request.ip ?? null, userAgent: request.headers['user-agent'] ?? null };
}

@Controller('api/auth')
@UseGuards(RateLimiter)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Post(path(r.signup.path))
  @HttpCode(r.signup.status)
  @Public()
  @SkipThrottle({ email: true })
  async signup(
    @Body(new Validate(Signup)) body: Signup,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<User> {
    const opened = await this.auth.signup(body, context(request));
    setSessionCookie(response, this.config, opened.token, opened.cookieDurationMs);
    return opened.user;
  }

  @Post(path(r.login.path))
  @HttpCode(r.login.status)
  @Public()
  async login(
    @Body(new Validate(Login)) body: Login,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<User> {
    const opened = await this.auth.login(body, context(request));
    setSessionCookie(response, this.config, opened.token, opened.cookieDurationMs);
    return opened.user;
  }

  @Post(path(r.logout.path))
  @HttpCode(r.logout.status)
  @Public()
  @SkipThrottle({ ip: true, email: true })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const token = (request.cookies as Record<string, string> | undefined)?.[this.config.SESSION_COOKIE_NAME];
    await this.auth.logout(token, context(request));
    clearSessionCookie(response, this.config);
  }

  @Get(path(r.me.path))
  @HttpCode(r.me.status)
  @SkipThrottle({ ip: true, email: true })
  me(@CurrentUser() user: User): User {
    return user;
  }

  @Post(path(r.passwordReset.path))
  @HttpCode(r.passwordReset.status)
  @Public()
  @SkipThrottle({ email: true })
  async passwordReset(
    @Body(new Validate(PasswordReset)) body: PasswordReset,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.resetPassword(body, context(request));
    clearSessionCookie(response, this.config);
  }
}
