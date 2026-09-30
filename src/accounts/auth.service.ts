// Inscription, connexion, déconnexion, session courante, réinitialisation par lien (F-00).
import { Injectable } from '@nestjs/common';
import {
  dureeCookieMs,
  echeancesInitiales,
  MESSAGES_MOT_DE_PASSE,
  normaliserEmail,
  problemeMotDePasse,
  prolongation,
  sessionExpiree,
} from '../domain/index.ts';
import type { Connexion, Inscription, Reinitialisation, Utilisateur } from '../contracts/index.ts';

import type { LigneUtilisateur } from '../db/schema.ts';
import { ErreurMetier } from '../shared/errors.ts';
import { Horloge } from '../shared/clock.ts';
import { empreinteJeton, nouveauJeton } from '../shared/tokens.ts';
import { MotsDePasse } from '../shared/passwords.ts';
import { Journal } from '../audit/audit-log.ts';
import { UtilisateursRepository } from './users.repository.ts';
import { ReinitialisationsRepository } from './password-resets.repository.ts';
import { SessionsRepository } from './sessions.repository.ts';

export interface ContexteRequete {
  ip: string | null;
  agentUtilisateur: string | null;
}

export interface SessionOuverte {
  utilisateur: Utilisateur;
  /** Jeton en clair, pour le cookie. Jamais stocké. */
  jeton: string;
  dureeCookieMs: number;
}

export interface SessionCourante {
  utilisateur: Utilisateur;
  sessionId: string;
  /** Présent quand la session vient d'être prolongée : le cookie doit l'être aussi. */
  nouvelleDureeCookieMs?: number;
}

export function versUtilisateur(u: LigneUtilisateur): Utilisateur {
  return { id: u.id, email: u.email, nom: u.nom, role: u.role };
}

