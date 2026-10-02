// Courbes des prix médians au m² par période (F-05, historique) : une ligne par type de bien et
// segment, en SVG, sans bibliothèque. Le tableau des valeurs suit le graphique pour les lecteurs
// d'écran (et pour qui veut les chiffres).
import type { MarketResult } from '@contracts';

type Point = Extract<MarketResult['dvf'], { status: 'ok' }>['data']['history']['year'][number];

export interface Series {
  key: string;
  label: string;
  color: string;
  match: (p: Point) => boolean;
}

const W = 600;
const H = 220;
const PAD = { left: 52, right: 12, top: 12, bottom: 28 };

/** Graduations « rondes » couvrant [min, max] : du multiple du pas juste en dessous au multiple juste au-dessus. */
export function ticks(min: number, max: number, count = 4): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const out: number[] = [];
  const top = Math.ceil(max / step) * step;
  for (let v = Math.floor(min / step) * step; v <= top + step / 2; v += step) out.push(v);
  return out;
}

const euros = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`;

export function PriceChart({ points, series, title }: { points: Point[]; series: Series[]; title: string }) {
  const shown = series.filter((s) => points.some(s.match));
  const periods = [...new Set(points.filter((p) => shown.some((s) => s.match(p))).map((p) => p.period))].sort();
  if (shown.length === 0 || periods.length === 0) return <p className="text-sm text-muted-foreground">Pas assez de ventes pour un historique.</p>;
  const values = points.filter((p) => shown.some((s) => s.match(p))).map((p) => p.median);
  const yTicks = ticks(Math.min(...values) * 0.95, Math.max(...values) * 1.05);
  const [y0, y1] = [yTicks[0]!, yTicks.at(-1)!];
  const x = (period: string) => PAD.left + (periods.length === 1 ? (W - PAD.left - PAD.right) / 2 : (periods.indexOf(period) / (periods.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PAD.top - PAD.bottom);
  const every = Math.ceil(periods.length / 8);
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {Math.round(t).toLocaleString('fr-FR')}
            </text>
          </g>
        ))}
        {periods.map((p, i) =>
          i % every === 0 || i === periods.length - 1 ? (
            <text key={p} x={x(p)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {p}
            </text>
          ) : null,
        )}
        {shown.map((s) => {
          const pts = points.filter(s.match).sort((a, b) => a.period.localeCompare(b.period));
          return (
            <g key={s.key}>
              <polyline points={pts.map((p) => `${x(p.period)},${y(p.median)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2.5} />
              {pts.map((p) => (
                <circle key={p.period} cx={x(p.period)} cy={y(p.median)} r={3.5} fill={s.color}>
                  <title>{`${s.label}, ${p.period} : ${euros(p.median)}/m² (${p.count} ventes)`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {shown.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ backgroundColor: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </figcaption>
      {/* Une table ignore la largeur de 1 px de `sr-only` : c'est son conteneur qui la cache. */}
      <div className="sr-only">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Période</th>
            {shown.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p}>
              <td>{p}</td>
              {shown.map((s) => {
                const point = points.find((x) => s.match(x) && x.period === p);
                return <td key={s.key}>{point ? `${euros(point.median)}/m² (${point.count})` : '—'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
