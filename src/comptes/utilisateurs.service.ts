// Administration des comptes, pour la CLI : créer un administrateur, créer un lien de
// réinitialisation (sans e-mail en v1, l'administrateur le transmet), désactiver, réactiver.
import { Inject, Injectable } from '@nestjs/common';
import { echeanceLien, normaliserEmail, urlLienReinitialisation } from '../domaine/index.ts';

import { refuserMotDePasse } from './auth.service.ts';
import { ReinitialisationsRepository } from './reinitialisations.repository.ts';
import { SessionsRepository } from './sessions.repository.ts';
import type { LigneUtilisateur } from '../base/schema.ts';
import { ErreurMetier } from '../commun/erreurs.ts';
import { Horloge } from '../commun/horloge.ts';
import { nouveauJeton } from '../commun/jetons.ts';
import { MotsDePasse } from '../commun/mots-de-passe.ts';
import { CONFIG, type Config } from '../config/config.ts';
import { Journal } from '../journal/journal.ts';
import { UtilisateursRepository } from './utilisateurs.repository.ts';

export interface LienCree {
  url: string;
  expireLe: Date;
}

@Injectable()
export class UtilisateursService {
  constructor(
    private readonly utilisateurs: UtilisateursRepository,
    private readonly sessions: SessionsRepository,
    private readonly reinitialisations: ReinitialisationsRepository,
    private readonly motsDePasse: MotsDePasse,
    private readonly journal: Journal,
    private readonly horloge: Horloge,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /**
   * Crée un administrateur. Sans mot de passe fourni, le compte n'en a pas encore : on rend un lien
   * pour le choisir (le mot de passe ne passe ainsi ni par l'historique du shell, ni par l'écran).
   */
  async creerAdmin(entree: { email: string; nom: string; motDePasse?: string }): Promise<{ utilisateur: LigneUtilisateur; lien?: LienCree }> {
    const email = normaliserEmail(entree.email);
    if (entree.motDePasse !== undefined) refuserMotDePasse(entree.motDePasse, email);
    const cree = await this.utilisateurs.creer({
      email,
      nom: entree.nom.trim(),
      role: 'admin',
      motDePasseHash: entree.motDePasse === undefined ? null : await this.motsDePasse.hacher(entree.motDePasse),
    });
    if (!cree) throw new ErreurMetier('email-deja-utilise');
    await this.journal.noter({ origine: 'cli', action: 'utilisateur.admin-cree', cibleId: cree.id, details: { email } });
    if (entree.motDePasse !== undefined) return { utilisateur: cree };
    return { utilisateur: cree, lien: await this.lienPour(cree) };
  }

  async creerLienReinitialisation(email: string): Promise<LienCree> {
    return this.lienPour(await this.exiger(email));
  }

  /** Désactive le compte et ferme ses sessions ; rend le nombre de sessions fermées. */
  async desactiver(email: string): Promise<number> {
    const u = await this.exiger(email);
    const maintenant = this.horloge.maintenant();
    await this.utilisateurs.modifier(u.id, { desactiveLe: u.desactiveLe ?? maintenant }, maintenant);
    const fermees = await this.sessions.supprimerDe(u.id);
    await this.journal.noter({ origine: 'cli', action: 'utilisateur.desactive', cibleId: u.id, details: { sessionsFermees: fermees } });
    return fermees;
  }

  async reactiver(email: string): Promise<void> {
    const u = await this.exiger(email);
    await this.utilisateurs.modifier(u.id, { desactiveLe: null }, this.horloge.maintenant());
    await this.journal.noter({ origine: 'cli', action: 'utilisateur.reactive', cibleId: u.id });
  }

  lister(): Promise<LigneUtilisateur[]> {
    return this.utilisateurs.lister();
  }

  private async exiger(email: string): Promise<LigneUtilisateur> {
    const u = await this.utilisateurs.parEmail(normaliserEmail(email));
    if (!u) throw new ErreurMetier('utilisateur-inconnu');
    return u;
  }

  private async lienPour(u: LigneUtilisateur): Promise<LienCree> {
    const maintenant = this.horloge.maintenant();
    const expireLe = echeanceLien(maintenant);
    const { jeton, empreinte } = nouveauJeton();
    await this.reinitialisations.annulerOuverts(u.id, maintenant);
    await this.reinitialisations.creer(u.id, empreinte, maintenant, expireLe);
    await this.journal.noter({ origine: 'cli', action: 'reinitialisation.lien-cree', cibleId: u.id, details: { expireLe } });
    return { url: urlLienReinitialisation(this.config.WEB_ORIGIN, jeton), expireLe };
  }
}
