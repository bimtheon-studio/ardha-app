// Outils des tests e2e : compte ouvert par l'API, tuiles IGN servies hors ligne, position d'un point
// de la carte à l'écran (projection Web Mercator de Leaflet).
import { expect, type Page } from '@playwright/test';

/** PNG transparent de 1 × 1 : les tuiles (IGN, OpenStreetMap, couches de risques) ne sortent pas vers Internet pendant les tests. */
const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export async function offlineTiles(page: Page): Promise<string[]> {
  const tiles: string[] = [];
  await page.route(/^https:\/\/(data\.geopf\.fr\/wmts|tile\.openstreetmap\.org\/|mapsref\.brgm\.fr\/wxs\/|www\.georisques\.gouv\.fr\/services)/, (route) => {
    tiles.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG });
  });
  return tiles;
}

export const PASSWORD = 'cheval pomme agrafe';

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@exemple.fr`;
}

/**
 * Chaque test se présente avec sa propre IP (derrière le relais du front, `TRUST_PROXY=2`) : le
 * limiteur de l'inscription (5 par IP en 15 min, F-00 Q7) ne mêle pas les tests entre eux.
 */
export async function ownIp(page: Page): Promise<void> {
  const b = () => Math.floor(Math.random() * 250) + 1;
  await page.context().setExtraHTTPHeaders({ 'X-Forwarded-For': `10.${b()}.${b()}.${b()}` });
}

/** Inscription par l'API : la session (cookie) vaut pour la page. */
export async function signUp(page: Page, name = 'Géomètre E2E'): Promise<string> {
  await ownIp(page);
  const email = uniqueEmail('e2e');
  const r = await page.request.post('/api/auth/signup', { data: { email, name, password: PASSWORD } });
  expect(r.status()).toBe(201);
  return email;
}

function world(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const phi = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * scale, y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * scale };
}

/** Point de l'écran où Leaflet dessine `[lat, lon]`, la carte étant centrée sur `center` au zoom donné. */
export async function screenPoint(page: Page, center: { lat: number; lon: number; zoom: number }, lat: number, lon: number) {
  const box = (await page.locator('.leaflet-container').boundingBox())!;
  const c = world(center.lat, center.lon, center.zoom);
  const p = world(lat, lon, center.zoom);
  return { x: box.x + box.width / 2 + (p.x - c.x), y: box.y + box.height / 2 + (p.y - c.y) };
}
