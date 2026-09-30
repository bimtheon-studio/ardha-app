// Parcours d'authentification du front (F-00), contre une fausse API.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { pageDeRetour } from '@/auth/RouteProtegee';
import { initiales } from '@/composants/Coquille';
import { afficher, alice, fausseApi, sansSession } from '@/test/outils';

describe('route protégée', () => {
  it('sans session, / mène à la connexion (Q8)', async () => {
    fausseApi({ 'GET /api/auth/me': sansSession });
    afficher('/');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });

  it('avec session, affiche l’accueil dans la coquille', async () => {
    fausseApi({ 'GET /api/auth/me': { statut: 200, corps: alice } });
    afficher('/');
    expect(await screen.findByRole('heading', { name: 'Bonjour Alice Martin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu du compte' })).toHaveTextContent('AM');
  });

  it('serveur injoignable : un message et « Réessayer », pas une déconnexion', async () => {
    fausseApi({ 'GET /api/auth/me': { statut: 503, corps: { message: 'Indisponible.' } } });
    afficher('/');
    // Une nouvelle tentative d'abord (un raté passager n'affiche rien), puis l'erreur.
    expect(await screen.findByText('Impossible de vérifier votre session', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connexion' })).not.toBeInTheDocument();
  });
});

describe('connexion', () => {
  it('valide avant d’envoyer, avec les messages du contrat', async () => {
    const appels = fausseApi({ 'GET /api/auth/me': sansSession });
    afficher('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Se connecter' }));
    expect(screen.getByText('L’adresse e-mail est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Le mot de passe est obligatoire.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(appels.map((a) => a.cle)).toEqual(['GET /api/auth/me']);
  });

  it('affiche le refus de l’API', async () => {
    fausseApi({
      'GET /api/auth/me': sansSession,
      'POST /api/auth/login': { statut: 401, corps: { message: 'Adresse e-mail ou mot de passe incorrect.' } },
    });
    afficher('/login');
    await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'alice@exemple.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'mauvais');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Adresse e-mail ou mot de passe incorrect.');
  });

  it('ramène à la page demandée avant la connexion (Q6)', async () => {
    let connecte = false;
    fausseApi({
      'GET /api/auth/me': () => (connecte ? { statut: 200, corps: alice } : sansSession),
      'POST /api/auth/login': () => {
        connecte = true;
        return { statut: 200, corps: alice };
      },
    });
    // État posé par la route protégée quand elle renvoie vers la connexion.
    afficher({ pathname: '/login', state: { depuis: '/page-demandee' } });
    await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'alice@exemple.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'cheval pomme agrafe');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    // `/page-demandee` n'existe pas encore : on y arrive, donc sur la 404, et pas sur l'accueil.
    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument();
  });
});

describe('inscription', () => {
  it('déjà connecté, /inscription et /connexion mènent à l’accueil', async () => {
    fausseApi({ 'GET /api/auth/me': { statut: 200, corps: alice } });
    afficher('/signup');
    expect(await screen.findByRole('heading', { name: 'Bonjour Alice Martin' })).toBeInTheDocument();
  });

  it('montre sous le champ l’adresse déjà utilisée', async () => {
    fausseApi({
      'GET /api/auth/me': sansSession,
      'POST /api/auth/signup': {
        statut: 409,
        corps: { message: 'Cette adresse e-mail est déjà utilisée.', champs: { email: 'Cette adresse e-mail est déjà utilisée.' } },
      },
    });
    afficher('/signup');
    await userEvent.type(await screen.findByLabelText('Nom'), 'Alice');
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'alice@exemple.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'cheval pomme agrafe');
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(await screen.findAllByText('Cette adresse e-mail est déjà utilisée.')).not.toHaveLength(0);
  });

  it('refuse un mot de passe trop court avant l’envoi (Q2)', async () => {
    fausseApi({ 'GET /api/auth/me': sansSession });
    afficher('/signup');
    await userEvent.type(await screen.findByLabelText('Nom'), 'Alice');
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'alice@exemple.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'court');
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(screen.getByText('Le mot de passe doit faire au moins 12 caractères.')).toBeInTheDocument();
  });

  it('une inscription réussie ouvre l’accueil', async () => {
    let inscrit = false;
    fausseApi({
      'GET /api/auth/me': () => (inscrit ? { statut: 200, corps: alice } : sansSession),
      'POST /api/auth/signup': () => {
        inscrit = true;
        return { statut: 201, corps: alice };
      },
    });
    afficher('/signup');
    await userEvent.type(await screen.findByLabelText('Nom'), 'Alice Martin');
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'alice@exemple.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'cheval pomme agrafe');
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(await screen.findByRole('heading', { name: 'Bonjour Alice Martin' })).toBeInTheDocument();
  });
});

describe('déconnexion', () => {
  it('ferme la session et revient à la connexion', async () => {
    let connecte = true;
    fausseApi({
      'GET /api/auth/me': () => (connecte ? { statut: 200, corps: alice } : sansSession),
      'POST /api/auth/logout': () => {
        connecte = false;
        return { statut: 204 };
      },
    });
    afficher('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Menu du compte' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Se déconnecter' }));
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });
});

describe('réinitialisation (Q9)', () => {
  it('envoie le jeton de l’ancre, puis renvoie à la connexion avec un message', async () => {
    const appels = fausseApi({ 'GET /api/auth/me': sansSession, 'POST /api/auth/password-reset': { statut: 204 } });
    afficher('/reset-password#jeton-du-lien');
    await userEvent.type(await screen.findByLabelText('Nouveau mot de passe'), 'nouveau mot de passe solide');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Mot de passe changé. Connectez-vous avec le nouveau.')).toBeInTheDocument();
    expect(appels.find((a) => a.cle === 'POST /api/auth/password-reset')?.corps).toEqual({
      jeton: 'jeton-du-lien',
      motDePasse: 'nouveau mot de passe solide',
    });
  });

  it('affiche le refus d’un lien périmé', async () => {
    fausseApi({
      'GET /api/auth/me': sansSession,
      'POST /api/auth/password-reset': { statut: 400, corps: { message: 'Ce lien n’est plus valable. Demandez-en un nouveau à l’administrateur.' } },
    });
    afficher('/reset-password#vieux');
    await userEvent.type(await screen.findByLabelText('Nouveau mot de passe'), 'nouveau mot de passe solide');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce lien n’est plus valable.');
  });

  it('sans jeton, le dit', async () => {
    fausseApi({ 'GET /api/auth/me': sansSession });
    afficher('/reset-password');
    expect(await screen.findByRole('heading', { name: 'Lien incomplet' })).toBeInTheDocument();
  });
});

describe('divers', () => {
  it('404 en français', async () => {
    fausseApi({ 'GET /api/auth/me': sansSession });
    afficher('/nulle-part');
    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument();
  });

  it('mot de passe oublié : renvoie vers l’administrateur', async () => {
    fausseApi({ 'GET /api/auth/me': sansSession });
    afficher('/forgot-password');
    expect(await screen.findByText(/L’administrateur peut vous transmettre un lien/)).toBeInTheDocument();
  });

  it('pageDeRetour n’accepte que les chemins internes', () => {
    expect(pageDeRetour({ depuis: '/etudes?x=1' })).toBe('/etudes?x=1');
    expect(pageDeRetour({ depuis: '//malveillant.example' })).toBe('/');
    expect(pageDeRetour({ depuis: 'https://malveillant.example' })).toBe('/');
    expect(pageDeRetour(null)).toBe('/');
  });

  it('initiales', () => {
    expect(initiales('Alice Martin')).toBe('AM');
    expect(initiales('Jean-Pierre de la Fontaine')).toBe('JF');
    expect(initiales('Bob')).toBe('BO');
    expect(initiales('  ')).toBe('?');
  });
});

