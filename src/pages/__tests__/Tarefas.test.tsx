import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMatchMedia = (hasCoarsePointer: boolean) => vi.fn((query: string) => ({
  matches: hasCoarsePointer && query === '(any-pointer: coarse)',
  media: query,
})) as unknown as typeof window.matchMedia;

const mocks = vi.hoisted(() => ({
  mutateTask: vi.fn(),
  roles: ['recepcao'] as string[],
  tarefas: [{
    id: 'task-1', titulo: 'Confirmar agenda da manhã', descricao: 'Verificar os horários da equipe',
    prioridade: 'alta', status: 'pendente', responsavel_id: null, paciente_id: 'patient-1',
    criado_por: null, categoria: 'Administrativo', data_vencimento: null, updated_at: '2026-10-10T12:00:00Z',
  }],
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: String(queryKey[0]) === 'tarefas' ? mocks.tarefas : String(queryKey[0]) === 'tarefas-pacientes' ? [{ id: 'patient-1', nome: 'Paciente Exemplo', nome_social: null }] : [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useMutation: () => ({ mutate: mocks.mutateTask, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { id: 'staff-1', clinica_id: 'clinic-1' }, user: { id: 'staff-1' }, isAdmin: () => mocks.roles.includes('admin'), hasRole: (role: string) => mocks.roles.includes(role) }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children: unknown }) => children },
  AnimatePresence: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/components/patients/PacienteCombobox', () => ({ PacienteCombobox: () => null }));

import Tarefas from '../Tarefas';

describe('Tarefas', () => {
  beforeEach(() => {
    mocks.mutateTask.mockClear();
    mocks.roles = ['recepcao'];
    mocks.tarefas.splice(1);
    mocks.tarefas[0].status = 'pendente';
    mocks.tarefas[0].responsavel_id = null;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: mockMatchMedia(true),
    });
  });

  it('abre a lista em touch e mantém as ações da tarefa acessíveis', () => {
    render(<MemoryRouter><Tarefas /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Tarefas da equipe' })).toBeInTheDocument();
    expect(screen.getByText('Confirmar agenda da manhã')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar tarefa Confirmar agenda da manhã' })).toBeInTheDocument();
  });

  it('expõe o filtro ativo dos indicadores para tecnologias assistivas', () => {
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    const total = screen.getByRole('button', { name: /Total/ });
    const vencidas = screen.getByRole('button', { name: /Vencidas/ });

    expect(total).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(vencidas);
    expect(vencidas).toHaveAttribute('aria-pressed', 'true');
    expect(total).toHaveAttribute('aria-pressed', 'false');
  });

  it('usa o token destrutivo no indicador de tarefas vencidas', () => {
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    const vencidas = screen.getByRole('button', { name: /Vencidas/ });
    const iconSurface = vencidas.querySelector('svg')?.parentElement;

    expect(iconSurface).toHaveClass('bg-destructive/10', 'text-destructive');
  });

  it('permite buscar por categoria, informa o total e limpa a busca com Escape', () => {
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    const search = screen.getByRole('textbox', { name: 'Buscar tarefas' });

    expect(screen.getByRole('combobox', { name: 'Filtrar tarefas por status' })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'administrativo' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 de 1 tarefas');
    expect(screen.getByText('Confirmar agenda da manhã')).toBeInTheDocument();

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
  });

  it('filtra tarefas atribuídas ao usuário e limpa o filtro pessoal', () => {
    mocks.tarefas[0].responsavel_id = 'staff-1';
    mocks.tarefas.push({ ...mocks.tarefas[0], id: 'task-2', titulo: 'Acompanhar retorno', responsavel_id: null });
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    const minhasTarefas = screen.getByRole('button', { name: 'Minhas tarefas' });

    expect(minhasTarefas).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(minhasTarefas);

    expect(minhasTarefas).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1 de 2 tarefas')).toBeInTheDocument();
    expect(screen.getByText(/Confirmar agenda/)).toBeInTheDocument();
    expect(screen.queryByText('Acompanhar retorno')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar tarefas' }), { target: { value: 'retorno' } });
    expect(screen.getByText('0 de 2 tarefas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca e filtros' }));
    expect(minhasTarefas).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/Confirmar agenda/)).toBeInTheDocument();
    expect(screen.getByText('Acompanhar retorno')).toBeInTheDocument();
  });

  it('foca a busca com o atalho / quando o foco não está em um campo de texto', () => {
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    const search = screen.getByRole('textbox', { name: 'Buscar tarefas' });

    fireEvent.keyDown(window, { key: '/' });
    expect(search).toHaveFocus();
  });

  it('preserva o foco do diálogo enquanto um modal está aberto', () => {
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    const search = screen.getByRole('textbox', { name: 'Buscar tarefas' });
    fireEvent.click(screen.getByRole('button', { name: 'Nova Tarefa' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '/' });
    expect(search).not.toHaveFocus();
  });

  it('mantém o Kanban no ponteiro preciso', () => {
    window.matchMedia = mockMatchMedia(false);
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    const iniciar = screen.getByRole('button', { name: 'Iniciar tarefa Confirmar agenda da manhã' });
    fireEvent.click(iniciar);
    expect(mocks.mutateTask).toHaveBeenCalledWith({ id: 'task-1', expectedUpdatedAt: '2026-10-10T12:00:00Z', status: 'em_andamento' });
    expect(screen.getByText('Confirmar agenda da manhã')).toBeInTheDocument();
  });

  it('opens the linked patient for doctors in list and Kanban views', () => {
    mocks.roles = ['medico'];
    const { unmount } = render(<MemoryRouter><Tarefas /></MemoryRouter>);

    expect(screen.getByText('Paciente Exemplo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Paciente Exemplo/ })).toHaveAttribute('href', '/pacientes?paciente=patient-1');

    unmount();
    window.matchMedia = mockMatchMedia(false);
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    expect(screen.getByText('Paciente Exemplo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Paciente Exemplo/ })).toHaveAttribute('href', '/pacientes?paciente=patient-1');
  });

  it('reopens a completed task by keyboard', () => {
    mocks.tarefas[0].status = 'concluida';
    window.matchMedia = mockMatchMedia(false);
    render(<MemoryRouter><Tarefas /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: /Reabrir tarefa/ }));

    expect(mocks.mutateTask).toHaveBeenCalledWith({ id: 'task-1', expectedUpdatedAt: '2026-10-10T12:00:00Z', status: 'pendente' });
  });
  it('associa rótulos acessíveis aos campos da tarefa', () => {
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Nova Tarefa' }));

    expect(screen.getByLabelText('Título *')).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição')).toBeInTheDocument();
    expect(screen.getByLabelText('Prioridade')).toBeInTheDocument();
    expect(screen.getByLabelText('Vencimento')).toBeInTheDocument();
    expect(screen.getByLabelText('Responsável')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoria')).toBeInTheDocument();
  });

  it('revela as ações do cartão quando recebem foco no modo lista', () => {
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    const excluir = screen.getByRole('button', { name: /Excluir tarefa/ });

    expect(excluir.parentElement).toHaveClass('md:group-focus-within:opacity-100');
  });

  it('revela as ações do cartão quando recebem foco no Kanban', () => {
    window.matchMedia = mockMatchMedia(false);
    render(<MemoryRouter><Tarefas /></MemoryRouter>);
    const excluir = screen.getByRole('button', { name: /Excluir tarefa/ });

    expect(excluir).toHaveClass('md:group-focus-within:opacity-100');
  });
});
