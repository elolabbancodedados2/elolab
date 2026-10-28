/**
 * CLIN-QA-555 (critério U2 de docs/time/GATES.md): com o diálogo de
 * prontuário aberto, trocar o paciente da rota ou clicar no rascunho de outro
 * paciente não pode gravar no paciente errado.
 *
 * Teste de tela: renderiza a página real de Prontuários com o Supabase
 * simulado e confere o `paciente_id` (ou o `id`) de cada escrita em
 * `prontuarios`. Dados sintéticos.
 *
 * Rodada 4: na base atual, a troca de paciente com a evolução aberta passa
 * pela confirmação "Trocar o contexto do paciente?" (`patientContextChange`).
 * CA2 e CA3/CA4 conferem esse fluxo; a guarda de `performSave` continua como
 * defesa para as corridas (CA5) e tem testes de unidade em
 * `src/lib/__tests__/pacienteDoRegistro.test.ts`.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import type { ReactNode } from 'react';
import Prontuarios from '@/pages/Prontuarios';

interface Escrita {
  tabela: string;
  op: string;
  payload: Record<string, unknown> | undefined;
  filtros: unknown[][];
}

const PACIENTE_A = {
  id: 'pac-a', nome: 'Ana Sintética', nome_social: null, cpf: null, telefone: null, email: null,
  data_nascimento: '1980-01-01', convenio_id: null, alergias: [] as string[],
};
const PACIENTE_B = {
  id: 'pac-b', nome: 'Bruno Sintético', nome_social: null, cpf: null, telefone: null, email: null,
  data_nascimento: '1975-06-15', convenio_id: null, alergias: [] as string[],
};

const mocks = vi.hoisted(() => ({
  escritas: [] as Escrita[],
  rpcs: [] as Array<{ nome: string; args: unknown }>,
  prontuarios: [] as Array<Record<string, unknown>>,
  rascunhos: [] as Array<Record<string, unknown>>,
  acessosPendentes: {} as Record<string, Promise<void>>,
  registrarAcesso: vi.fn(),
  navigate: null as null | NavigateFunction,
  cache: new Map<string, unknown>(),
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    user: { id: 'user-1' },
    profile: { id: 'user-1', clinica_id: 'clinic-1', nome: 'Dra. Teste', roles: ['medico'] },
    hasAnyRole: () => true,
  }),
}));

vi.mock('@/hooks/useCurrentMedico', () => ({
  useCurrentMedico: () => ({ medicoId: 'med-1', isMedicoOnly: true, currentMedico: null }),
}));

vi.mock('@/hooks/useBuscaPacientes', () => {
  const resultado = {
    data: { pacientes: [], incompleta: false },
    isFetching: false, isDebouncing: false, isPlaceholderData: false, isError: false, error: null,
    refetch: () => undefined,
  };
  return {
    useBuscaPacientes: () => {
      resultado.data.pacientes = [PACIENTE_A, PACIENTE_B] as never;
      return resultado;
    },
  };
});

vi.mock('@/hooks/useSupabaseData', () => {
  const medicos = { data: [{ id: 'med-1', nome: 'Dra. Teste', crm: '12345', ativo: true }], isLoading: false, error: null, refetch: () => undefined };
  const vazio = { data: [], isLoading: false, error: null, refetch: () => undefined };
  const refetch = () => Promise.resolve();
  return {
    useMedicos: () => medicos,
    useAgendamentos: () => vazio,
    useAgendamentosPeriodo: () => vazio,
    // Resultado estável por chave, como o React Query: arrays novos a cada
    // render dispararam efeitos que dependem da identidade dos dados.
    useSupabaseQuery: (tabela: string, opts?: { enabled?: boolean; filters?: Array<{ column: string; value: unknown }> }) => {
      if (opts?.enabled === false) {
        const chave = `${tabela}:desligada`;
        if (!mocks.cache.has(chave)) mocks.cache.set(chave, { data: undefined, isLoading: false, isError: false, error: null, refetch });
        return mocks.cache.get(chave);
      }
      const alvo = opts?.filters?.find(f => f.column === 'id' || f.column === 'paciente_id')?.value as string | undefined;
      const chave = `${tabela}:${alvo ?? ''}`;
      if (!mocks.cache.has(chave)) {
        let data: unknown[] = [];
        if (tabela === 'pacientes') data = [PACIENTE_A, PACIENTE_B].filter(p => p.id === alvo);
        if (tabela === 'prontuarios') data = mocks.prontuarios.filter(p => p.paciente_id === alvo);
        mocks.cache.set(chave, { data, isLoading: false, isError: false, error: null, refetch });
      }
      return mocks.cache.get(chave);
    },
  };
});

vi.mock('@/lib/prontuarioAudit', () => ({
  autorizarLeituraHistoricoPaciente: () => Promise.resolve(),
  registrarAcessoProntuario: (...args: unknown[]) => mocks.registrarAcesso(...args),
  registrarExportacaoProntuarios: () => Promise.resolve(),
}));

vi.mock('@/lib/buscarEmBlocos', () => ({
  buscarEmBlocos: () => Promise.resolve(mocks.rascunhos),
  LIMITE_BUSCA_EM_BLOCOS: 5000,
}));

vi.mock('@/lib/configClinica', () => ({ lerConfigsClinica: () => Promise.resolve({}) }));
vi.mock('@/lib/pdfGenerator', () => ({
  gerarProntuarioPDF: vi.fn(), downloadPDF: vi.fn(), openPDF: vi.fn(), sharePDFWhatsApp: vi.fn(),
}));

// Componentes clínicos com dados próprios não fazem parte deste fluxo.
vi.mock('@/components/clinical', () => {
  const Vazio = () => null;
  return {
    AllergyAlert: Vazio, Cid10Search: Vazio, ClinicalProtocols: Vazio, ReturnScheduler: Vazio,
    DischargeReport: Vazio, AnexosProntuario: Vazio, VitalSignsChart: Vazio, PatientTimeline: Vazio,
    PatientPhoto: Vazio, DigitalSignature: Vazio, DrugInteractionChecker: Vazio,
    ProcedimentosDoAtendimento: Vazio, ClinicalSafetyPanel: Vazio,
  };
});
vi.mock('@/components/clinical/ProntuarioAdendos', () => ({ ProntuarioAdendos: () => null }));
vi.mock('@/components/clinical/PreConsultaCard', () => ({ PreConsultaCard: () => null }));
vi.mock('@/components/clinical/ExportacaoClinicaProtegida', () => ({ ExportacaoClinicaProtegida: () => null }));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const semAnimacao = new Set(['initial', 'animate', 'exit', 'transition', 'layout', 'whileHover', 'whileTap', 'variants']);
  // Um componente por tag, criado uma vez: recriá-lo a cada render remontaria
  // o elemento e deixaria o nó encontrado pelo teste fora do documento.
  const porTag = new Map<string, unknown>();
  const motion = new Proxy({}, {
    get: (_alvo, tag: string) => {
      if (!porTag.has(tag)) {
        porTag.set(tag, React.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
          const limpas: Record<string, unknown> = { ref };
          for (const [k, v] of Object.entries(props)) if (!semAnimacao.has(k)) limpas[k] = v;
          return React.createElement(tag, limpas);
        }));
      }
      return porTag.get(tag);
    },
  });
  return { motion, AnimatePresence: ({ children }: { children: ReactNode }) => children };
});

vi.mock('@/integrations/supabase/client', () => {
  const resolver = (e: Escrita) => {
    if (e.tabela === 'prontuarios' && e.op === 'insert') {
      return { data: { id: 'pront-novo', updated_at: '2026-10-27T12:00:00Z' }, error: null };
    }
    if (e.tabela === 'prontuarios' && e.op === 'update') {
      const id = e.filtros.find(f => f[0] === 'id')?.[1];
      return { data: { id, updated_at: '2026-10-27T12:30:00Z' }, error: null };
    }
    return { data: [], error: null };
  };
  const consulta = (tabela: string) => {
    const estado: Escrita = { tabela, op: 'select', payload: undefined, filtros: [] };
    const builder: Record<string | symbol, unknown> = new Proxy({}, {
      get: (_alvo, prop) => {
        if (prop === 'then') {
          return (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) =>
            Promise.resolve(resolver(estado)).then(ok, falha);
        }
        return (...args: unknown[]) => {
          if (prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete') {
            estado.op = prop;
            estado.payload = args[0] as Record<string, unknown>;
            mocks.escritas.push(estado);
          }
          if (prop === 'eq') estado.filtros.push(args);
          return builder;
        };
      },
    });
    return builder;
  };
  return {
    supabase: {
      from: (tabela: string) => consulta(tabela),
      rpc: (nome: string, args: unknown) => {
        mocks.rpcs.push({ nome, args });
        return Promise.resolve({ data: null, error: null });
      },
      storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => undefined,
    },
  };
});

function CapturaNavegacao() {
  mocks.navigate = useNavigate();
  return null;
}

function renderizar(rota = '/prontuarios') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[rota]}>
        <Routes>
          <Route path="/prontuarios" element={<><Prontuarios /><CapturaNavegacao /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** A tem uma evolução no histórico; B tem um rascunho do mesmo médico. */
