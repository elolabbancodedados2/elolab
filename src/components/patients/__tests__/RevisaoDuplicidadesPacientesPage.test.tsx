import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: rpcMock, from: fromMock } }));

import RevisaoDuplicidadesPacientesPage from '@/pages/RevisaoDuplicidadesPacientesPage';

const pares = [{
  paciente_a: 'paciente-a', nome_a: 'Ana Lima', nascimento_a: '1985-05-12', telefone_final_a: null,
  paciente_b: 'paciente-b', nome_b: 'Ana Lima', nascimento_b: '1985-05-12', telefone_final_b: null,
  pontuacao: 100, motivos: ['cpf'],
}];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/pacientes/duplicidades', element: <RevisaoDuplicidadesPacientesPage /> },
    { path: '/pacientes', element: <div>Lista de pacientes</div> },
  ], { initialEntries: [{ pathname: '/pacientes/duplicidades', state: { patientReturnTo: '/pacientes?origem=lista' } }] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('RevisaoDuplicidadesPacientesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockImplementation((name: string) => {
      if (name === 'listar_duplicidades_pacientes') return Promise.resolve({ data: pares, error: null });
      if (name === 'mesclar_pacientes') return Promise.resolve({ data: { mesclagem_id: 'merge-1' }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    fromMock.mockImplementation(() => {
      const query = {
        select: vi.fn(),
        in: vi.fn(),
      };
      query.select.mockReturnValue(query);
      query.in.mockImplementation(() => Promise.resolve({ data: [
        { id: 'paciente-a', nome: 'Ana Lima', created_at: '2024-01-01', cpf: '111' },
        { id: 'paciente-b', nome: 'Ana Lima', created_at: '2024-02-01', cpf: '222' },
      ], error: null }));
      return query;
    });
  });

  it('abre a comparação e exige confirmação explícita antes de mesclar', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Revisar cadastros duplicados' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }));

    expect(await screen.findByText('Ficha que permanece ativa')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Motivo da mesclagem'), { target: { value: 'Mesmo cadastro confirmado pela recepção.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mesclar cadastros' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalledWith('mesclar_pacientes', expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mesclagem' }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('mesclar_pacientes', expect.objectContaining({
      p_origem: 'paciente-b',
      p_destino: 'paciente-a',
      p_motivo: 'Mesmo cadastro confirmado pela recepção.',
    })));
  });

  it('preserva as escolhas quando a pessoa cancela a saída da revisão', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }));
    const reason = await screen.findByLabelText('Motivo da mesclagem');
    fireEvent.change(reason, { target: { value: 'Mesmo cadastro confirmado pela recepção.' } });
    fireEvent.click(screen.getByRole('button', { name: /^Voltar$/ }));

    expect(await screen.findByRole('heading', { name: 'Descartar esta revisão?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar preenchendo' }));
    expect(screen.getByLabelText('Motivo da mesclagem')).toHaveValue('Mesmo cadastro confirmado pela recepção.');
  });

  it('bloqueia a navegação para pacientes enquanto houver alterações não salvas', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }));
    const reason = await screen.findByLabelText('Motivo da mesclagem');
    fireEvent.change(reason, { target: { value: 'Mesmo cadastro confirmado pela recepção.' } });
    fireEvent.click(screen.getByRole('link', { name: 'Voltar a pacientes' }));

    expect(await screen.findByRole('heading', { name: 'Sair sem salvar?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar nesta página' }));
    expect(screen.getByLabelText('Motivo da mesclagem')).toHaveValue('Mesmo cadastro confirmado pela recepção.');
  });
});
