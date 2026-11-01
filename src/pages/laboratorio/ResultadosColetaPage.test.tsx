import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  chamadas: [] as Array<{ tabela: string; metodo: string; args: unknown[] }>,
  toast: { success: vi.fn(), error: vi.fn() },
  statusColeta: 'em_analise',
}));

/** Builder encadeável: registra as chamadas e resolve conforme a tabela/operação. */
function builder(tabela: string) {
  let operacao = 'select';
  const resolver = () => {
    if (tabela === 'coletas_laboratorio') {
      return { data: { id: 'coleta-1', paciente_id: 'p1', codigo_amostra: 'AM-1', tipo_amostra: 'Sangue', status: mocks.statusColeta, pacientes: { nome: 'Ana' }, exames: null }, error: null };
    }
    if (operacao === 'delete' || operacao === 'update') return { data: [{ id: 'r1' }], error: null };
    return { data: [{ id: 'r1', parametro: 'Hemoglobina', resultado: '14', unidade: 'g/dL', valor_referencia_min: 12, valor_referencia_max: 16, critico: false }], error: null };
  };
  const alvo: any = {};
  for (const metodo of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'in', 'not']) {
    alvo[metodo] = (...args: unknown[]) => {
      mocks.chamadas.push({ tabela, metodo, args });
      if (['insert', 'update', 'delete'].includes(metodo)) operacao = metodo;
      return alvo;
    };
  }
  alvo.maybeSingle = () => Promise.resolve(resolver());
  alvo.then = (ok: any, erro: any) => Promise.resolve(resolver()).then(ok, erro);
  return alvo;
}

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'u1' }, profile: { clinica_id: 'c1' } }) }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/components/UnsavedChangesGuard', () => ({ UnsavedChangesGuard: () => null }));

import ResultadosColetaPage from './ResultadosColetaPage';

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/laboratorio/coletas/coleta-1/resultados']}>
        <Routes><Route path="/laboratorio/coletas/:coletaId/resultados" element={<ResultadosColetaPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResultadosColetaPage', () => {
  beforeEach(() => {
    // O Checkbox do Radix mede o tamanho do controle; o jsdom não tem ResizeObserver.
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
    vi.clearAllMocks();
    mocks.chamadas.length = 0;
    mocks.statusColeta = 'em_analise';
    mocks.from.mockImplementation((tabela: string) => builder(tabela));
  });

  it('remove um resultado só depois de confirmar, restrito à clínica e à amostra', async () => {
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Remover resultado Hemoglobina' }));
    expect(mocks.chamadas.some(c => c.metodo === 'delete')).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Remover resultado' }));

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Resultado removido'));
    const filtros = mocks.chamadas.filter(c => c.tabela === 'resultados_laboratorio' && c.metodo === 'eq').map(c => c.args);
    expect(filtros).toEqual(expect.arrayContaining([['id', 'r1'], ['clinica_id', 'c1'], ['coleta_id', 'coleta-1']]));
  });

  it('carrega o resultado no formulário para correção e grava com update', async () => {
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar resultado Hemoglobina' }));
    expect(screen.getByLabelText('Resultado *')).toHaveValue('14');
    fireEvent.change(screen.getByLabelText('Resultado *'), { target: { value: '13,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }));

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Resultado corrigido'));
    expect(mocks.chamadas.find(c => c.metodo === 'update')?.args[0]).toMatchObject({ resultado: '13,5', parametro: 'Hemoglobina' });
    expect(mocks.chamadas.some(c => c.metodo === 'insert')).toBe(false);
  });

  it('não oferece edição quando a amostra já foi liberada', async () => {
    mocks.statusColeta = 'liberado';
    renderizar();
    expect(await screen.findByText('Hemoglobina')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar resultado Hemoglobina' })).not.toBeInTheDocument();
  });
});
