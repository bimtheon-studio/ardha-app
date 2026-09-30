import { Loader2 } from 'lucide-react';

export function Chargement() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Chargement">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  );
}
