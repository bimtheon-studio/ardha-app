// Erreurs métier, indépendantes du transport : l'API les traduit en réponses HTTP (voir
// `filtre-erreurs.ts`), la CLI en messages et code de sortie.

export const ERREURS = {
  'identifiants-invalides': { statut: 401, message: 'Adresse e-mail ou mot de passe incorrect.' },
  'compte-desactive': { statut: 403, message: 'Ce compte est désactivé. Contactez l’administrateur.' },
  'email-deja-utilise': { statut: 409, message: 'Cette adresse e-mail est déjà utilisée.' },
  'mot-de-passe-refuse': { statut: 400, message: 'Ce mot de passe ne convient pas.' },
  'lien-invalide': { statut: 400, message: 'Ce lien n’est plus valable. Demandez-en un nouveau à l’administrateur.' },
  'utilisateur-inconnu': { statut: 404, message: 'Aucun compte avec cette adresse e-mail.' },
} as const;

export type CodeErreur = keyof typeof ERREURS;

export class ErreurMetier extends Error {
  constructor(
    readonly code: CodeErreur,
    message: string = ERREURS[code].message,
    readonly champs?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ErreurMetier';
  }
}
