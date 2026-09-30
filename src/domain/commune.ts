// Codes officiels des communes (INSEE) : 5 caractères, `2A`/`2B` en Corse, `97x` outre-mer.
// Paris, Lyon et Marseille sont découpées en arrondissements (75101…, 69381…, 13201…), qui ont
// chacun leur code et leur cadastre.

export const COMMUNE_CODE = /^(?:\d{5}|2[AB]\d{3})$/;

export function isCommuneCode(code: string): boolean {
  return COMMUNE_CODE.test(code);
}

/** Code du département : 3 chiffres outre-mer (971…976), 2 caractères sinon (`2A`, `94`). */
export function departmentOf(code: string): string {
  return code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2);
}