export function refuserMotDePasse(motDePasse: string, email: string): void {
  const probleme = problemeMotDePasse(motDePasse, email);
  if (probleme) {
    throw new ErreurMetier('mot-de-passe-refuse', MESSAGES_MOT_DE_PASSE[probleme], {
      motDePasse: MESSAGES_MOT_DE_PASSE[probleme],
    });
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly utilisateurs: UtilisateursRepository,
    private readonly sessions: SessionsRepository,
    private readonly reinitialisations: ReinitialisationsRepository,
    private readonly motsDePasse: MotsDePasse,
    private readonly journal: Journal,
    private readonly horloge: Horloge,
  ) {}

  async inscrire(demande: Inscription, ctx: ContexteRequete): Promise<SessionOuverte> {
    const email = normaliserEmail(demande.email);
    refuserMotDePasse(demande.motDePasse, email);
    const cree = await this.utilisateurs.creer({
      email,
      nom: demande.nom.trim(),
      role: 'utilisateur',
      motDePasseHash: await this.motsDePasse.hacher(demande.motDePasse),
    });
    if (!cree) throw new ErreurMetier('email-deja-utilise', undefined, { email: 'Cette adresse e-mail est déjà utilisée.' });
    await this.journal.noter({ origine: 'api', action: 'utilisateur.inscrit', acteurId: cree.id, cibleId: cree.id, ip: ctx.ip });
    return this.ouvrirSession(cree, ctx);
  }

  async connecter(demande: Connexion, ctx: ContexteRequete): Promise<SessionOuverte> {
    const email = normaliserEmail(demande.email);
    const u = await this.utilisateurs.parEmail(email);
    const valide = await this.motsDePasse.verifier(u?.motDePasseHash, demande.motDePasse);
    if (!u || !valide) {
      await this.journal.noter({ origine: 'api', action: 'connexion.echouee', cibleId: u?.id, details: { email }, ip: ctx.ip });
      throw new ErreurMetier('identifiants-invalides');
    }
    // Le compte désactivé ne se dit qu'une fois le mot de passe vérifié : l'information ne sert qu'à son titulaire.
    if (u.desactiveLe) {
      await this.journal.noter({ origine: 'api', action: 'connexion.refusee-compte-desactive', cibleId: u.id, ip: ctx.ip });
      throw new ErreurMetier('compte-desactive');
    }
    const ouverte = await this.ouvrirSession(u, ctx);
    await this.journal.noter({ origine: 'api', action: 'connexion.reussie', acteurId: u.id, ip: ctx.ip });
    return ouverte;
  }

  async deconnecter(jeton: string | undefined, ctx: ContexteRequete): Promise<void> {
    if (!jeton) return;
    const trouvee = await this.sessions.parEmpreinte(empreinteJeton(jeton));
    if (!trouvee) return;
    await this.sessions.supprimer(trouvee.session.id);
    await this.journal.noter({ origine: 'api', action: 'deconnexion', acteurId: trouvee.utilisateur.id, ip: ctx.ip });
  }

  /** Session valide du jeton, prolongée au besoin ; `null` si le jeton ne mène à rien d'utilisable. */
  async sessionCourante(jeton: string | undefined): Promise<SessionCourante | null> {
    if (!jeton) return null;
    const trouvee = await this.sessions.parEmpreinte(empreinteJeton(jeton));
    if (!trouvee) return null;
    const { session, utilisateur } = trouvee;
    const maintenant = this.horloge.maintenant();
    if (sessionExpiree(session, maintenant) || utilisateur.desactiveLe) {
      await this.sessions.supprimer(session.id);
      return null;
    }
    const courante: SessionCourante = { utilisateur: versUtilisateur(utilisateur), sessionId: session.id };
    const expireLe = prolongation(session, maintenant);
    if (expireLe) {
      await this.sessions.prolonger(session.id, expireLe, maintenant);
      courante.nouvelleDureeCookieMs = dureeCookieMs({ ...session, expireLe }, maintenant);
    }
    return courante;
  }

  async reinitialiser(demande: Reinitialisation, ctx: ContexteRequete): Promise<void> {
    const empreinte = empreinteJeton(demande.jeton);
    const maintenant = this.horloge.maintenant();
    const lien = await this.reinitialisations.parEmpreinte(empreinte);
    const u = lien && (await this.utilisateurs.parId(lien.utilisateurId));
    if (!lien || !u || lien.utiliseLe || lien.expireLe <= maintenant) throw new ErreurMetier('lien-invalide');
    // La politique d'abord : un mot de passe refusé ne consomme pas le lien.
    refuserMotDePasse(demande.motDePasse, u.email);
    const hash = await this.motsDePasse.hacher(demande.motDePasse);
    if (!(await this.reinitialisations.consommer(empreinte, maintenant))) throw new ErreurMetier('lien-invalide');
    await this.utilisateurs.modifier(u.id, { motDePasseHash: hash }, maintenant);
    const fermees = await this.sessions.supprimerDe(u.id);
    await this.journal.noter({
      origine: 'api',
      action: 'mot-de-passe.reinitialise',
      acteurId: u.id,
      cibleId: u.id,
      details: { sessionsFermees: fermees },
      ip: ctx.ip,
    });
  }

  private async ouvrirSession(u: LigneUtilisateur, ctx: ContexteRequete): Promise<SessionOuverte> {
    const maintenant = this.horloge.maintenant();
    const echeances = echeancesInitiales(maintenant);
    const { jeton, empreinte } = nouveauJeton();
    await this.sessions.creer({
      utilisateurId: u.id,
      jetonHash: empreinte,
      ...echeances,
      creeLe: maintenant,
      derniereActiviteLe: maintenant,
      ip: ctx.ip,
      agentUtilisateur: ctx.agentUtilisateur?.slice(0, 500) ?? null,
    });
    return { utilisateur: versUtilisateur(u), jeton, dureeCookieMs: dureeCookieMs(echeances, maintenant) };
  }
}
