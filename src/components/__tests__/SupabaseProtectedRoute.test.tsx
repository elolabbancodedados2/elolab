import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SupabaseProtectedRoute } from '@/components/SupabaseProtectedRoute';

// Mock useSupabaseAuth
const mockUseSupabaseAuth = vi.fn();
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => mockUseSupabaseAuth(),
  // Re-export types
}));

/**
 * O guard precisa de rotas reais. Montado num MemoryRouter sem <Routes>, o
 * <Navigate to="/auth" state={{ from: location }} replace /> nunca desmontava:
 * cada navegação criava um novo `location`, que disparava novo render, que
 * navegava de novo — loop infinito que estourava a memória do processo do
 * Vitest e derrubava a suíte inteira (`npm run test:run` saía com código 1).
 */
const renderWithRouter = (ui: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={['/protegido']}>
      <Routes>
        <Route path="/protegido" element={ui} />
        <Route path="/auth" element={<div>Tela de login</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('SupabaseProtectedRoute', () => {
  it('mostra loading quando isLoading', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: null,
      profile: null,
      isLoading: true,
      hasAnyRole: () => false,
    });
    renderWithRouter(
      <SupabaseProtectedRoute>
        <div>Protected</div>
      </SupabaseProtectedRoute>
    );
    // Should show spinner, not content
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('redireciona para /auth sem usuário', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: null,
      profile: null,
      isLoading: false,
      hasAnyRole: () => false,
    });
    renderWithRouter(
      <SupabaseProtectedRoute>
        <div>Protected</div>
      </SupabaseProtectedRoute>
    );
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
    expect(screen.getByText('Tela de login')).toBeInTheDocument();
  });

  it('mostra tela pendente sem roles', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: { id: '1', email: 'test@test.com' },
      profile: { roles: [] },
      isLoading: false,
      hasAnyRole: () => false,
    });
    renderWithRouter(
      <SupabaseProtectedRoute>
        <div>Protected</div>
      </SupabaseProtectedRoute>
    );
    expect(screen.getByText('Acesso Pendente')).toBeInTheDocument();
  });

  it('mostra acesso negado com role errada', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: { id: '1', email: 'test@test.com' },
      profile: { roles: ['medico'] },
      isLoading: false,
      hasAnyRole: () => false,
    });
    renderWithRouter(
      <SupabaseProtectedRoute allowedRoles={['admin' as any]}>
        <div>Protected</div>
      </SupabaseProtectedRoute>
    );
    expect(screen.getByText('Acesso Negado')).toBeInTheDocument();
  });

  it('renderiza children com role correta', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: { id: '1', email: 'test@test.com' },
      profile: { roles: ['admin'] },
      isLoading: false,
      hasAnyRole: () => true,
    });
    renderWithRouter(
      <SupabaseProtectedRoute allowedRoles={['admin' as any]}>
        <div>Protected</div>
      </SupabaseProtectedRoute>
    );
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('renderiza children sem allowedRoles definido', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: { id: '1', email: 'test@test.com' },
      profile: { roles: ['medico'] },
      isLoading: false,
      hasAnyRole: () => true,
    });
    renderWithRouter(
      <SupabaseProtectedRoute>
        <div>Protected</div>
      </SupabaseProtectedRoute>
    );
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });
});
