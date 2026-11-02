import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock, rpc: rpcMock } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-a' } }) }));

import { AutorizacaoConvenioWorkspace } from '../AutorizacaoConvenioWorkspace';

const convenios = [
  { id: 'convenio-a', nome: 'Convenio A', telefone: null, email: 'a@example.com', carencia: 0 },
  { id: 'convenio-b', nome: 'Convenio B', telefone: null, email: 'b@example.com', carencia: 0 },
];

const updateMock = vi.fn();
const eqMock = vi.fn();

function configurarConsultas(errorAutorizacoes: Error | null = null, autorizacoes: unknown[] = []) {
  fromMock.mockImplementation((table: string) => {
    const result = table === 'autorizacoes_convenio'
      ? { data: errorAutorizacoes ? null : autorizacoes, error: errorAutorizacoes }
      : { data: convenios, error: null };
    const query: Record<string, any> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn((...args: unknown[]) => { eqMock(table, ...args); return query; });
    query.order = vi.fn(() => query);
    query.update = vi.fn((payload: unknown) => { updateMock(payload); return query; });
    query.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'auth-1' }, error: null }));
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return query;
  });
}

function renderWorkspace(patientId = 'paciente-a', convenioId = 'convenio-a') {
  const router = createMemoryRouter([
    {
      path: '/work',
      element: <AutorizacaoConvenioWorkspace
        onExit={vi.fn()}
        pacienteId={patientId}
        pacienteNome={patientId === 'paciente-a' ? 'Paciente A' : 'Paciente B'}
        convenioId={convenioId}
      />,
    },
    { path: '/other', element: <div>Outra rota</div> },
  ], { initialEntries: ['/work'] });
  return { ...render(<RouterProvider router={router} />), router };
}

describe('AutorizacaoConvenioWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configurarConsultas();
    rpcMock.mockResolvedValue({ data: { email_enfileirado: false }, error: null });
  });

  it('renders as a dedicated page and submits for the patient in its route context', async () => {
    renderWorkspace('paciente-b', 'convenio-b');
    await screen.findByText('Nenhuma autorização solicitada');
    expect(screen.getByTestId('patient-insurance-authorizations-page')).toBeVisible();
    expect(screen.getByText('Paciente B')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Solicitar autoriza/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicita/i }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('solicitar_autorizacao_convenio', expect.objectContaining({
      p_paciente_id: 'paciente-b',
      p_convenio_id: 'convenio-b',
    })));
  });

  it('shows retry and reloads when authorization records cannot be read', async () => {
    configurarConsultas(new Error('offline'));
    renderWorkspace();
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    configurarConsultas();
    fireEvent.click(retry);
    await screen.findByText('Nenhuma autorização solicitada');
    expect(fromMock).toHaveBeenCalledTimes(3);
  });

  it('protects an edited request when navigating away', async () => {
    const { router } = renderWorkspace();
    await screen.findByText('Nenhuma autorização solicitada');
    fireEvent.click(screen.getByRole('button', { name: /Solicitar autoriza/i }));
    fireEvent.change(screen.getByLabelText(/Descri/), { target: { value: 'Consulta especializada' } });

    await router.navigate('/other');
    expect(await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar nesta página' }));
    expect(screen.getByTestId('patient-insurance-authorizations-page')).toBeVisible();

    await router.navigate('/other');
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar e sair' }));
    expect(await screen.findByText('Outra rota')).toBeVisible();
  });

  it('filtra pela clínica e não pré-seleciona convênio que o paciente não tem', async () => {
    renderWorkspace('paciente-a', 'convenio-inexistente');
    await screen.findByText('Nenhuma autorização solicitada');
    expect(eqMock).toHaveBeenCalledWith('autorizacoes_convenio', 'clinica_id', 'clinica-a');
    expect(eqMock).toHaveBeenCalledWith('convenios', 'clinica_id', 'clinica-a');
    fireEvent.click(screen.getByRole('button', { name: /Solicitar autoriza/i }));
    expect(screen.getByRole('button', { name: /Enviar solicita/i })).toBeDisabled();
  });

  it('registra a resposta autorizada da operadora com senha', async () => {
    configurarConsultas(null, [{ id: 'auth-1', descricao: 'Consulta', status: 'pendente', numero_autorizacao: null, data_solicitacao: '2026-10-30T10:00:00Z', data_autorizacao: null, data_expiracao: null, observacoes: null, convenios: { nome: 'Convenio A', telefone: null } }]);
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar resposta' }));
    fireEvent.change(screen.getByLabelText('Senha da autorização'), { target: { value: 'SENHA9' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar resposta/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'autorizada', numero_autorizacao: 'SENHA9' })));
  });
});
