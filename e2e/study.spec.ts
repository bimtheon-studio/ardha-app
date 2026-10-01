// Étude (F-02) de bout en bout, dans Chromium : créer depuis la carte, adresse et vignette calculées
// par le worker (réponses enregistrées de la BAN et des tuiles OSM), renommer, modifier les
// parcelles sur la carte de l'étude, retrouver, corbeille, copie, lecture sur mobile.
import { expect, type Page, test } from '@playwright/test';

import { offlineTiles, screenPoint, signUp } from './helpers.ts';

const AY96 = { lat: 48.7999887, lon: 2.4298255 };
const AY97 = { lat: 48.8000665, lon: 2.4300124 };
const AY98 = { lat: 48.8002762, lon: 2.4297286 };
const VIEW = { lat: 48.8, lon: 2.43, zoom: 19 };

test.beforeEach(async ({ page }) => {
  await offlineTiles(page);
  await signUp(page);
});

/** Vue courante de la carte, lue dans l'URL (`at=lat,lon,zoom`). */
function viewOf(page: Page) {
  const [lat = 0, lon = 0, zoom = 0] = new URL(page.url()).searchParams.get('at')!.split(',').map(Number);
  return { lat, lon, zoom };
}

async function createStudy(page: Page, parcelIds: string[]): Promise<string> {
  const r = await page.request.post('/api/studies', { data: { parcelIds } });
  expect(r.status()).toBe(201);
  return ((await r.json()) as { id: string }).id;
}

test('créer une étude depuis la carte, la renommer, en modifier les parcelles, la retrouver', async ({ page }) => {
  await page.goto(`/map?at=${VIEW.lat},${VIEW.lon},${VIEW.zoom}`);
  await expect(page.getByText('Maisons-Alfort · cadastre du 1er septembre 2026')).toBeVisible();
  for (const p of [AY96, AY97]) {
    const { x, y } = await screenPoint(page, VIEW, p.lat, p.lon);
    await page.mouse.click(x, y);
  }
  await expect(page.getByRole('list', { name: 'Parcelles' }).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Créer l’étude' }).click();

  // Nom provisoire, puis proposé d'après l'adresse trouvée par le worker (Q2, Q3).
  await expect(page).toHaveURL(/\/studies\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: '6 Rue Pasteur, Maisons-Alfort (+1 parcelle)' })).toBeVisible();
  await expect(page.getByText('6 Rue Pasteur 94700 Maisons-Alfort')).toBeVisible();
  await expect(page.getByTestId('study-contenance')).toHaveText('510 m²');
  await expect(page.locator('.leaflet-container')).toBeVisible();

  await page.getByRole('button', { name: 'Renommer l’étude' }).click();
  await page.getByLabel('Nom de l’étude').fill('Angle Pasteur');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Angle Pasteur' })).toBeVisible();

  // Carte de l'étude : cadrée sur ses parcelles, chaque clic enregistré (Q8).
  await page.getByRole('link', { name: 'Modifier les parcelles' }).click();
  await expect(page).toHaveURL(/\/map\?at=/);
  await expect(page.getByRole('list', { name: 'Parcelles' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Maisons-Alfort · cadastre du 1er septembre 2026')).toBeVisible();
  const view = viewOf(page);
  const { x, y } = await screenPoint(page, view, AY98.lat, AY98.lon);
  await page.mouse.click(x, y);
  await expect(page.getByRole('list', { name: 'Parcelles' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('Chaque clic est enregistré.')).toBeVisible();
  await page.getByRole('link', { name: 'Terminer' }).click();

  // L'adresse suit les parcelles ; le nom, renommé, ne bouge plus.
  await expect(page.getByText('6 Avenue de la République 94700 Maisons-Alfort')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Angle Pasteur' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Parcelles de l’étude' }).getByRole('listitem')).toHaveCount(3);

  // L'accueil la montre, vignette comprise ; la recherche la trouve par son adresse.
  await page.getByRole('link', { name: 'Mes études' }).click();
  const card = page.getByRole('list', { name: 'Études' }).getByRole('listitem');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Maisons-Alfort · 3 parcelles');
  await expect.poll(() => card.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 10_000 }).toBe(480);
  await page.getByRole('searchbox', { name: 'Rechercher une étude' }).fill('republique');
  await expect(card).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Rechercher une étude' }).fill('lyon');
  await expect(page.getByText('Aucune étude ne correspond à « lyon ».')).toBeVisible();
});

test('dupliquer, mettre à la corbeille, annuler, restaurer depuis la corbeille', async ({ page }) => {
  const id = await createStudy(page, ['94046000AY0146']);
  await page.goto(`/studies/${id}`);
  await expect(page.getByRole('heading', { name: '2 Rue Etienne Dolet, Maisons-Alfort' })).toBeVisible();

  await page.getByRole('button', { name: 'Dupliquer' }).click();
  await expect(page.getByRole('heading', { name: '2 Rue Etienne Dolet, Maisons-Alfort (copie)' })).toBeVisible();
  await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
  await expect(page.getByText('« 2 Rue Etienne Dolet, Maisons-Alfort (copie) » est dans la corbeille pendant 30 jours.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Études' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('list', { name: 'Études' }).getByRole('listitem')).toHaveCount(2);

  await page.getByRole('button', { name: 'Actions sur 2 Rue Etienne Dolet, Maisons-Alfort (copie)' }).click();
  await page.getByRole('menuitem', { name: 'Mettre à la corbeille' }).click();
  await page.getByRole('link', { name: 'Corbeille' }).click();
  const row = page.getByRole('list', { name: 'Études dans la corbeille' }).getByRole('listitem');
  await expect(row).toContainText(/effacée le \d+ \S+ \d{4}/);
  await row.getByRole('button', { name: 'Restaurer' }).click();
  await expect(page.getByText('La corbeille est vide.')).toBeVisible();
});

test('mobile (375 px) : l’accueil et la page de l’étude se lisent sans défilement horizontal', async ({ page }) => {
  const id = await createStudy(page, ['94046000AY0096', '94046000AY0097']);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of [`/studies/${id}`, '/']) {
    await page.goto(path);
    await expect(page.getByText(/6 Rue Pasteur, Maisons-Alfort/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  }
  await expect(page.getByRole('link', { name: /6 Rue Pasteur/ })).toBeVisible();
});
