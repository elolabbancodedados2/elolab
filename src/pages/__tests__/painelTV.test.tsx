import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  queueFails: false,
  mediaFails: false,
  admin: false,
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ isAdmin: () => mocks.admin, profile: { clinica_id: 'clinic-1' } }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.from,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

import PainelTV from '@/pages/PainelTV';

function queryResult(data: unknown, error: Error | null = null) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'gte', 'lt']) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve, reject);
  return query;
}

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function renderPainel(path = '/painel-tv') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<><PainelTV /><CurrentPath /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PainelTV', () => {
  beforeEach(() => {
    mocks.queueFails = false;
    mocks.mediaFails = false;
    mocks.admin = false;
    mocks.from.mockImplementation((table: string) => {
      if (table === 'fila_atendimento' && mocks.queueFails) return queryResult(null, new Error('Falha de conexão'));
      if (table === 'tv_panel_media' && mocks.mediaFails) return queryResult(null, new Error('Falha ao carregar'));
      return queryResult([]);
    });
    const channel = { on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockReturnValue(channel);
    mocks.channel.mockReturnValue(channel);
  });

  it('diferencia falha de conexão de uma fila vazia e permite tentar de novo', async () => {
    mocks.queueFails = true;
    renderPainel();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a fila');
    expect(screen.queryByText('Nenhum paciente aguardando')).not.toBeInTheDocument();

    mocks.queueFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.getByText('Nenhum paciente aguardando')).toBeVisible());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('não repete chamadas já anunciadas depois de recarregar o painel', async () => {
    const chamado = {
      id: 'f1', agendamento_id: 'ag1', posicao: 1, status: 'chamado', sala_id: null,
      horario_chegada: '2026-10-24T12:00:00Z', prioridade: 'normal', updated_at: '2026-10-24T12:30:00Z',
    };
    mocks.from.mockImplementation((table: string) => queryResult(table === 'fila_atendimento' ? [chamado] : []));
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, getVoices: () => [] });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    localStorage.clear();
    try {
      const primeiro = renderPainel();
      await waitFor(() => expect(speak).toHaveBeenCalled());
      primeiro.unmount();

      speak.mockClear();
      renderPainel();
      // O painel mostra a senha do atendimento, não o nome do paciente.
      expect(await screen.findAllByText(/^Senha /)).not.toHaveLength(0);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(speak).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      localStorage.clear();
    }
  });

  it('mostra fila vazia apenas depois de confirmar a consulta', async () => {
    renderPainel();

    expect(await screen.findByText('Nenhum paciente aguardando')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('abre o gerenciamento de mídias em uma tela própria e diferencia lista vazia de erro', async () => {
    mocks.admin = true;
    mocks.mediaFails = true;
    renderPainel();

    fireEvent.click(screen.getByRole('button', { name: 'Configurar mídias do painel' }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/painel-tv/midias');
    expect(await screen.findByRole('heading', { name: 'Mídias do Painel TV' })).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent('Lista indisponível');
    expect(screen.queryByText('Nenhuma mídia cadastrada')).not.toBeInTheDocument();

    mocks.mediaFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Nenhuma mídia cadastrada')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao painel' }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/painel-tv');
  });

  it('nega acesso direto ao gerenciamento de mídias para não administradores', async () => {
    renderPainel('/painel-tv/midias');

    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
    expect(screen.queryByLabelText('Arquivo de imagem ou vídeo')).not.toBeInTheDocument();
  });
});
