// Jetons opaques (session, lien de réinitialisation) : 32 octets aléatoires. Seule leur empreinte
// SHA-256 va en base.
import { createHash, randomBytes } from 'node:crypto';

export function empreinteJeton(jeton: string): string {
  return createHash('sha256').update(jeton).digest('hex');
}

export function nouveauJeton(): { jeton: string; empreinte: string } {
  const jeton = randomBytes(32).toString('base64url');
  return { jeton, empreinte: empreinteJeton(jeton) };
}
