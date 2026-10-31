import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GuiasPorAutorizacao } from '../GuiasPorAutorizacao';

vi.mock('@/lib/patientBasicData', () => ({
  buscarDadosBasicosPacientes: vi.fn(async () => new Map([['p1', { nome: 'Ana Souza' }], ['p2', { nome: 'Bruno Lima' }]])),
}));

const base = { numero_carteira: '123', codigo_procedimento: '40301010', quantidade: 1, valor_total: 80, lote_id: 'l1' };
const guias = [
  { ...base, id: 'g1', numero_guia: '1001', paciente_id: 'p1', autorizacao_id: 'a1', data_atendimento: '2026-10-10', tipo_servico: 'exame' },
  { ...base, id: 'g2', numero_guia: '1002', paciente_id: 'p2', autorizacao_id: 'a2', data_atendimento: '2026-10-11', tipo_servico: 'exame' },
  { ...base, id: 'g3', numero_guia: '1003', paciente_id: 'p2', autorizacao_id: null, data_atendimento: '2026-10-12', tipo_servico: 'procedimento' },
];
const autorizacoes = [
  { id: 'a1', status: 'autorizada', convenio_id: 'c1', paciente_id: 'p1', tipo_servico: 'exame', data_expiracao: '2026-10-31', numero_autorizacao: 'AUT-1' },
  { id: 'a2', status: 'negada', convenio_id: 'c1', paciente_id: 'p2', tipo_servico: 'exame', data_expiracao: null, numero_autorizacao: 'AUT-2' },
];
const lotes = [{ id: 'l1', numero_lote: 'L-77', convenio_id: 'c1', status: 'rascunho', convenios: { nome: 'Unimed' } }];

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><GuiasPorAutorizacao guias={guias} lotes={lotes} autorizacoes={autorizacoes} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('GuiasPorAutorizacao', () => {
  it('lista as guias com a situação da autorização e o link do lote', async () => {
    renderizar();
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
    const linhaAutorizada = screen.getByText('1001').closest('tr')!;
    expect(within(linhaAutorizada).getByText('Autorizada')).toBeInTheDocument();
    expect(within(linhaAutorizada).getByRole('link', { name: 'L-77' })).toHaveAttribute('href', '/faturamento-convenios/lotes/l1/guias');
    expect(within(screen.getByText('1002').closest('tr')!).getByText('Negada')).toBeInTheDocument();
    expect(within(screen.getByText('1003').closest('tr')!).getByText('Sem autorização')).toBeInTheDocument();
  });

  it('filtra só as guias com problema', async () => {
    renderizar();
    await screen.findByText('Ana Souza');
    fireEvent.click(screen.getByRole('button', { name: /Com problema 1/ }));
    expect(screen.queryByText('1001')).not.toBeInTheDocument();
    expect(screen.getByText('1002')).toBeInTheDocument();
    expect(screen.queryByText('1003')).not.toBeInTheDocument();
  });
});
