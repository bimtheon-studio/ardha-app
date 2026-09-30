// Hachage des mots de passe en argon2id, paramètres de l'OWASP (Password Storage Cheat Sheet) :
// 19 Mio de mémoire, 2 passes, 1 fil.
import { type Algorithm, hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

// `Algorithm` est un `const enum` ambiant, inutilisable avec `isolatedModules` : Argon2id vaut 2.
const ARGON2ID = 2 as Algorithm;
const PARAMETRES = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

@Injectable()
export class MotsDePasse {
  /** Hash d'un mot de passe jetable : vérifié quand le compte n'existe pas, pour que la durée de réponse ne le trahisse pas. */
  private leurre: Promise<string> | undefined;

  hacher(motDePasse: string): Promise<string> {
    return hash(motDePasse, PARAMETRES);
  }

  async verifier(hashConnu: string | null | undefined, motDePasse: string): Promise<boolean> {
    if (!hashConnu) {
      this.leurre ??= this.hacher('leurre-de-verification-a-duree-constante');
      await verify(await this.leurre, motDePasse);
      return false;
    }
    return verify(hashConnu, motDePasse);
  }
}
