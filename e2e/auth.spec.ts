// Compte (F-00) de bout en bout : inscription, déconnexion, connexion refusée puis acceptée.
import { expect, test } from '@playwright/test';

import { ownIp, PASSWORD, uniqueEmail } from './helpers.ts';

test.beforeEach(({ page }) => ownIp(page));

test('s’inscrire, se déconnecter, se reconnecter', async ({ page }) => {
  const email = uniqueEmail('compte');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await page.getByRole('link', { name: /Créer un compte|S’inscrire/ }).click();
  await page.getByLabel('Nom').fill('Camille Durand');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /Créer/ }).click();
  await expect(page.getByText('Bonjour Camille Durand')).toBeVisible();

  await page.getByRole('button', { name: 'Menu du compte' }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();

  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill('pas le bon mot de passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toHaveText('Adresse e-mail ou mot de passe incorrect.');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Bonjour Camille Durand')).toBeVisible();
});

test('une page protégée demandée sans session y ramène après la connexion', async ({ page }) => {
  const email = uniqueEmail('retour');
  await page.request.post('/api/auth/signup', { data: { email, name: 'Retour', password: PASSWORD } });
  await page.request.post('/api/auth/logout');
  await page.goto('/map?at=48.8,2.43,17');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Choisir des parcelles' })).toBeVisible();
  await expect(page).toHaveURL(/\/map\?at=48\.8/);
});
