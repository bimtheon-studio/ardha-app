// Jetons opaques (session, lien de réinitialisation) : 32 octets aléatoires. Seule leur empreinte
// SHA-256 va en base.
import { createHash, randomBytes } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}