function prepararRascunhoDeB() {
  mocks.prontuarios = [
    { id: 'pront-a', paciente_id: 'pac-a', medico_id: 'med-1', data: '2026-10-20', queixa_principal: 'Consulta de A', assinado: false, updated_at: '2026-10-20T10:00:00Z' },
    { id: 'rasc-b', paciente_id: 'pac-b', medico_id: 'med-1', data: '2026-10-26', queixa_principal: 'Rascunho de B', assinado: false, updated_at: '2026-10-26T10:00:00Z' },
  ];
  mocks.rascunhos = [
    { ...mocks.prontuarios[1], pacientes: { nome: 'Bruno Sintético' } },
  ];
}

const escritasEmProntuarios =() => mocks.escritas.filter(e => e.tabela === 'prontuarios');

async function abrirNovoAtendimento(nomePaciente: string) {
  await screen.findAllByText(nomePaciente);
  // O cabeçalho e a barra de ações têm o mesmo botão, com o mesmo handler.
  fireEvent.click((await screen.findAllByRole('button', { name: /Novo Atendimento/ }))[0]);
  const dialogo = await screen.findByRole('dialog');
  await within(dialogo).findAllByText(new RegExp(nomePaciente));
  return dialogo;
}

async function trocarRota(rota: string) {
  await act(async () => { mocks.navigate!(rota); });
}

