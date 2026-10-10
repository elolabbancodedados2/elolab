import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Navbar } from '../Navbar';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: null, signOut: vi.fn(), isAdmin: () => false }),
}));
vi.mock('@/hooks/useRealtimeNotifications', () => ({ useRealtimeNotifications: () => ({ notifications: [], unreadCount: 0 }) }));
vi.mock('@/hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }));
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => <div /> }));
vi.mock('@/components/KeyboardShortcutsDialog', () => ({ KeyboardShortcutsDialog: () => null }));
vi.mock('@/components/ContextualHelp', () => ({ ContextualHelp: () => null }));

describe('menu mobile da aplicação', () => {
  it('publica estado e associação do botão de navegação', () => {
    const { rerender } = render(
      <MemoryRouter>
        <TooltipProvider>
          <Navbar mobileMenuOpen={false} />
        </TooltipProvider>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: 'Abrir menu de navegação' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'menu-principal-mobile');

    rerender(
      <MemoryRouter>
        <TooltipProvider>
          <Navbar mobileMenuOpen />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Fechar menu de navegação' })).toHaveAttribute('aria-expanded', 'true');
  });
});
