// Hachage des mots de passe en argon2id, paramètres de l'OWASP (Password Storage Cheat Sheet) :
// 19 Mio de mémoire, 2 passes, 1 fil.
import { type Algorithm, hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

// `Algorithm` est un `const enum` ambiant, inutilisable avec `isolatedModules` : Argon2id vaut 2.
const ARGON2ID = 2 as Algorithm;
const PARAMS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

@Injectable()
export class Passwords {
  /** Hash d'un mot de passe jetable : vérifié quand le compte n'existe pas, pour que la durée de réponse ne le trahisse pas. */
  private decoy: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, PARAMS);
  }

  async verify(knownHash: string | null | undefined, password: string): Promise<boolean> {
    if (!knownHash) {
      this.decoy ??= this.hash('leurre-de-verification-a-duree-constante');
      await verify(await this.decoy, password);
      return false;
    }
    return verify(knownHash, password);
  }
}
