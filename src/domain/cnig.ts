// Nomenclature CNIG des destinations et sous-destinations (code de l'urbanisme, art. R151-27 et
// R151-28 ; arrêté du 10 novembre 2016 modifié, en dernier lieu le 22 mars 2023, qui ajoute « lieux de
// culte » et « cuisine dédiée à la vente en ligne »). Ce sont les codes des champs `DESTOUI`,
// `DESTCDT`, `DESTNON` de la couche des zones du standard CNIG PLU, séparés par des tirets
// (« 10-22-30 »). Repris de l'ancien `supabase/functions/_shared/cnig-destinations.ts` @2a7f9a0.
//
// Donnée réglementaire : un code absent de la table s'affiche tel quel, jamais avec un libellé
// deviné (un libellé faux est pire que pas de libellé).

export const CNIG_DESTINATIONS: Readonly<Record<string, string>> = {
  '10': 'Exploitation agricole et forestière',
  '11': 'Exploitation agricole',
  '12': 'Exploitation forestière',

  '20': 'Habitation',
  '21': 'Logement',
  '22': 'Hébergement',

  '30': 'Commerce et activités de service',
  '31': 'Artisanat et commerce de détail',
  '32': 'Restauration',
  '33': 'Commerce de gros',
  '34': 'Activités de services où s’effectue l’accueil d’une clientèle',
  '35': 'Hôtels',
  '36': 'Autres hébergements touristiques',
  '37': 'Cinéma',

  '40': 'Équipements d’intérêt collectif et services publics',
  '41': 'Locaux et bureaux accueillant du public des administrations publiques et assimilés',
  '42': 'Locaux techniques et industriels des administrations publiques et assimilés',
  '43': 'Établissements d’enseignement, de santé et d’action sociale',
  '44': 'Salles d’art et de spectacles',
  '45': 'Équipements sportifs',
  '46': 'Autres équipements recevant du public',
  '47': 'Lieux de culte',

  '50': 'Autres activités des secteurs secondaire ou tertiaire',
  '51': 'Industrie',
  '52': 'Entrepôt',
  '53': 'Bureau',
  '54': 'Centre de congrès et d’exposition',
  '55': 'Cuisine dédiée à la vente en ligne',
};

/** Les 23 sous-destinations, dans l'ordre de la nomenclature. */
export const CNIG_SUB_DESTINATIONS: readonly string[] = Object.keys(CNIG_DESTINATIONS).filter((c) => !c.endsWith('0'));

export interface CnigDestination {
  code: string;
  /** Libellé officiel, ou `null` si le code n'est pas dans la nomenclature. */
  label: string | null;
}

/** Libellé officiel d'un code, ou `null` s'il est inconnu. */
export function cnigLabel(code: string): string | null {
  return CNIG_DESTINATIONS[code.trim()] ?? null;
}

/** Destination d'une sous-destination (« 53 » → « 50 »), ou `null`. */
export function cnigParent(code: string): string | null {
  return CNIG_SUB_DESTINATIONS.includes(code) ? `${code[0]}0` : null;
}

/** Décode « 10-22-30 » : codes dans l'ordre, sans doublon ; rien pour une valeur vide. */
export function decodeCnigDestinations(value: string | null | undefined): CnigDestination[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: CnigDestination[] = [];
  for (const raw of value.split(/[-,\s]+/)) {
    const code = raw.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, label: cnigLabel(code) });
  }
  return out;
}

/** « 44 — Salles d’art et de spectacles », ou « 60 — libellé inconnu ». */
export function formatCnigDestination(d: CnigDestination): string {
  return `${d.code} — ${d.label ?? 'libellé inconnu'}`;
}
