import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, insertMock } = vi.hoisted(() => ({ fromMock: vi.fn(), insertMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-teste' }, user: { id: 'usuario-teste' } }),
}));

import NovoChamadoSuportePage from '@/pages/NovoChamadoSuportePage';

function RetornoSuporte() {
  const location = useLocation();
  return <><h1>Central de Suporte</h1><output>{JSON.stringify(location.state)}</output></>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/suporte/novo', element: <NovoChamadoSuportePage /> },
    { path: '/suporte', element: <RetornoSuporte /> },
  ], {
    initialEntries: [{
      pathname: '/suporte/novo',
      state: {
        supportReturnTo: '/suporte',
        supportReturnState: { supportFilters: { busca: 'Impressora', status: 'aberto', prioridade: 'alta', pagina: 2 } },
      },
    }],
  });
  return render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
}

describe('NovoChamadoSuportePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });
  });

  it('valida os campos, envia o mesmo contrato e retorna com os filtros da fila', async () => {
    renderPage();

    const submit = screen.getByRole('button', { name: 'Enviar chamado' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Resumo do problema'), { target: { value: 'Impressora sem conexão' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'A impressora da recepção não conecta após reiniciar o equipamento.' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('support_tickets'));
    expect(insertMock).toHaveBeenCalledWith({
      titulo: 'Impressora sem conexão',
      descricao: 'A impressora da recepção não conecta após reiniciar o equipamento.',
      prioridade: 'normal',
      categoria: 'duvida',
      clinica_id: 'clinica-teste',
      solicitante_id: 'usuario-teste',
    });
    expect(await screen.findByRole('heading', { name: 'Central de Suporte' })).toBeInTheDocument();
    expect(screen.getByText(/"busca":"Impressora"/)).toBeInTheDocument();
  });

  it('mantém o rascunho quando o backend recusa a abertura', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'Abertura indisponível' } });
    renderPage();

    fireEvent.change(screen.getByLabelText('Resumo do problema'), { target: { value: 'Erro ao salvar exame' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'A página informa que não foi possível concluir o salvamento do exame.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar chamado' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Abertura indisponível');
    expect(screen.getByLabelText('Resumo do problema')).toHaveValue('Erro ao salvar exame');
    expect(screen.getByLabelText('Descrição')).toHaveValue('A página informa que não foi possível concluir o salvamento do exame.');
    expect(screen.getByRole('heading', { name: 'Abrir chamado' })).toBeInTheDocument();
  });
});
