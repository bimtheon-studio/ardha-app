// Coquille de l'application connectée : en-tête et menu du compte (F-00, #21).
import { LogOut, User } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router';

import { useDeconnexion, useMoi } from '@/auth/session';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Initiales tirées du nom (l'ancienne application les tirait de l'e-mail, faute de nom). */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  const lettres = mots.length > 1 ? [mots[0]![0], mots.at(-1)![0]] : [mots[0]?.[0], mots[0]?.[1]];
  return lettres.filter(Boolean).join('').toUpperCase() || '?';
}

export function Coquille() {
  const { data: moi } = useMoi();
  const deconnexion = useDeconnexion();
  const naviguer = useNavigate();

  async function seDeconnecter() {
    await deconnexion.mutateAsync().catch(() => undefined);
    await naviguer('/connexion', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b bg-card px-4">
        <Link to="/" className="text-lg font-extrabold tracking-tight text-primary">
          Ardha
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Menu du compte">
              {moi ? initiales(moi.nom) : <User />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {moi && (
              <DropdownMenuLabel className="font-normal">
                <p className="font-medium">{moi.nom}</p>
                <p className="text-xs text-muted-foreground">{moi.email}</p>
              </DropdownMenuLabel>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void seDeconnecter()}>
              <LogOut className="mr-2 size-4" />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
