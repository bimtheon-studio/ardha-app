// Validation des corps de requête par les schémas zod du contrat (`src/contracts`).
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { messagesByField } from '../../contracts/index.ts';
import type { z } from 'zod';

export class Validate<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const r = this.schema.safeParse(value);
    if (r.success) return r.data;
    throw new BadRequestException({
      message: 'Certains champs sont à corriger.',
      fields: messagesByField(r.error),
    });
  }
}
