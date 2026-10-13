// Risques (F-04) de bout en bout, dans Chromium : l'analyse se lance à l'ouverture de l'étape, le
// worker interroge les sources (réponses enregistrées de Géorisques, du BRGM, de l'IGN et d'OSM), la
// page montre la synthèse, le détail et les couches ; modifier les parcelles rend l'analyse périmée.
import { expect, test } from '@playwright/test';

import { offlineTiles, signUp } from './helpers.ts';

test('l’étape Risques de Maisons-Alfort AY96 + AY97 : synthèse, PPRI, hauteurs d’eau, couches, péremption', async ({ page }) => {
  const tiles = await offlineTiles(page);
  await signUp(page);
  const r = await page.request.post('/api/studies', { data: { parcelIds: ['94046000AY0096', '94046000AY0097'] } });
  const { id } = (await r.json()) as { id: string };

  await page.goto(`/studies/${id}`);
  await page.getByRole('link', { name: 'Risques' }).click();
  const synthesis = page.getByRole('region', { name: 'Synthèse' });
  await expect(synthesis).toContainText('Aléa moyen', { timeout: 15_000 });
  await expect(synthesis).toContainText('Exposition moyen');
  await expect(synthesis).toContainText('Classe 1 · Faible');
  await expect(synthesis).toContainText('Zone 1 · Très faible');
  await expect(page.getByRole('region', { name: 'Par parcelle' })).toContainText('moyen (centennal) : plus de 2 m');
  await expect(page.getByRole('region', { name: 'Par parcelle' })).toContainText('cote de crue indicative : au moins 34,31 m NGF');
  await expect(page.getByRole('link', { name: 'PPRI Marne et Seine' })).toHaveAttribute('href', /94DDT20090002$/);
  await expect(page.getByRole('region', { name: 'Alentours' })).toContainText('7, la plus proche à 111 m');
  await expect(page.getByText('Indisponible (source muette)')).toHaveCount(0);

  // Une couche à la fois, PPR inondation d'abord, avec sa légende ; carte cadrée sur les alentours à
  // 500 m (zoom 15), où les hauteurs d'eau du TRI sont servies.
  await expect(page.getByRole('radio', { name: 'Zonage des PPR inondation' })).toBeChecked();
  await expect.poll(() => tiles.some((t) => t.includes('PPRN_ZONE_INOND'))).toBe(true);
  const zooms = () => page.locator('.leaflet-tile-pane img').evaluateAll((imgs: HTMLImageElement[]) => [...new Set(imgs.map((i) => i.src).filter((u) => u.includes('openstreetmap')).map((u) => u.split('/')[3]))]);
  await expect.poll(zooms).toEqual(['15']);
  await expect(page.getByRole('img', { name: 'Légende : Zonage des PPR inondation' })).toBeVisible();
  await page.getByRole('radio', { name: 'Hauteurs d’eau, crue moyenne (TRI)' }).check();
  await expect.poll(() => tiles.some((t) => t.includes('ISO_HT_01_02MOY') && t.includes('GetMap'))).toBe(true);
  await expect(page.getByRole('img', { name: 'Légende : Hauteurs d’eau, crue moyenne (TRI)' })).toBeVisible();

  // L'étape est faite ; une parcelle de plus la rend à refaire, et l'analyse périmée.
  await page.getByRole('link', { name: 'Retour à l’étude' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Risques' })).toContainText('faite');
  await page.request.put(`/api/studies/${id}/parcels/94046000AY0095`);
  await page.goto(`/studies/${id}/risks`);
  await expect(page.getByRole('alert')).toContainText('Les parcelles de l’étude ont changé depuis cette analyse');
});
