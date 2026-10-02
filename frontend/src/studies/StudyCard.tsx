// Une étude dans la grille de l'accueil (F-02, Q5) : vignette, nom, commune, parcelles, surface,
// dernière modification ; menu Ouvrir, Dupliquer, Mettre à la corbeille.
import type { StudySummary } from '@contracts';
import { formatArea } from '@domain';
import { Copy, ExternalLink, ImageOff, MoreVertical, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatRelative } from '@/lib/dates';

interface Props {
  study: StudySummary;
  onDuplicate: () => void;
  onTrash: () => void;
}

type Described = Pick<StudySummary, 'communeName' | 'communeCode' | 'parcelCount' | 'contenance' | 'area'>;

/** Commune, nombre de parcelles, surface (contenance, à défaut surface calculée). */
export function describeParts(s: Described): string[] {
  return [s.communeName ?? s.communeCode, `${s.parcelCount} parcelle${s.parcelCount > 1 ? 's' : ''}`, formatArea(s.contenance || s.area)];
}

export function describe(s: Described): string {
  return describeParts(s).join(' · ');
}

export function StudyCard({ study, onDuplicate, onTrash }: Props) {
  return (
    <li className="group relative flex flex-col overflow-hidden border bg-card">
      <div className="relative aspect-[8/5] bg-muted">
        {study.thumbnailUrl ? (
          <>
            <img src={study.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            <span className="absolute right-1 bottom-1 bg-card/80 px-1 text-[10px] text-muted-foreground">© OpenStreetMap</span>
          </>
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <ImageOff className="size-4" /> Vignette en préparation
          </div>
        )}
      </div>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="line-clamp-2 font-semibold">
            {/* Toute la carte est cliquable, le lien reste le seul élément focalisable. */}
            <Link to={`/studies/${study.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {study.name}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            {describeParts(study).map((part, i) => (
              <span key={part} className="whitespace-nowrap">
                {i > 0 && ' · '}
                {part}
              </span>
            ))}
          </p>
          <p className="text-xs text-muted-foreground">Modifiée {formatRelative(study.updatedAt)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative z-10" aria-label={`Actions sur ${study.name}`}>
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/studies/${study.id}`}>
                <ExternalLink className="mr-2 size-4" /> Ouvrir
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy className="mr-2 size-4" /> Dupliquer
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onTrash} className="text-destructive">
              <Trash2 className="mr-2 size-4" /> Mettre à la corbeille
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
