import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UpdateSupportBanner } from '../UpdateSupportBanner';

describe('UpdateSupportBanner', () => {
  it('informa sobre a atualização e oferece contatos acessíveis do suporte', () => {
    render(<UpdateSupportBanner />);

    expect(screen.getByRole('status')).toHaveTextContent(/atualizando o elolab/i);
    expect(screen.getByRole('status')).toHaveTextContent(/erro ou instabilidade/i);
    expect(screen.getByRole('link', { name: 'contato@focussdev.art' })).toHaveAttribute(
      'href',
      'mailto:contato@focussdev.art',
    );
    expect(screen.getByRole('link', { name: '(33) 98412-3591' })).toHaveAttribute(
      'href',
      'tel:+5533984123591',
    );
  });
});
