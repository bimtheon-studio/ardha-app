import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FrontiereErreur } from './FrontiereErreur';

function Fragile() {
  const [casse, setCasse] = useState(false);
  if (casse) throw new Error('boum');
  return <button onClick={() => setCasse(true)}>Casser</button>;
}

describe('FrontiereErreur', () => {
  it('remplace la page cassée par un message, et « Réessayer » la redonne', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <FrontiereErreur>
        <Fragile />
      </FrontiereErreur>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Casser' }));
    expect(screen.getByRole('heading', { name: 'Une erreur est survenue' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(screen.getByRole('button', { name: 'Casser' })).toBeInTheDocument();
  });
});
