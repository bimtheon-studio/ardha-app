// Administration des comptes, pour la CLI : créer un administrateur, créer un lien de
// réinitialisation (sans e-mail en v1, l'administrateur le transmet), désactiver, réactiver.
import { Inject, Injectable } from '@nestjs/common';
import { linkDeadline, normalizeEmail, resetLinkUrl } from '../domain/index.ts';

import { rejectPassword } from './auth.service.ts';
import { PasswordResetsRepository } from './password-resets.repository.ts';
import { SessionsRepository } from './sessions.repository.ts';
import type { UserRow } from '../db/schema.ts';
import { DomainError } from '../shared/errors.ts';
import { Clock } from '../shared/clock.ts';
import { newToken } from '../shared/tokens.ts';
import { Passwords } from '../shared/passwords.ts';
import { CONFIG, type Config } from '../config/config.ts';
import { AuditLog } from '../audit/audit-log.ts';
import { UsersRepository } from './users.repository.ts';

export interface CreatedLink {
  url: string;
  expiresAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly passwordResets: PasswordResetsRepository,
    private readonly passwords: Passwords,
    private readonly auditLog: AuditLog,
    private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /**
   * Crée un administrateur. Sans mot de passe fourni, le compte n'en a pas encore : on rend un lien
   * pour le choisir (le mot de passe ne passe ainsi ni par l'historique du shell, ni par l'écran).
   */
  async createAdmin(input: { email: string; name: string; password?: string }): Promise<{ user: UserRow; link?: CreatedLink }> {
    const email = normalizeEmail(input.email);
    if (input.password !== undefined) rejectPassword(input.password, email);
    const created = await this.users.create({
      email,
      name: input.name.trim(),
      role: 'admin',
      passwordHash: input.password === undefined ? null : await this.passwords.hash(input.password),
    });
    if (!created) throw new DomainError('email-taken');
    await this.auditLog.record({ origin: 'cli', action: 'user.admin-created', targetId: created.id, details: { email } });
    if (input.password !== undefined) return { user: created };
    return { user: created, link: await this.linkFor(created) };
  }

  async createResetLink(email: string): Promise<CreatedLink> {
    return this.linkFor(await this.requireUser(email));
  }

  /**
   * Fixe le mot de passe d'un compte (administration, CLI : admin de recette des environnements de
   * PR, lot LD) et ferme ses sessions ; rend le nombre de sessions fermées.
   */
  async setPassword(email: string, password: string): Promise<number> {
    const u = await this.requireUser(email);
    rejectPassword(password, u.email);
    await this.users.update(u.id, { passwordHash: await this.passwords.hash(password) }, this.clock.now());
    const closedCount = await this.sessions.removeForUser(u.id);
    await this.auditLog.record({ origin: 'cli', action: 'user.password-set', targetId: u.id, details: { closedSessions: closedCount } });
    return closedCount;
  }

  /** Désactive le compte et ferme ses sessions ; rend le nombre de sessions fermées. */
  async deactivate(email: string): Promise<number> {
    const u = await this.requireUser(email);
    const now = this.clock.now();
    await this.users.update(u.id, { deactivatedAt: u.deactivatedAt ?? now }, now);
    const closedCount = await this.sessions.removeForUser(u.id);
    await this.auditLog.record({ origin: 'cli', action: 'user.deactivated', targetId: u.id, details: { closedSessions: closedCount } });
    return closedCount;
  }

  async reactivate(email: string): Promise<void> {
    const u = await this.requireUser(email);
    await this.users.update(u.id, { deactivatedAt: null }, this.clock.now());
    await this.auditLog.record({ origin: 'cli', action: 'user.reactivated', targetId: u.id });
  }

  list(): Promise<UserRow[]> {
    return this.users.list();
  }

  private async requireUser(email: string): Promise<UserRow> {
    const u = await this.users.byEmail(normalizeEmail(email));
    if (!u) throw new DomainError('unknown-user');
    return u;
  }

  private async linkFor(u: UserRow): Promise<CreatedLink> {
    const now = this.clock.now();
    const expiresAt = linkDeadline(now);
    const { token, tokenHash } = newToken();
    await this.passwordResets.cancelOpen(u.id, now);
    await this.passwordResets.create(u.id, tokenHash, now, expiresAt);
    await this.auditLog.record({ origin: 'cli', action: 'password-reset.link-created', targetId: u.id, details: { expiresAt } });
    return { url: resetLinkUrl(this.config.WEB_ORIGIN, token), expiresAt };
  }
}
