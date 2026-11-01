import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from '../Sidebar';

const mocks = vi.hoisted(() => ({ useSupabaseAuth: vi.fn() }));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: mocks.useSupabaseAuth,
}));

vi.mock('@/hooks/useSubscriptionPlan', () => ({
  useUserPlan: () => ({ hasFeature: () => true, isLoading: false, isError: false }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function renderSidebar(path: string, platformAdmin: boolean, clinicaId: string | null = 'internal-clinic') {
  mocks.useSupabaseAuth.mockReturnValue({
    profile: { roles: ['admin'], clinica_id: clinicaId },
    isAdmin: () => true,
    isSuperAdmin: platformAdmin,
    isPlatformAdmin: platformAdmin,
  });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Sidebar />
        <LocationProbe />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('Sidebar alterna áreas para a dona da plataforma', () => {
  it('mantém Clientes aberto na edição de conta mesmo com todos os grupos recolhidos', async () => {
    localStorage.setItem('elolab_sidebar_groups_v4', '[]');
    renderSidebar('/usuarios/conta/editar', true);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Contas e acessos' })).toBeVisible());
    expect(screen.getByRole('link', { name: 'Contas e acessos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Pacientes' })).not.toBeInTheDocument();
  });
  // O seletor App/Painel Admin fica no cabeçalho global: ver NavbarAlternarArea.test.tsx.
  it('não mostra links da plataforma para assinante admin de clínica', () => {
    renderSidebar('/dashboard', false);

    expect(screen.queryByRole('link', { name: 'Painel Admin' })).not.toBeInTheDocument();
  });

  it('mostra só a área da plataforma quando a conta plataforma não tem clínica', () => {
    renderSidebar('/dashboard', true, null);

    expect(screen.getByRole('button', { name: 'Clientes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pacientes' })).not.toBeInTheDocument();
  });
});

describe('busca e preferências do menu lateral', () => {
  it('encontra os itens pelo nome do grupo e ignora acentos na busca', async () => {
    const user = userEvent.setup();
    renderSidebar('/dashboard', false);
    const search = screen.getByRole('textbox', { name: 'Buscar no menu' });

    await user.type(search, 'atendimento');
    expect(screen.getByRole('link', { name: 'Agenda' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recepção' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Caixa Diário' })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'clinica');
    expect(screen.getByRole('link', { name: 'Prontuários' })).toBeInTheDocument();
  });

  it('explica quando a busca não encontra telas e permite limpar o filtro', async () => {
    const user = userEvent.setup();
    renderSidebar('/dashboard', false);
    await user.type(screen.getByRole('textbox', { name: 'Buscar no menu' }), 'sem resultado');

    expect(screen.getByText('Nenhuma tela encontrada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar busca do menu' }));
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('continua navegável quando o navegador bloqueia o armazenamento local', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('bloqueado'); });

    renderSidebar('/dashboard', false);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('abre o menu ao selecionar uma categoria no modo recolhido', async () => {
    const user = userEvent.setup();
    renderSidebar('/dashboard', false);
    await user.click(screen.getByRole('button', { name: 'Recolher menu lateral' }));

    await user.click(screen.getByRole('button', { name: 'Expandir menu: Clínica' }));

    expect(screen.getByRole('textbox', { name: 'Buscar no menu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Prontuários' })).toBeInTheDocument();
  });

  it('deixa Ctrl+K para a busca global e não expande o menu recolhido', async () => {
    const user = userEvent.setup();
    renderSidebar('/dashboard', false);
    await user.click(screen.getByRole('button', { name: 'Recolher menu lateral' }));

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true });

    expect(screen.queryByRole('textbox', { name: 'Buscar no menu' })).not.toBeInTheDocument();
  });

  it('limpa a busca ao pressionar Escape', async () => {
    const user = userEvent.setup();
    renderSidebar('/dashboard', false);
    const search = screen.getByRole('textbox', { name: 'Buscar no menu' });
    await user.type(search, 'agenda');
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();

    fireEvent.keyDown(search, { key: 'Escape' });

    expect(search).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });
});
