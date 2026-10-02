// Foncier et marché (F-05) de bout en bout, dans Chromium : l'analyse se lance à l'ouverture de
// l'étape, le worker charge les ventes DVF du Val-de-Marne, l'ECLN, Sitadel et les indices (réponses
// enregistrées), la page montre les prix, la carte et la liste des ventes ; changer le rayon refait
// l'analyse.
import { expect, test } from '@playwright/test';

import { offlineTiles, signUp } from './helpers.ts';

const plain = (s: string | null) => (s ?? '').replace(/\u202f/g, ' ');

test('l’étape Foncier et marché de Maisons-Alfort AY96 + AY97 : prix, neuf, Sitadel, ventes, rayon', async ({ page }) => {
  test.setTimeout(60_000);
  await offlineTiles(page);
  await signUp(page);
  const r = await page.request.post('/api/studies', { data: { parcelIds: ['94046000AY0096', '94046000AY0097'] } });
  const { id } = (await r.json()) as { id: string };

  await page.goto(`/studies/${id}`);
  await page.getByRole('link', { name: 'Foncier et marché' }).click();
  const prices = page.getByRole('region', { name: 'Prix au m²' });
  await expect(prices).toContainText('276 ventes comparables sur 331', { timeout: 30_000 });
  expect(plain(await prices.textContent())).toContain('Ancien5 465 €/m²');
  expect(plain(await page.getByRole('region', { name: 'Neuf' }).textContent())).toContain('2026-T2Collectif5 739 €/m²957');
  await expect(page.getByRole('region', { name: 'Logements autorisés (Sitadel)' })).toContainText('Maisons-Alfort');
  await expect(page.getByRole('region', { name: 'Indices INSEE' })).toContainText('Prix des appartements anciens, Val-de-Marne');
  await expect(page.getByText('Indisponible (source muette)')).toHaveCount(0);

  // Les ventes, sur la carte (points et parcelles vendues) et en liste.
  const sales = page.getByRole('list', { name: 'Ventes' });
  await expect(sales.getByRole('button')).toHaveCount(50);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByText('331 ventes dans 500 m')).toBeVisible();
  await sales.getByRole('button').first().click();
  await expect(sales.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');

  // Un rayon plus large : l'analyse se refait, l'étude le garde.
  await page.getByRole('group', { name: 'Rayon des ventes comparables' }).getByRole('button', { name: '1 km' }).click();
  await expect(prices).toContainText('783 ventes comparables sur 1010', { timeout: 30_000 });
  await expect(page.getByText('1010 ventes dans 1 km')).toBeVisible();

  await page.getByRole('link', { name: 'Retour à l’étude' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Foncier et marché' })).toContainText('faite');
});
