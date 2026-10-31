import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const banco = vi.hoisted(() => ({
  tabelas: {} as Record<string, any[]>,
  rpc: vi.fn(),
  from: vi.fn(),
  admin: true,
}));

vi.mock('@/integrations/supabase/client', () => {
  const consulta = (tabela: string) => {
    const resultado = () => Promise.resolve({ data: banco.tabelas[tabela] ?? [], error: null });
    const q: any = {};
    for (const metodo of ['select', 'eq', 'gte', 'lt', 'order', 'limit', 'insert', 'update']) q[metodo] = () => q;
    q.range = () => resultado();
    q.single = () => Promise.resolve({ data: { ...(banco.tabelas[tabela]?.[0] ?? {}), id: 'nova' }, error: null });
    q.then = (ok: any, erro: any) => resultado().then(ok, erro);
    return q;
  };
  banco.from.mockImplementation(consulta);
  return { supabase: { from: banco.from, rpc: banco.rpc } };
});
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-1' }, isAdmin: () => banco.admin }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// jsdom não tem ResizeObserver, usado pelo ResponsiveContainer do Recharts.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

import Relacionamento from '../Relacionamento';

function renderizar(caminho = '/relacionamento') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[caminho]}>
        <Relacionamento />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  banco.admin = true;
  banco.rpc.mockReset();
  banco.rpc.mockImplementation((nome: string) => {
    if (nome === 'previa_publico_campanha') {
      return Promise.resolve({ data: { total: 2, amostra: [{ id: 'p1', nome: 'Carla Mendes' }, { id: 'p2', nome: 'Davi' }], clinica: 'Clínica Sol' }, error: null });
    }
    if (nome === 'resultado_campanhas') {
      return Promise.resolve({ data: [{ campanha_id: 'c2', pendente: 0, enviando: 0, enviado: 7, erro: 2, cancelado: 0, incerto: 0 }], error: null });
    }
    if (nome === 'listar_pacientes_sem_retorno') {
      return Promise.resolve({ data: [{ paciente_id: 'p9', nome: 'Elisa Prado', ultima_consulta: '2026-01-10', dias_sem_consulta: 294, telefone_final: '4321', tem_email: false }], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  banco.tabelas = {
    feedbacks_nps: [
      { id: 'f1', nota: 5, comentario: 'Atendimento excelente', created_at: '2026-10-20T12:00:00Z', medico_id: 'm1', medicos: { nome: 'Dra. Ana' }, pacientes: { nome: 'Bia' } },
      { id: 'f2', nota: 5, comentario: null, created_at: '2026-10-19T12:00:00Z', medico_id: 'm1', medicos: { nome: 'Dra. Ana' }, pacientes: { nome: 'Caio' } },
      { id: 'f3', nota: 1, comentario: 'Esperei muito', created_at: '2026-10-18T12:00:00Z', medico_id: 'm2', medicos: { nome: 'Dr. Bruno' }, pacientes: { nome: 'Duda' } },
      { id: 'f4', nota: 4, comentario: null, created_at: '2026-10-17T12:00:00Z', medico_id: 'm2', medicos: { nome: 'Dr. Bruno' }, pacientes: { nome: 'Eva' } },
    ],
    nps_resumo_mensal: [{ mes: '2026-10-01T00:00:00Z', total: 4, promotores: 2, neutros: 1, detratores: 1 }],
    campanhas: [
      { id: 'c1', nome: 'Check-up anual', canal: 'whatsapp', publico: 'ativos', publico_dias: 180, mensagem: 'Olá, {{primeiro_nome}}!', agendada_para: null, status: 'rascunho', total_destinatarios: 0, disparada_em: null, created_at: '2026-10-30T10:00:00Z' },
      { id: 'c2', nome: 'Outubro rosa', canal: 'email', publico: 'ativos', publico_dias: 180, mensagem: 'Olá', agendada_para: '2026-10-20T10:00:00Z', status: 'enviada', total_destinatarios: 9, disparada_em: '2026-10-20T10:00:00Z', created_at: '2026-10-19T10:00:00Z' },
    ],
  };
});

describe('Relacionamento', () => {
  it('mostra o NPS do período com a distribuição e os comentários', async () => {
    renderizar();

    expect(screen.getByRole('heading', { level: 1, name: 'Campanhas e NPS' })).toBeInTheDocument();
    expect(await screen.findByTestId('nps-valor')).toHaveTextContent('25');
    expect(screen.getByRole('img', { name: 'Promotores 50%, neutros 25%, detratores 25%' })).toBeInTheDocument();
    expect(screen.getByText('Esperei muito')).toBeInTheDocument();
    expect(screen.getByText('Dr. Bruno')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '90 dias' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('abre o editor para detratores com prévia do público e da mensagem', async () => {
    renderizar();

    fireEvent.click(await screen.findByRole('button', { name: /Criar campanha para detratores/ }));

    const editor = await screen.findByLabelText('Editor de campanha');
    expect(within(editor).getByLabelText('Nome')).toHaveValue('Retomar contato com detratores');
    expect(await within(editor).findByTestId('previa-total')).toHaveTextContent('2');
    expect(within(editor).getByText('Carla Mendes')).toBeInTheDocument();
    expect(within(editor).getByTestId('previa-mensagem')).toHaveTextContent('Olá, Carla. Vimos que sua última visita à Clínica Sol');
    expect(banco.rpc).toHaveBeenCalledWith('previa_publico_campanha', { p_publico: 'detratores_nps', p_dias: 90, p_canal: 'whatsapp' });

    const mensagem = within(editor).getByLabelText('Mensagem');
    fireEvent.change(mensagem, { target: { value: 'Oi ' } });
    fireEvent.click(within(editor).getByRole('button', { name: /Nome completo/ }));
    expect(within(editor).getByTestId('previa-mensagem')).toHaveTextContent('Oi Carla Mendes');
  });

  it('lista campanhas com resultado e confirma o disparo com a quantidade', async () => {
    renderizar('/relacionamento?tab=campanhas');

    expect(await screen.findByText('Check-up anual')).toBeInTheDocument();
    expect(await screen.findByText('7 enviados')).toBeInTheDocument();
    expect(screen.getByText('2 erros')).toHaveClass('text-destructive');

    fireEvent.click(screen.getByRole('button', { name: /^Disparar$/ }));
    expect(await screen.findByRole('button', { name: 'Disparar para 2' })).toBeInTheDocument();
    expect(banco.rpc).not.toHaveBeenCalledWith('disparar_campanha', expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Disparar para 2' }));
    await waitFor(() => expect(banco.rpc).toHaveBeenCalledWith('disparar_campanha', { p_campanha_id: 'c1' }));
  });

  it('esconde disparo e cancelamento para a recepção', async () => {
    banco.admin = false;
    renderizar('/relacionamento?tab=campanhas');

    expect(await screen.findByText('Check-up anual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Disparar$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancelar/ })).not.toBeInTheDocument();
  });

  it('lista pacientes sem retorno sem expor o telefone completo', async () => {
    renderizar('/relacionamento?tab=sem-retorno');

    expect(await screen.findByText('Elisa Prado')).toBeInTheDocument();
    expect(screen.getByText(/final 4321/)).toBeInTheDocument();
    expect(banco.rpc).toHaveBeenCalledWith('listar_pacientes_sem_retorno', { p_dias: 180, p_limite: 200 });

    fireEvent.click(screen.getByRole('button', { name: /Criar campanha/ }));
    const editor = await screen.findByLabelText('Editor de campanha');
    expect(within(editor).getByLabelText('Nome')).toHaveValue('Retorno: sem consulta há 180 dias');
  });
});
