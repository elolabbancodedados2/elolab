import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUrl: vi.fn(),
  auditProntuario: vi.fn(),
  auditDocumento: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}));
vi.mock('@/lib/prontuarioAudit', () => ({ registrarAcessoProntuario: mocks.auditProntuario }));
vi.mock('@/lib/clinicalDocumentAudit', () => ({ registrarAcessoDocumentoClinico: mocks.auditDocumento }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-1', roles: ['admin'] } }) }));

import VisualizarAnexoProntuarioPage from '@/pages/VisualizarAnexoProntuarioPage';

const context = {
  id: 'prontuario-1',
  paciente_id: 'paciente-1',
  medico_id: 'medico-1',
  data: '2026-10-29',
  assinado: true,
  pacientes: { nome: 'Pessoa Exemplo', nome_social: null },
  medicos: { nome: 'Dra. Exemplo', crm: '12345' },
};
const attachment = {
  id: 'anexo-1',
  prontuario_id: 'prontuario-1',
  paciente_id: 'paciente-1',
  clinica_id: 'clinica-1',
  nome_arquivo: 'resultado.pdf',
  tipo_arquivo: 'application/pdf',
  tamanho_bytes: 1200,
  url_arquivo: 'prontuario-1/arquivo.pdf',
  categoria: 'laudo',
  descricao: 'Resultado sintético para QA.',
  created_at: '2026-10-29T12:00:00.000Z',
};

function createRecordQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}{location.search}</output>;
}

function renderPage(options: { context?: { data: unknown; error: unknown }; attachment?: { data: unknown; error: unknown }; returnTo?: string } = {}) {
  const contextQuery = createRecordQuery(options.context ?? { data: context, error: null });
  const attachmentQuery = createRecordQuery(options.attachment ?? { data: attachment, error: null });
  mocks.from.mockImplementation((table: string) => table === 'prontuarios' ? contextQuery : attachmentQuery);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/prontuarios/:prontuarioId/anexos/:anexoId/visualizar', element: <VisualizarAnexoProntuarioPage /> },
    { path: '/prontuarios', element: <CurrentLocation /> },
  ], {
    initialEntries: [{
      pathname: '/prontuarios/prontuario-1/anexos/anexo-1/visualizar',
      state: options.returnTo ? { returnTo: options.returnTo } : null,
    }],
  });
  return { ...render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>), contextQuery, attachmentQuery };
}

describe('VisualizarAnexoProntuarioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditProntuario.mockResolvedValue('audit-prontuario');
    mocks.auditDocumento.mockResolvedValue('audit-documento');
    mocks.storageFrom.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example/signed-file' }, error: null });
  });

  it('confere o escopo do prontuário, registra a visualização e mostra o PDF fora de diálogo', async () => {
    const { attachmentQuery } = renderPage({ returnTo: '/prontuarios?paciente=paciente-1&prontuario=prontuario-1&secao=anexos' });

    expect(await screen.findByTitle('Prévia do anexo resultado.pdf')).toBeVisible();
    expect(screen.getByText(/Pessoa Exemplo · resultado\.pdf/)).toBeVisible();
    expect(screen.getByText('Resultado sintético para QA.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.auditProntuario).toHaveBeenCalledWith('prontuario-1', 'visualizacao');
    expect(mocks.auditDocumento).toHaveBeenCalledWith('anexo_prontuario', 'anexo-1', 'visualizacao');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('prontuario-1/arquivo.pdf', 3600);
    expect(attachmentQuery.eq).toHaveBeenCalledWith('prontuario_id', 'prontuario-1');
    expect(attachmentQuery.eq).toHaveBeenCalledWith('paciente_id', 'paciente-1');
    expect(attachmentQuery.eq).toHaveBeenCalledWith('clinica_id', 'clinica-1');

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao prontuário' }));
    await waitFor(() => expect(screen.getByTestId('current-location')).toHaveTextContent('/prontuarios?paciente=paciente-1&prontuario=prontuario-1&secao=anexos'));
  });

  it('não gera link nem registra leitura do anexo quando ele não pertence ao prontuário informado', async () => {
    renderPage({ attachment: { data: null, error: null } });

    expect(await screen.findByRole('alert')).toHaveTextContent('O anexo não está disponível neste prontuário.');
    expect(mocks.auditDocumento).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('audita a exportação antes de abrir um novo link temporário', async () => {
    mocks.createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: 'https://storage.example/preview' }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://storage.example/download' }, error: null });
    const replace = vi.fn();
    const popup = { opener: window, close: vi.fn(), location: { replace } } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);
    renderPage();

    await screen.findByTitle('Prévia do anexo resultado.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Baixar anexo' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('https://storage.example/download'));
    expect(popup.opener).toBeNull();
    expect(mocks.auditDocumento).toHaveBeenNthCalledWith(2, 'anexo_prontuario', 'anexo-1', 'exportacao');
    open.mockRestore();
  });
});
