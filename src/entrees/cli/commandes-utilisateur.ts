// Administration des comptes en ligne de commande (F-00, Q5 et Q9). Sans e-mail en v1, les liens
// de réinitialisation s'affichent ici et l'administrateur les transmet.
import { Command, CommandRunner, Option } from 'nest-commander';

import { UtilisateursService } from '../../comptes/utilisateurs.service.ts';

interface OptionsEmail {
  email: string;
}

function dateFr(d: Date): string {
  return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
}

async function lireEntreeStandard(): Promise<string> {
  const morceaux: Buffer[] = [];
  for await (const m of process.stdin) morceaux.push(m as Buffer);
  return Buffer.concat(morceaux).toString('utf8').replace(/\r?\n$/, '');
}

abstract class CommandeAvecEmail extends CommandRunner {
  @Option({ flags: '-e, --email <email>', description: 'Adresse e-mail du compte', required: true })
  lireEmail(valeur: string): string {
    return valeur;
  }
}

@Command({
  name: 'utilisateur:creer-admin',
  description: 'Crée un administrateur ; sans --mot-de-passe-stdin, affiche un lien pour choisir le mot de passe',
})
export class CommandeCreerAdmin extends CommandeAvecEmail {
  constructor(private readonly utilisateurs: UtilisateursService) {
    super();
  }

  @Option({ flags: '-n, --nom <nom>', description: 'Nom affiché', required: true })
  lireNom(valeur: string): string {
    return valeur;
  }

  @Option({ flags: '--mot-de-passe-stdin', description: 'Lit le mot de passe sur l’entrée standard' })
  lireStdin(): boolean {
    return true;
  }

  async run(_: string[], options: OptionsEmail & { nom: string; motDePasseStdin?: boolean }): Promise<void> {
    const motDePasse = options.motDePasseStdin ? await lireEntreeStandard() : undefined;
    const { utilisateur, lien } = await this.utilisateurs.creerAdmin({
      email: options.email,
      nom: options.nom,
      ...(motDePasse !== undefined && { motDePasse }),
    });
    console.log(`Administrateur créé : ${utilisateur.email} (${utilisateur.id}).`);
    if (lien) {
      console.log(`Lien pour choisir le mot de passe, valable jusqu'au ${dateFr(lien.expireLe)} :\n${lien.url}`);
    }
  }
}

@Command({
  name: 'utilisateur:reinitialiser-mot-de-passe',
  description: 'Crée un lien à usage unique (24 h) pour choisir un nouveau mot de passe ; annule le précédent',
})
export class CommandeReinitialiser extends CommandeAvecEmail {
  constructor(private readonly utilisateurs: UtilisateursService) {
    super();
  }

  async run(_: string[], options: OptionsEmail): Promise<void> {
    const lien = await this.utilisateurs.creerLienReinitialisation(options.email);
    console.log(`Lien à transmettre, valable jusqu'au ${dateFr(lien.expireLe)} :\n${lien.url}`);
  }
}

@Command({ name: 'utilisateur:desactiver', description: 'Désactive un compte et ferme ses sessions' })
export class CommandeDesactiver extends CommandeAvecEmail {
  constructor(private readonly utilisateurs: UtilisateursService) {
    super();
  }

  async run(_: string[], options: OptionsEmail): Promise<void> {
    const fermees = await this.utilisateurs.desactiver(options.email);
    console.log(`Compte désactivé ; ${fermees} session(s) fermée(s).`);
  }
}

@Command({ name: 'utilisateur:reactiver', description: 'Réactive un compte désactivé' })
export class CommandeReactiver extends CommandeAvecEmail {
  constructor(private readonly utilisateurs: UtilisateursService) {
    super();
  }

  async run(_: string[], options: OptionsEmail): Promise<void> {
    await this.utilisateurs.reactiver(options.email);
    console.log('Compte réactivé.');
  }
}

@Command({ name: 'utilisateur:lister', description: 'Liste les comptes' })
export class CommandeLister extends CommandRunner {
  constructor(private readonly utilisateurs: UtilisateursService) {
    super();
  }

  async run(): Promise<void> {
    const liste = await this.utilisateurs.lister();
    if (liste.length === 0) return console.log('Aucun compte.');
    for (const u of liste) {
      const etat = u.desactiveLe ? 'désactivé' : u.motDePasseHash ? 'actif' : 'mot de passe à choisir';
      console.log(`${u.email}\t${u.role}\t${etat}\t${u.nom}\tcréé le ${dateFr(u.creeLe)}`);
    }
  }
}
