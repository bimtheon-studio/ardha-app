// Erreurs métier, indépendantes du transport : l'API les traduit en réponses HTTP (voir
// `error-filter.ts`), la CLI en messages et code de sortie.

export const ERRORS = {
  'invalid-credentials': { status: 401, message: 'Adresse e-mail ou mot de passe incorrect.' },
  'account-deactivated': { status: 403, message: 'Ce compte est désactivé. Contactez l’administrateur.' },
  'email-taken': { status: 409, message: 'Cette adresse e-mail est déjà utilisée.' },
  'password-rejected': { status: 400, message: 'Ce mot de passe ne convient pas.' },
  'invalid-link': { status: 400, message: 'Ce lien n’est plus valable. Demandez-en un nouveau à l’administrateur.' },
  'unknown-user': { status: 404, message: 'Aucun compte avec cette adresse e-mail.' },
  'unknown-commune': { status: 404, message: 'Commune inconnue.' },
  'unknown-parcel': { status: 404, message: 'Parcelle inconnue.' },
  'unknown-study': { status: 404, message: 'Étude introuvable.' },
  'study-in-trash': { status: 409, message: 'Cette étude est dans la corbeille : restaurez-la pour la modifier.' },
  'study-needs-parcel': { status: 400, message: 'Une étude garde au moins une parcelle.' },
  'study-limit-reached': { status: 400, message: 'Une étude compte au plus 50 parcelles.' },
  // Parcelles d'un seul tenant (F-01, Q4 revu le 13/10/2026) ; mêmes textes que le refus au clic.
  'study-not-contiguous': { status: 400, message: 'Les parcelles d’une étude doivent être d’un seul tenant.' },
  'parcel-not-touching': { status: 400, message: 'Cette parcelle ne touche pas la sélection : une sélection est d’un seul tenant.' },
  'parcel-would-split': { status: 400, message: 'Retirer cette parcelle couperait la sélection en deux : retirez d’abord celles d’un côté.' },
  'unknown-address': { status: 400, message: 'Cette adresse n’est pas rattachée aux parcelles de l’étude.' },
  'area-too-large': { status: 400, message: 'Zone trop étendue : rapprochez-vous pour afficher les parcelles.' },
  'lookup-unavailable': {
    status: 503,
    message: 'La recherche est momentanément indisponible. Réessayez dans un instant.',
  },
} as const;

export type ErrorCode = keyof typeof ERRORS;

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = ERRORS[code].message,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
