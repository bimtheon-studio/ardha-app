// Administration des comptes en ligne de commande (F-00, Q5 et Q9). Sans e-mail en v1, les liens
// de réinitialisation s'affichent ici et l'administrateur les transmet.
import { Command, CommandRunner, Option } from 'nest-commander';

import { UsersService } from '../accounts/users.service.ts';

interface EmailOptions {
  email: string;
}

function frenchDate(d: Date): string {
  return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const m of process.stdin) chunks.push(m as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

abstract class EmailCommand extends CommandRunner {
  @Option({ flags: '-e, --email <email>', description: 'Adresse e-mail du compte', required: true })
  parseEmail(value: string): string {
    return value;
  }
}

@Command({
  name: 'user:create-admin',
  description: 'Crée un administrateur ; sans --password-stdin, affiche un lien pour choisir le mot de passe',
})
export class CreateAdminCommand extends EmailCommand {
  constructor(private readonly users: UsersService) {
    super();
  }

  @Option({ flags: '-n, --name <name>', description: 'Nom affiché', required: true })
  parseName(value: string): string {
    return value;
  }

  @Option({ flags: '--password-stdin', description: 'Lit le mot de passe sur l’entrée standard' })
  parsePasswordStdin(): boolean {
    return true;
  }

  async run(_: string[], options: EmailOptions & { name: string; passwordStdin?: boolean }): Promise<void> {
    const password = options.passwordStdin ? await readStdin() : undefined;
    const { user, link } = await this.users.createAdmin({
      email: options.email,
      name: options.name,
      ...(password !== undefined && { password }),
    });
    console.log(`Administrateur créé : ${user.email} (${user.id}).`);
    if (link) {
      console.log(`Lien pour choisir le mot de passe, valable jusqu'au ${frenchDate(link.expiresAt)} :\n${link.url}`);
    }
  }
}

@Command({
  name: 'user:reset-password',
  description: 'Crée un lien à usage unique (24 h) pour choisir un nouveau mot de passe ; annule le précédent',
})
export class ResetPasswordCommand extends EmailCommand {
  constructor(private readonly users: UsersService) {
    super();
  }

  async run(_: string[], options: EmailOptions): Promise<void> {
    const link = await this.users.createResetLink(options.email);
    console.log(`Lien à transmettre, valable jusqu'au ${frenchDate(link.expiresAt)} :\n${link.url}`);
  }
}

@Command({ name: 'user:deactivate', description: 'Désactive un compte et ferme ses sessions' })
export class DeactivateCommand extends EmailCommand {
  constructor(private readonly users: UsersService) {
    super();
  }

  async run(_: string[], options: EmailOptions): Promise<void> {
    const closedCount = await this.users.deactivate(options.email);
    console.log(`Compte désactivé ; ${closedCount} session(s) fermée(s).`);
  }
}

@Command({ name: 'user:reactivate', description: 'Réactive un compte désactivé' })
export class ReactivateCommand extends EmailCommand {
  constructor(private readonly users: UsersService) {
    super();
  }

  async run(_: string[], options: EmailOptions): Promise<void> {
    await this.users.reactivate(options.email);
    console.log('Compte réactivé.');
  }
}

@Command({ name: 'user:list', description: 'Liste les comptes' })
export class ListUsersCommand extends CommandRunner {
  constructor(private readonly users: UsersService) {
    super();
  }

  async run(): Promise<void> {
    const list = await this.users.list();
    if (list.length === 0) return console.log('Aucun compte.');
    for (const u of list) {
      const status = u.deactivatedAt ? 'désactivé' : u.passwordHash ? 'actif' : 'mot de passe à choisir';
      console.log(`${u.email}\t${u.role}\t${status}\t${u.name}\tcréé le ${frenchDate(u.createdAt)}`);
    }
  }
}
