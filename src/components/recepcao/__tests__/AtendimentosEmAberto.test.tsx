import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  invalidateQueries: vi.fn(),
  atomicMarkNoShow: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' } }),
}));
vi.mock('@/lib/operationalTransitions', () => ({ atomicMarkNoShow: mocks.atomicMarkNoShow }));
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, warning: vi.fn() },
}));

import { AtendimentosEmAberto } from '@/components/recepcao/AtendimentosEmAberto';

const atendimento = {
  id: 'appointment-1',
  data: '2026-09-30',
  hora_inicio: '10:00',
  tipo: 'consulta',
  paciente_id: 'patient-1',
  medico_id: 'doctor-1',
  pacientes: { nome: 'Ana Silva' },
};

describe('atendimentos antigos em aberto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useQuery.mockReturnValue({ data: [atendimento] });
    mocks.atomicMarkNoShow.mockResolvedValue({
      success: true,
      message: 'Atendimento cancelado e cobrança pendente cancelada.',
    });
  });

  it('confirma antes de cancelar e informa que a cobrança pendente será cancelada', async () => {
    render(<AtendimentosEmAberto onFinalizar={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Não foi' }));
    expect(await screen.findByRole('heading', { name: 'Marcar como não realizado?' })).toBeInTheDocument();
    expect(screen.getByText(/cobrança pendente, ela será cancelada/i)).toBeInTheDocument();
    expect(mocks.atomicMarkNoShow).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirmar cancelamento' }).className).toContain('bg-destructive');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    await waitFor(() => expect(mocks.atomicMarkNoShow).toHaveBeenCalledWith('appointment-1', 'clinic-1'));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Marcado como não realizado', {
      description: 'Atendimento cancelado e cobrança pendente cancelada.',
    });
  });

  it('apresenta bloqueio quando já há pagamento registrado', async () => {
    mocks.atomicMarkNoShow.mockResolvedValue({
      success: false,
      message: 'Há pagamento registrado. Estorne ou reconcilie o valor antes de marcar como não realizado.',
    });
    render(<AtendimentosEmAberto onFinalizar={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Não foi' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Não foi possível atualizar', {
      description: expect.stringContaining('Há pagamento registrado'),
    }));
    expect(mocks.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['fila_atendimento'] });
  });

  it('mostra estado de carregamento enquanto consulta os atendimentos', () => {
    mocks.useQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<AtendimentosEmAberto onFinalizar={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Verificando atendimentos antigos em aberto');
  });

  it('mostra erro e permite tentar novamente em vez de ocultar a lista', async () => {
    const refetch = vi.fn();
    mocks.useQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<AtendimentosEmAberto onFinalizar={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível verificar atendimentos antigos em aberto');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('mostra nome social, data, hora e médico do atendimento', () => {
    mocks.useQuery.mockReturnValue({ data: [{ ...atendimento, pacientes: { nome: 'Ana Silva', nome_social: 'Aninha' }, medicos: { nome: 'Júlia Prado' } }] });
    render(<AtendimentosEmAberto onFinalizar={vi.fn()} />);

    expect(screen.getByText('Aninha')).toBeInTheDocument();
    expect(screen.getByText('30/09 às 10:00 · Dr(a). Júlia Prado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Foi atendido' }).className).toContain('h-11');
  });

  it('encaminha a finalização do atendimento antigo para a tela própria', () => {
    const onFinalizar = vi.fn();
    render(<AtendimentosEmAberto onFinalizar={onFinalizar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Foi atendido' }));

    expect(onFinalizar).toHaveBeenCalledWith('appointment-1');
  });
});