beforeEach(() => {
  mocks.escritas.length = 0;
  mocks.rpcs.length = 0;
  mocks.prontuarios = [];
  mocks.rascunhos = [];
  mocks.acessosPendentes = {};
  mocks.cache.clear();
  mocks.registrarAcesso.mockReset();
  mocks.registrarAcesso.mockImplementation((id: string, tipo: string) => (
    tipo === 'visualizacao' && mocks.acessosPendentes[id] ? mocks.acessosPendentes[id] : Promise.resolve()
  ));
  Object.values(mocks.toast).forEach(fn => fn.mockReset());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CLIN-QA-555: o prontuário grava sempre no paciente exibido', () => {
  it('CA1: grava a evolução nova no paciente da rota e identifica esse paciente', async () => {
    renderizar('/prontuarios?paciente=pac-a');
    const dialogo = await abrirNovoAtendimento('Ana Sintética');

    fireEvent.change(within(dialogo).getByPlaceholderText('Queixa principal...'), { target: { value: 'Cefaleia há dois dias' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Salvar Prontuário/ }));

    await waitFor(() => expect(escritasEmProntuarios()).toHaveLength(1));
    const [escrita] = escritasEmProntuarios();
    expect(escrita.op).toBe('insert');
    expect(escrita.payload).toMatchObject({ paciente_id: 'pac-a', clinica_id: 'clinic-1', queixa_principal: 'Cefaleia há dois dias' });
  });

  it('CA2: trocar o paciente da rota sem alterações pede confirmação, não grava e só então abre o outro paciente', async () => {
    renderizar('/prontuarios?paciente=pac-a');
    const dialogo = await abrirNovoAtendimento('Ana Sintética');

    await trocarRota('/prontuarios?paciente=pac-b');

    const confirmacao = await screen.findByRole('dialog', { name: 'Trocar o contexto do paciente?' });
    // Enquanto a troca não é confirmada, a evolução continua sendo de Ana.
    expect(within(dialogo).queryByText(/Bruno Sintético/)).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('alert')).not.toBeInTheDocument();
    expect(escritasEmProntuarios()).toHaveLength(0);

    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Trocar paciente' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findAllByText('Bruno Sintético')).not.toHaveLength(0);
    expect(escritasEmProntuarios()).toHaveLength(0);
  });

  it('CA3/CA4: com texto digitado, a troca de rota não grava em nenhum paciente até a decisão, e descartar leva o próximo registro para B', async () => {
    renderizar('/prontuarios?paciente=pac-a');
    const dialogo = await abrirNovoAtendimento('Ana Sintética');
    fireEvent.change(within(dialogo).getByPlaceholderText('Queixa principal...'), { target: { value: 'Texto digitado vendo Ana' } });

    await trocarRota('/prontuarios?paciente=pac-b');

    const confirmacao = await screen.findByRole('dialog', { name: 'Trocar o contexto do paciente?' });
    expect(within(dialogo).queryByText(/Bruno Sintético/)).not.toBeInTheDocument();
    expect(escritasEmProntuarios()).toHaveLength(0);
    expect(mocks.rpcs).toHaveLength(0);

    // Descartar: o texto digitado vendo Ana não vai para ninguém.
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Descartar e trocar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(escritasEmProntuarios()).toHaveLength(0);

    const dialogoB = await abrirNovoAtendimento('Bruno Sintético');
    expect(within(dialogoB).getByPlaceholderText('Queixa principal...')).toHaveValue('');
    fireEvent.change(within(dialogoB).getByPlaceholderText('Queixa principal...'), { target: { value: 'Dor lombar' } });
    fireEvent.click(within(dialogoB).getByRole('button', { name: /Salvar Prontuário/ }));

    await waitFor(() => expect(escritasEmProntuarios()).toHaveLength(1));
    expect(escritasEmProntuarios()[0].payload).toMatchObject({ paciente_id: 'pac-b', queixa_principal: 'Dor lombar' });
  });

  it('CA5 (H1): a abertura de A que termina logo após o clique no rascunho de B não abre A nem grava em A', async () => {
    prepararRascunhoDeB();
    let liberarA: () => void = () => undefined;
    mocks.acessosPendentes['pront-a'] = new Promise<void>(resolve => { liberarA = resolve; });

    renderizar();
    fireEvent.click((await screen.findAllByRole('button', { name: /Ana Sintética/ }))[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Abrir evolução de .*Consulta de A/ }));
    expect(mocks.registrarAcesso).toHaveBeenCalledWith('pront-a', 'visualizacao');

    // A resposta de A chega no mesmo instante do clique, antes de B começar a abrir.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bruno Sintético.*Retomar/ }));
      liberarA();
      await Promise.resolve();
    });

    // Em nenhum momento o diálogo pode exibir ou carregar o registro de A.
    expect(mocks.registrarAcesso).not.toHaveBeenCalledWith('pront-a', 'edicao', expect.anything());
    const dialogo = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialogo).getByPlaceholderText('Queixa principal...')).toHaveValue('Rascunho de B'));
    expect(mocks.toast.info).not.toHaveBeenCalledWith('O prontuário foi fechado porque o paciente selecionado mudou.');

    await waitFor(() => expect(mocks.registrarAcesso).toHaveBeenCalledWith('rasc-b', 'edicao', 'Modo de edição ativado'));
    fireEvent.change(within(dialogo).getByPlaceholderText('Queixa principal...'), { target: { value: 'Rascunho de B revisado' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Salvar Prontuário/ }));
    await waitFor(() => expect(escritasEmProntuarios()).toHaveLength(1));
    expect(escritasEmProntuarios()[0].filtros).toContainEqual(['id', 'rasc-b']);
  });

  it('CA5 (H1): a abertura de A que termina depois de B aberto não altera o diálogo de B', async () => {
    prepararRascunhoDeB();
    let liberarA: () => void = () => undefined;
    mocks.acessosPendentes['pront-a'] = new Promise<void>(resolve => { liberarA = resolve; });

    renderizar();
    // Seleciona A pela lista e começa a abrir a evolução de A (auditoria lenta).
    const resultadoA = (await screen.findAllByRole('button', { name: /Ana Sintética/ }))[0];
    fireEvent.click(resultadoA);
    fireEvent.click(await screen.findByRole('button', { name: /Abrir evolução de .*Consulta de A/ }));
    expect(mocks.registrarAcesso).toHaveBeenCalledWith('pront-a', 'visualizacao');

    // Antes de A terminar, o médico retoma o rascunho de B.
    fireEvent.click(screen.getByRole('button', { name: /Bruno Sintético.*Retomar/ }));
    const dialogo = await screen.findByRole('dialog');
    await within(dialogo).findAllByText(/Bruno Sintético/);
    await waitFor(() => expect(mocks.registrarAcesso).toHaveBeenCalledWith('rasc-b', 'edicao', 'Modo de edição ativado'));
    await waitFor(() => expect(within(dialogo).getByPlaceholderText('Queixa principal...')).toHaveValue('Rascunho de B'));

    // A resposta atrasada de A chega agora.
    await act(async () => { liberarA(); await Promise.resolve(); });

    const dialogoDepois = screen.getByRole('dialog');
    expect(within(dialogoDepois).getByPlaceholderText('Queixa principal...')).toHaveValue('Rascunho de B');
    expect(within(dialogoDepois).queryByText(/Ana Sintética/)).not.toBeInTheDocument();
    expect(within(dialogoDepois).queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(within(dialogoDepois).getByPlaceholderText('Queixa principal...'), { target: { value: 'Rascunho de B revisado' } });
    fireEvent.click(within(dialogoDepois).getByRole('button', { name: /Salvar Prontuário/ }));

    await waitFor(() => expect(escritasEmProntuarios()).toHaveLength(1));
    const [escrita] = escritasEmProntuarios();
    expect(escrita.op).toBe('update');
    expect(escrita.filtros).toContainEqual(['id', 'rasc-b']);
    expect(escrita.filtros).not.toContainEqual(['id', 'pront-a']);
    expect(escrita.payload).toMatchObject({ queixa_principal: 'Rascunho de B revisado' });
    expect(mocks.rpcs).toEqual([
      expect.objectContaining({ nome: 'substituir_prescricoes_do_prontuario', args: expect.objectContaining({ p_prontuario_id: 'rasc-b' }) }),
    ]);
  });
});
