// Validation des corps de requête par les schémas zod du contrat (`src/contracts`).
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { messagesParChamp } from '../../contracts/index.ts';
import type { z } from 'zod';

export class Valider<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(valeur: unknown): z.output<S> {
    const r = this.schema.safeParse(valeur);
    if (r.success) return r.data;
    throw new BadRequestException({
      message: 'Certains champs sont à corriger.',
      champs: messagesParChamp(r.error),
    });
  }
}
