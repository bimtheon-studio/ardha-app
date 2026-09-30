// Champ de formulaire : libellé, saisie, message d'erreur relié pour les lecteurs d'écran.
import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props extends ComponentProps<typeof Input> {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
}

export function Field({ id, label, error, hint, ...inputProps }: Props) {
  const messageId = `${id}-message`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? messageId : undefined} {...inputProps} />
      {error ? (
        <p id={messageId} className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="text-sm text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
