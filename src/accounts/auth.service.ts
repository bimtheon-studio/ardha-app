// Inscription, connexion, déconnexion, session courante, réinitialisation par lien (F-00).
import { Injectable } from '@nestjs/common';
import {
  cookieDurationMs,
  initialDeadlines,
  PASSWORD_MESSAGES,
  normalizeEmail,
  passwordProblem,
  renewal,
  sessionExpired,
} from '../domain/index.ts';
import type { Login, Signup, PasswordReset, User } from '../contracts/index.ts';

import type { UserRow } from '../db/schema.ts';
import { DomainError } from '../shared/errors.ts';
import { Clock } from '../shared/clock.ts';
import { hashToken, newToken } from '../shared/tokens.ts';
import { Passwords } from '../shared/passwords.ts';
import { AuditLog } from '../audit/audit-log.ts';
import { UsersRepository } from './users.repository.ts';
import { PasswordResetsRepository } from './password-resets.repository.ts';
import { SessionsRepository } from './sessions.repository.ts';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface OpenedSession {
  user: User;
  /** Jeton en clair, pour le cookie. Jamais stocké. */
  token: string;
  cookieDurationMs: number;
}

export interface CurrentSession {
  user: User;
  sessionId: string;
  /** Présent quand la session vient d'être prolongée : le cookie doit l'être aussi. */
  renewedCookieMs?: number;
}

export function toUser(u: UserRow): User {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

export function rejectPassword(password: string, email: string): void {
  const problem = passwordProblem(password, email);
  if (problem) {
    throw new DomainError('password-rejected', PASSWORD_MESSAGES[problem], {
      password: PASSWORD_MESSAGES[problem],
    });
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly passwordResets: PasswordResetsRepository,
    private readonly passwords: Passwords,
    private readonly auditLog: AuditLog,
    private readonly clock: Clock,
  ) {}

  async signup(request: Signup, ctx: RequestContext): Promise<OpenedSession> {
    const email = normalizeEmail(request.email);
    rejectPassword(request.password, email);
    const created = await this.users.create({
      email,
      name: request.name.trim(),
      role: 'user',
      passwordHash: await this.passwords.hash(request.password),
    });
    if (!created) throw new DomainError('email-taken', undefined, { email: 'Cette adresse e-mail est déjà utilisée.' });
    await this.auditLog.record({ origin: 'api', action: 'user.signed-up', actorId: created.id, targetId: created.id, ip: ctx.ip });
    return this.openSession(created, ctx);
  }

  async login(request: Login, ctx: RequestContext): Promise<OpenedSession> {
    const email = normalizeEmail(request.email);
    const u = await this.users.byEmail(email);
    const valid = await this.passwords.verify(u?.passwordHash, request.password);
    if (!u || !valid) {
      await this.auditLog.record({ origin: 'api', action: 'login.failed', targetId: u?.id, details: { email }, ip: ctx.ip });
      throw new DomainError('invalid-credentials');
    }
    // Le compte désactivé ne se dit qu'une fois le mot de passe vérifié : l'information ne sert qu'à son titulaire.
    if (u.deactivatedAt) {
      await this.auditLog.record({ origin: 'api', action: 'login.refused-deactivated', targetId: u.id, ip: ctx.ip });
      throw new DomainError('account-deactivated');
    }
    const opened = await this.openSession(u, ctx);
    await this.auditLog.record({ origin: 'api', action: 'login.succeeded', actorId: u.id, ip: ctx.ip });
    return opened;
  }

  async logout(token: string | undefined, ctx: RequestContext): Promise<void> {
    if (!token) return;
    const found = await this.sessions.byTokenHash(hashToken(token));
    if (!found) return;
    await this.sessions.remove(found.session.id);
    await this.auditLog.record({ origin: 'api', action: 'logout', actorId: found.user.id, ip: ctx.ip });
  }

  /** Session valide du jeton, prolongée au besoin ; `null` si le jeton ne mène à rien d'utilisable. */
  async currentSession(token: string | undefined): Promise<CurrentSession | null> {
    if (!token) return null;
    const found = await this.sessions.byTokenHash(hashToken(token));
    if (!found) return null;
    const { session, user } = found;
    const now = this.clock.now();
    if (sessionExpired(session, now) || user.deactivatedAt) {
      await this.sessions.remove(session.id);
      return null;
    }
    const current: CurrentSession = { user: toUser(user), sessionId: session.id };
    const expiresAt = renewal(session, now);
    if (expiresAt) {
      await this.sessions.renew(session.id, expiresAt, now);
      current.renewedCookieMs = cookieDurationMs({ ...session, expiresAt }, now);
    }
    return current;
  }

  async resetPassword(request: PasswordReset, ctx: RequestContext): Promise<void> {
    const tokenHash = hashToken(request.token);
    const now = this.clock.now();
    const link = await this.passwordResets.byTokenHash(tokenHash);
    const u = link && (await this.users.byId(link.userId));
    if (!link || !u || link.usedAt || link.expiresAt <= now) throw new DomainError('invalid-link');
    // La politique d'abord : un mot de passe refusé ne consomme pas le lien.
    rejectPassword(request.password, u.email);
    const hash = await this.passwords.hash(request.password);
    if (!(await this.passwordResets.consume(tokenHash, now))) throw new DomainError('invalid-link');
    await this.users.update(u.id, { passwordHash: hash }, now);
    const closedCount = await this.sessions.removeForUser(u.id);
    await this.auditLog.record({
      origin: 'api',
      action: 'password.reset',
      actorId: u.id,
      targetId: u.id,
      details: { closedSessions: closedCount },
      ip: ctx.ip,
    });
  }

  private async openSession(u: UserRow, ctx: RequestContext): Promise<OpenedSession> {
    const now = this.clock.now();
    const deadlines = initialDeadlines(now);
    const { token, tokenHash } = newToken();
    await this.sessions.create({
      userId: u.id,
      tokenHash: tokenHash,
      ...deadlines,
      createdAt: now,
      lastActivityAt: now,
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 500) ?? null,
    });
    return { user: toUser(u), token, cookieDurationMs: cookieDurationMs(deadlines, now) };
  }
}
