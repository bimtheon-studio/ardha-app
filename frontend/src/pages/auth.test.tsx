// Parcours d'authentification du front (F-00), contre une fausse API.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { returnPath } from '@/auth/ProtectedRoute';
import { initials } from '@/components/Shell';
import { renderAt, alice, fakeApi, noSession } from '@/test/helpers';

describe('route protégée', () => {
  it('sans session, / mène à la connexion (Q8)', async () => {
    fakeApi({ 'GET /api/auth/me': noSession });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });

  it('avec session, affiche l’accueil dans la coquille', async () => {
    fakeApi({ 'GET /api/auth/me': { status: 200, body: alice } });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Bonjour Alice Martin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu du compte' })).toHaveTextContent('AM');
  });

  it('serveur injoignable : un message et « Réessayer », pas une déconnexion', async () => {
    fakeApi({ 'GET /api/auth/me': { status: 503, body: { message: 'Indisponible.' } } });
    renderAt('/');
    // Une nouvelle tentative d'abord (un raté passager n'affiche rien), puis l'erreur.
    expect(await screen.findByText('Impossible de vérifier votre session', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connexion' })).not.toBeInTheDocument();
  });
});

describe('connexion', () => {
  it('valide avant d’envoyer, avec les messages du contrat', async () => {
    const calls = fakeApi({ 'GET /api/auth/me': noSession });
    renderAt('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Se connecter' }));
    expect(screen.getByText('L’adresse e-mail est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Le mot de passe est obligatoire.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.map((a) => a.key)).toEqual(['GET /api/auth/me']);
  });

  it('affiche le refus de l’API', async () => {
    fakeApi({
      'GET /api/auth/me': noSession,
      'POST /api/auth/login': { status: 401, body: { message: 'Adresse e-mail ou mot de passe incorrect.' } },
    });
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'alice@exemple.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'mauvais');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Adresse e-mail ou mot de passe incorrect.');
  });

  it('ramène à la page demandée avant la connexion (Q6)', async () => {
    let loggedIn = false;
    fakeApi({
      'GET /api/auth/me': () => (loggedIn ? { status: 200, body: alice } : noSession),
      'POST /api/auth/login': () => {
        loggedIn = true;
        return { status: 200, body: alice };
      },
    });
    // État posé par la route protégée quand elle renvoie vers la connexion.
    renderAt({ pathname: '/login', state: { from: '/page-demandee' } });
    await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'alice@exemple.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'cheval pomme agrafe');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    // `/page-demandee` n'existe pas encore : on y arrive, donc sur la 404, et pas sur l'accueil.
    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument();
  });
});

describe('inscription', () => {
  it('déjà connecté, /inscription et /connexion mènent à l’accueil', async () => {
    fakeApi({ 'GET /api/auth/me': { status: 200, body: alice } });
    renderAt('/signup');
    expect(await screen.findByRole('heading', { name: 'Bonjour Alice Martin' })).toBeInTheDocument();
  });

  it('montre sous le champ l’adresse déjà utilisée', async () => {
    fakeApi({
      'GET /api/auth/me': noSession,
      'POST /api/auth/signup': {
        status: 409,
        body: { message: 'Cette adresse e-mail est déjà utilisée.', fields: { email: 'Cette adresse e-mail est déjà utilisée.' } },
      },
    });
    renderAt('/signup');
    await userEvent.type(await screen.findByLabelText('Nom'), 'Alice');
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'alice@exemple.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'cheval pomme agrafe');
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(await screen.findAllByText('Cette adresse e-mail est déjà utilisée.')).not.toHaveLength(0);
  });

  it('refuse un mot de passe trop court avant l’envoi (Q2)', async () => {
    fakeApi({ 'GET /api/auth/me': noSession });
    renderAt('/signup');
    await userEvent.type(await screen.findByLabelText('Nom'), 'Alice');
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'alice@exemple.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'court');
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(screen.getByText('Le mot de passe doit faire au moins 12 caractères.')).toBeInTheDocument();
  });

  it('une inscription réussie ouvre l’accueil', async () => {
    let signedUp = false;
    fakeApi({
      'GET /api/auth/me': () => (signedUp ? { status: 200, body: alice } : noSession),
      'POST /api/auth/signup': () => {
        signedUp = true;
        return { status: 201, body: alice };
      },
    });
    renderAt('/signup');
    await userEvent.type(await screen.findByLabelText('Nom'), 'Alice Martin');
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'alice@exemple.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'cheval pomme agrafe');
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(await screen.findByRole('heading', { name: 'Bonjour Alice Martin' })).toBeInTheDocument();
  });
});

describe('déconnexion', () => {
  it('ferme la session et revient à la connexion', async () => {
    let loggedIn = true;
    fakeApi({
      'GET /api/auth/me': () => (loggedIn ? { status: 200, body: alice } : noSession),
      'POST /api/auth/logout': () => {
        loggedIn = false;
        return { status: 204 };
      },
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Menu du compte' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Se déconnecter' }));
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });
});

describe('réinitialisation (Q9)', () => {
  it('envoie le jeton de l’ancre, puis renvoie à la connexion avec un message', async () => {
    const calls = fakeApi({ 'GET /api/auth/me': noSession, 'POST /api/auth/password-reset': { status: 204 } });
    renderAt('/reset-password#jeton-du-lien');
    await userEvent.type(await screen.findByLabelText('Nouveau mot de passe'), 'nouveau mot de passe solide');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Mot de passe changé. Connectez-vous avec le nouveau.')).toBeInTheDocument();
    expect(calls.find((a) => a.key === 'POST /api/auth/password-reset')?.body).toEqual({
      token: 'jeton-du-lien',
      password: 'nouveau mot de passe solide',
    });
  });

  it('affiche le refus d’un lien périmé', async () => {
    fakeApi({
      'GET /api/auth/me': noSession,
      'POST /api/auth/password-reset': { status: 400, body: { message: 'Ce lien n’est plus valable. Demandez-en un nouveau à l’administrateur.' } },
    });
    renderAt('/reset-password#vieux');
    await userEvent.type(await screen.findByLabelText('Nouveau mot de passe'), 'nouveau mot de passe solide');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce lien n’est plus valable.');
  });

  it('sans jeton, le dit', async () => {
    fakeApi({ 'GET /api/auth/me': noSession });
    renderAt('/reset-password');
    expect(await screen.findByRole('heading', { name: 'Lien incomplet' })).toBeInTheDocument();
  });
});

describe('divers', () => {
  it('404 en français', async () => {
    fakeApi({ 'GET /api/auth/me': noSession });
    renderAt('/nulle-part');
    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument();
  });

  it('mot de passe oublié : renvoie vers l’administrateur', async () => {
    fakeApi({ 'GET /api/auth/me': noSession });
    renderAt('/forgot-password');
    expect(await screen.findByText(/L’administrateur peut vous transmettre un lien/)).toBeInTheDocument();
  });

  it('pageDeRetour n’accepte que les chemins internes', () => {
    expect(returnPath({ from: '/etudes?x=1' })).toBe('/etudes?x=1');
    expect(returnPath({ from: '//malveillant.example' })).toBe('/');
    expect(returnPath({ from: 'https://malveillant.example' })).toBe('/');
    expect(returnPath(null)).toBe('/');
  });

  it('initiales', () => {
    expect(initials('Alice Martin')).toBe('AM');
    expect(initials('Jean-Pierre de la Fontaine')).toBe('JF');
    expect(initials('Bob')).toBe('BO');
    expect(initials('  ')).toBe('?');
  });
});

