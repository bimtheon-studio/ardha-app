// Carte et parcellaire (F-01) de bout en bout, dans Chromium : recherche d'adresse (par le worker,
// réponses enregistrées), cadastre semé de Maisons-Alfort, sélection au clic sur la carte.
import { expect, test } from '@playwright/test';

import { offlineTiles, screenPoint, signUp } from './helpers.ts';

// Deux parcelles contiguës de Maisons-Alfort (millésime 2026-09-01) et une troisième, à 12 m d'elles.
const AY96 = { lat: 48.7999887, lon: 2.4298255 };
const AY97 = { lat: 48.8000665, lon: 2.4300124 };
const AY98 = { lat: 48.8002762, lon: 2.4297286 };
const VIEW = { lat: 48.8, lon: 2.43, zoom: 19 };

test.beforeEach(async ({ page }) => {
  await offlineTiles(page);
  await signUp(page);
});

test('chercher une adresse : la carte s’y centre, sur le cadastre de la commune', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Choisir des parcelles' }).click();
  await expect(page.getByText('Recherchez une adresse, ou zoomez pour afficher les parcelles.')).toBeVisible();

  await page.getByRole('combobox', { name: 'Adresse' }).fill('9 rue Pasteur Maisons-Alfort');
  await page.getByRole('option', { name: /9 Rue Pasteur 94700 Maisons-Alfort/ }).click();
  await expect(page.getByText('Maisons-Alfort · cadastre du 1er septembre 2026')).toBeVisible();
  await expect(page).toHaveURL(/at=48\.80\d+%2C2\.4\d+%2C18/);
  await expect(page.getByText('Recherchez une adresse, ou zoomez pour afficher les parcelles.')).toBeHidden();
  await expect(page.locator('.leaflet-tooltip', { hasText: '9 Rue Pasteur 94700 Maisons-Alfort' })).toBeVisible();
});

test('sélectionner des parcelles contiguës au clic, refuser une parcelle isolée, garder la sélection', async ({ page }) => {
  await page.goto(`/map?at=${VIEW.lat},${VIEW.lon},${VIEW.zoom}`);
  await expect(page.getByText('Maisons-Alfort · cadastre du 1er septembre 2026')).toBeVisible();
  const list = page.getByRole('list', { name: 'Parcelles' });

  const click = async (p: { lat: number; lon: number }) => {
    const { x, y } = await screenPoint(page, VIEW, p.lat, p.lon);
    await page.mouse.click(x, y);
  };
  await click(AY96);
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await click(AY97);
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('AY 96');
  await expect(list).toContainText('AY 97');
  await expect(page.getByTestId('total-contenance')).toHaveText('510 m²');
  await expect(page).toHaveURL(/parcels=94046000AY0096%2C94046000AY0097/);

  await click(AY98);
  await expect(page.getByRole('alert')).toHaveText('La parcelle doit toucher la sélection.');
  await expect(list.getByRole('listitem')).toHaveCount(2);

  await page.reload();
  await expect(page.getByRole('list', { name: 'Parcelles' }).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Retirer la parcelle AY 96' }).click();
  await expect(page.getByRole('list', { name: 'Parcelles' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByTestId('total-contenance')).toHaveText('270 m²');
});

test('fonds de carte IGN : plan par défaut, photographies au choix', async ({ page }) => {
  const tiles = await offlineTiles(page);
  await page.goto(`/map?at=${VIEW.lat},${VIEW.lon},17`);
  await expect.poll(() => tiles.some((t) => t.includes('PLANIGNV2'))).toBe(true);
  await page.getByRole('radio', { name: 'Photographies aériennes' }).check();
  await expect.poll(() => tiles.some((t) => t.includes('ORTHOIMAGERY.ORTHOPHOTOS'))).toBe(true);
});

test.describe('sur mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('la carte en haut, le panneau dessous ; une parcelle se sélectionne au toucher', async ({ page }) => {
    await page.goto(`/map?at=${VIEW.lat},${VIEW.lon},${VIEW.zoom}`);
    await expect(page.getByText('Maisons-Alfort · cadastre du 1er septembre 2026')).toBeVisible();
    const map = (await page.locator('.leaflet-container').boundingBox())!;
    const panel = (await page.getByRole('heading', { name: 'Choisir des parcelles' }).boundingBox())!;
    expect(panel.y).toBeGreaterThan(map.y + map.height - 1);
    const { x, y } = await screenPoint(page, VIEW, AY96.lat, AY96.lon);
    await page.touchscreen.tap(x, y);
    await expect(page.getByRole('list', { name: 'Parcelles' })).toContainText('AY 96');
  });
});
