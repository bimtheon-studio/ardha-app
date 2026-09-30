import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { fakeApi, noSession } from '@/test/helpers';

import { Shell } from './Shell';

describe('Coquille', () => {
  it('sans utilisateur connu (le temps d’une déconnexion), le menu montre une icône', () => {
    fakeApi({ 'GET /api/auth/me': noSession });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Shell />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const menu = screen.getByRole('button', { name: 'Menu du compte' });
    expect(menu).toHaveTextContent('');
    expect(menu.querySelector('svg')).not.toBeNull();
  });
});
