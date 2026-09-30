// Champ de formulaire : libellé, saisie, message d'erreur relié pour les lecteurs d'écran.
import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props extends ComponentProps<typeof Input> {
  id: string;
  libelle: string;
  erreur?: string | undefined;
  aide?: string;
}

export function Champ({ id, libelle, erreur, aide, ...saisie }: Props) {
  const idMessage = `${id}-message`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{libelle}</Label>
      <Input id={id} name={id} aria-invalid={erreur ? true : undefined} aria-describedby={erreur || aide ? idMessage : undefined} {...saisie} />
      {erreur ? (
        <p id={idMessage} className="text-sm text-destructive">
          {erreur}
        </p>
      ) : (
        aide && (
          <p id={idMessage} className="text-sm text-muted-foreground">
            {aide}
          </p>
        )
      )}
    </div>
  );
}
