import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resultados: {} as Record<string, unknown>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => mocks.resultados[queryKey[0]] ?? { data: undefined, isLoading: false },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: 'c1', roles: ['medico'] } }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/workflowAutomation', () => ({ autoFinalizarAtendimento: vi.fn() }));
vi.mock('@/components/UnsavedChangesGuard', () => ({ UnsavedChangesGuard: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import FinalizarAtendimento from '@/pages/FinalizarAtendimento';

const atendimento = (status: string) => ({
  data: {
    id: 'ag-1', clinica_id: 'c1', data: '2026-11-01', hora_inicio: '10:00:00', tipo: 'consulta',
    paciente_id: 'p1', medico_id: 'm1', status, pacientes: { nome: 'Ana' }, medicos: { nome: 'Dra. Júlia' },
  },
  isLoading: false,
});

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/atendimento/ag-1/finalizar']}>
      <Routes><Route path="/atendimento/:agendamentoId/finalizar" element={<FinalizarAtendimento />} /></Routes>
    </MemoryRouter>,
  );
}

describe('FinalizarAtendimento', () => {
  beforeEach(() => {
    mocks.resultados = {
      'atendimento-finalizacao': atendimento('em_atendimento'),
      'atendimento-finalizacao-fila': { data: { id: 'fila-1' }, isLoading: false },
      'atendimento-finalizacao-retorno': { data: null, isLoading: false },
      'atendimento-finalizacao-evolucao': { data: undefined, isLoading: true },
    };
  });

  it('bloqueia a confirmação enquanto a evolução é verificada', () => {
    renderizar();
    fireEvent.click(screen.getByLabelText('Sem retorno'));
    const botao = screen.getByRole('button', { name: /Verificando evolução/ });
    expect(botao).toBeDisabled();
  });

  it('libera a confirmação quando a evolução foi encontrada', () => {
    mocks.resultados['atendimento-finalizacao-evolucao'] = { data: [{ id: 'pr-1', assinado: true }], isLoading: false };
    renderizar();
    fireEvent.click(screen.getByLabelText('Sem retorno'));
    expect(screen.getByRole('button', { name: /Confirmar finalização/ })).toBeEnabled();
  });

  it('mostra o status com rótulo legível, sem o código do banco', () => {
    mocks.resultados['atendimento-finalizacao'] = atendimento('aguardando_triagem');
    renderizar();
    expect(screen.getByRole('alert')).toHaveTextContent('“Aguardando triagem”');
    expect(screen.queryByText(/aguardando_triagem/)).not.toBeInTheDocument();
  });
});
