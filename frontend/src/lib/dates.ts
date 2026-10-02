// Dates affichées : « il y a 2 h » pour une modification récente, la date au-delà d'un mois.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

export function formatDate(iso: string): string {
  return date.format(new Date(iso));
}

/** « à l'instant », « il y a 5 min », « il y a 2 h », « il y a 3 j », puis « le 1 septembre 2026 ». */
export function formatRelative(iso: string, now = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < MINUTE) return 'à l’instant';
  if (ms < HOUR) return `il y a ${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) return `il y a ${Math.floor(ms / HOUR)} h`;
  if (ms < 30 * DAY) return `il y a ${Math.floor(ms / DAY)} j`;
  return `le ${formatDate(iso)}`;
}
