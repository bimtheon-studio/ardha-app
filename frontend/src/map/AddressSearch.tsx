// Recherche d'adresse (F-01, #1 à #4) : suggestions de la BAN 300 ms après la frappe, au clavier
// comme à la souris ; « Ma position » par la géolocalisation du navigateur puis le géocodage inverse.
import type { Address } from '@contracts';
import { LocateFixed, Loader2, Search } from 'lucide-react';
import { type KeyboardEvent, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CallError } from '@/api/client';

import { reverseGeocode, useAddressSearch } from './api';
import { useDebounced } from './useDebounced';

const GEOLOCATION_ERRORS: Record<number, string> = {
  1: 'Accès à la position refusé.',
  2: 'Position indisponible.',
  3: 'Délai de géolocalisation dépassé.',
};

interface Props {
  onChoose: (address: Address) => void;
}

export function AddressSearch({ onChoose }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Le libellé d'une adresse choisie n'est pas une nouvelle recherche.
  const [chosen, setChosen] = useState<string | null>(null);
  const q = useDebounced(text, 300);
  const search = useAddressSearch(q === chosen ? '' : q);
  const listId = useId();
  const suggestions = text.trim().length >= 3 && text !== chosen ? (search.data ?? []) : [];
  const shown = open && suggestions.length > 0;

  function choose(a: Address) {
    setText(a.label);
    setChosen(a.label);
    setOpen(false);
    setNotice(null);
    onChoose(a);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const n = suggestions.length;
      if (n > 0) setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const a = suggestions[active] ?? suggestions[0];
      if (a) choose(a);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function locate() {
    if (!('geolocation' in navigator)) return setNotice('La géolocalisation n’est pas disponible dans ce navigateur.');
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        reverseGeocode(pos.coords.longitude, pos.coords.latitude)
          .then((a) => (a ? choose(a) : setNotice('Aucune adresse trouvée à votre position.')))
          .catch((e: unknown) => setNotice(e instanceof CallError ? e.message : 'La recherche de votre adresse a échoué.'))
          .finally(() => setLocating(false));
      },
      (err) => {
        setLocating(false);
        setNotice(GEOLOCATION_ERRORS[err.code] ?? 'Position indisponible.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const error = search.isError && text.trim().length >= 3 && text !== chosen ? (search.error instanceof CallError ? search.error.message : 'La recherche a échoué.') : null;

  return (
    <div className="space-y-2">
      <label htmlFor="address" className="text-sm font-medium">
        Adresse
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="address"
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="12 rue de la Paix, Tours"
          className="pl-9"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
        {search.isFetching && <Loader2 aria-label="Recherche en cours" className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        {shown && (
          <ul id={listId} role="listbox" aria-label="Suggestions d’adresses" className="absolute z-[1000] mt-1 w-full border bg-popover shadow-sm">
            {suggestions.map((a, i) => (
              <li
                key={a.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-secondary' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(a)}
              >
                <p className="font-medium">{a.label}</p>
                {a.context && <p className="text-xs text-muted-foreground">{a.context}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {open && text.trim().length >= 3 && text !== chosen && search.isSuccess && !search.isPlaceholderData && suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune adresse ne correspond.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating}>
        {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} Ma position
      </Button>
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
