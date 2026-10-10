import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import LandingPage from '../LandingPage';

vi.mock('@/hooks/useSubscriptionPlan', () => ({
  usePlanos: () => ({ data: [], isLoading: false, isError: false }),
}));

describe('navegação mobile da landing', () => {
  it('expõe o estado do menu e fecha depois de escolher uma seção', () => {
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: 'Abrir menu de navegação' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'navegacao-mobile');

    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Fechar menu de navegação' })).toHaveAttribute('aria-expanded', 'true');
    const mobileNavigation = screen.getByRole('region', { name: 'Navegação móvel' });
    expect(mobileNavigation).toHaveAttribute('id', 'navegacao-mobile');

    fireEvent.click(within(mobileNavigation).getByRole('button', { name: 'RECURSOS' }));
    expect(document.getElementById('navegacao-mobile')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir menu de navegação' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('hero institucional', () => {
  it('usa uma imagem de ambiente clÃ­nico sem expor dados demonstrativos fictÃ­cios', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'Recep\u00e7\u00e3o de uma cl\u00ednica' })).toBeInTheDocument();
    expect(screen.queryByText('R$ 29.9k')).not.toBeInTheDocument();
    expect(screen.queryByText('Maria Silva')).not.toBeInTheDocument();
  });
});
