// Identifiant national d'une parcelle (IDU), 14 caractères : commune (5) + préfixe (3, `000` sauf
// commune absorbée) + section (2, complétée par `0` à gauche) + numéro (4).

export const PARCEL_ID = /^(\d{5}|2[AB]\d{3})(\d{3})([0-9A-Z]{2})(\d{4})$/;

export interface ParcelRef {
  commune: string;
  prefix: string;
  section: string;
  number: string;
}

export function parseParcelId(id: string): ParcelRef | null {
  const m = PARCEL_ID.exec(id);
  if (!m) return null;
  const [, commune, prefix, section, number] = m as unknown as [string, string, string, string, string];
  return { commune, prefix, section, number };
}

export function isParcelId(id: string): boolean {
  return PARCEL_ID.test(id);
}

/** Libellé lisible : `AB 12`, ou `012 AB 12` quand le préfixe n'est pas `000`. */
export function parcelLabel(ref: Pick<ParcelRef, 'prefix' | 'section' | 'number'>): string {
  const section = ref.section.replace(/^0(?=.)/, '');
  const number = String(Number(ref.number));
  return ref.prefix === '000' ? `${section} ${number}` : `${ref.prefix} ${section} ${number}`;
}
