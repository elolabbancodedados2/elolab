import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import { AutorizacaoConvenioModal } from '../AutorizacaoConvenioModal';

const convenios = [
  { id: 'convenio-a', nome: 'Convênio A', telefone: null, email: 'a@example.com', carencia: 0 },
  { id: 'convenio-b', nome: 'Convênio B', telefone: null, email: 'b@example.com', carencia: 0 },
];

function configurarConsultas(errorAutorizacoes: Error | null = null) {
  fromMock.mockImplementation((table: string) => {
    const result = table === 'autorizacoes_convenio'
      ? { data: errorAutorizacoes ? null : [], error: errorAutorizacoes }
      : { data: convenios, error: null };
    const query: Record<string, any> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return query;
  });
}

describe('AutorizacaoConvenioModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configurarConsultas();
    rpcMock.mockResolvedValue({ data: { email_enfileirado: false }, error: null });
  });

  it('seleciona o convenio do paciente atual ao reabrir para outro paciente', async () => {
    const props = { open: true, onOpenChange: vi.fn(), pacienteId: 'paciente-a', pacienteNome: 'Paciente A', convenioId: 'convenio-a' };
    const view = render(<AutorizacaoConvenioModal {...props} />);
    await screen.findByText('Nenhuma autorização solicitada');

    view.rerender(<AutorizacaoConvenioModal {...props} open={false} pacienteId="paciente-b" pacienteNome="Paciente B" convenioId="convenio-b" />);
    view.rerender(<AutorizacaoConvenioModal {...props} open pacienteId="paciente-b" pacienteNome="Paciente B" convenioId="convenio-b" />);
    await screen.findByText('Nenhuma autorização solicitada');
    fireEvent.click(screen.getByRole('button', { name: /Solicitar Autorização/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitação/i }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('solicitar_autorizacao_convenio', expect.objectContaining({
      p_paciente_id: 'paciente-b',
      p_convenio_id: 'convenio-b',
    })));
  });

  it('mostra retry e recarrega quando a leitura de autorizações falha', async () => {
    configurarConsultas(new Error('offline'));
    render(<AutorizacaoConvenioModal open onOpenChange={vi.fn()} pacienteId="paciente-a" pacienteNome="Paciente A" />);
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    configurarConsultas();
    fireEvent.click(retry);
    await screen.findByText('Nenhuma autorização solicitada');
    expect(fromMock).toHaveBeenCalledTimes(3);
  });

  it('impede fechar enquanto a solicitacao esta sendo enviada', async () => {
    let resolver: ((result: unknown) => void) | undefined;
    rpcMock.mockImplementation(() => new Promise(resolve => { resolver = resolve; }));
    const onOpenChange = vi.fn();
    render(<AutorizacaoConvenioModal open onOpenChange={onOpenChange} pacienteId="paciente-a" pacienteNome="Paciente A" convenioId="convenio-a" />);
    await screen.findByText('Nenhuma autorização solicitada');
    fireEvent.click(screen.getByRole('button', { name: /Solicitar Autorização/i }));
    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitação/i }));

    const close = screen.getByRole('button', { name: 'Fechar' });
    await waitFor(() => expect(close).toBeDisabled());
    fireEvent.click(close);
    expect(onOpenChange).not.toHaveBeenCalled();

    resolver?.({ data: { email_enfileirado: false }, error: null });
    await waitFor(() => expect(close).not.toBeDisabled());
  });
});
