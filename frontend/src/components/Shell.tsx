// Coquille de l'application connectée : en-tête et menu du compte (F-00, #21).
import { LogOut, User } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router';

import { useLogout, useMe } from '@/auth/session';
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
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]![0], words.at(-1)![0]] : [words[0]?.[0], words[0]?.[1]];
  return letters.filter(Boolean).join('').toUpperCase() || '?';
}

export function Shell() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  async function logOut() {
    await logout.mutateAsync().catch(() => undefined);
    await navigate('/login', { replace: true });
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
              {me ? initials(me.name) : <User />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {me && (
              <DropdownMenuLabel className="font-normal">
                <p className="font-medium">{me.name}</p>
                <p className="text-xs text-muted-foreground">{me.email}</p>
              </DropdownMenuLabel>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logOut()}>
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
