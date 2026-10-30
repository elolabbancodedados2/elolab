import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getUser: vi.fn(),
  auditAccess: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.from,
    storage: { from: mocks.storageFrom },
    auth: { getUser: mocks.getUser },
  },
}));
vi.mock('@/lib/prontuarioAudit', () => ({ registrarAcessoProntuario: mocks.auditAccess }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-1', roles: ['medico'] } }) }));
vi.mock('@/hooks/useCurrentMedico', () => ({ useCurrentMedico: () => ({ medicoId: 'medico-1', currentMedico: { nome: 'Dra. QA' }, isLoading: false, error: null }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import NovoAnexoProntuarioPage from '@/pages/NovoAnexoProntuarioPage';

const context = {
  id: 'prontuario-1',
  paciente_id: 'paciente-1',
  medico_id: 'medico-1',
  data: '2026-10-29',
  assinado: false,
  pacientes: { nome: 'Ana QA', nome_social: null },
  medicos: { nome: 'Dra. QA', crm: '12345' },
};

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}{location.search}</output>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/prontuarios/:prontuarioId/anexos/novo', element: <NovoAnexoProntuarioPage /> },
    { path: '/prontuarios', element: <CurrentLocation /> },
  ], { initialEntries: [`/prontuarios/${context.id}/anexos/novo?paciente=${context.paciente_id}`] });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('NovoAnexoProntuarioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditAccess.mockResolvedValue('audit-1');
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: context, error: null });
    mocks.from.mockImplementation((table: string) => table === 'prontuarios'
      ? { select: mocks.select }
      : { insert: mocks.insert });
    mocks.storageFrom.mockReturnValue({ upload: mocks.upload, remove: mocks.remove });
    mocks.upload.mockImplementation(async (path: string) => ({ data: { path }, error: null }));
    mocks.remove.mockResolvedValue({ error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('mostra o formulário em página própria, sem diálogo', async () => {
    renderPage();

    expect(await screen.findByText('Ana QA')).toBeVisible();
    expect(screen.getByLabelText('Arquivo *')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.auditAccess).toHaveBeenCalledWith('prontuario-1', 'visualizacao');
  });

  it('remove o arquivo temporário quando o registro de metadados falha e mantém o formulário preenchido', async () => {
    mocks.insert.mockResolvedValue({ error: new Error('Falha sintética no banco') });
    renderPage();
    const file = new File(['laudo sintético'], 'resultado.pdf', { type: 'application/pdf' });
    fireEvent.change(await screen.findByLabelText('Arquivo *'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: 'Documento sintético para QA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar anexo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha sintética no banco');
    expect(screen.getByLabelText('Arquivo *')).toHaveProperty('files.0.name', 'resultado.pdf');
    expect(screen.getByLabelText(/Descrição/)).toHaveValue('Documento sintético para QA');
    expect(mocks.auditAccess).toHaveBeenNthCalledWith(2, 'prontuario-1', 'edicao', 'Inclusão de anexo ao prontuário');
    expect(mocks.remove).toHaveBeenCalledWith([expect.stringMatching(/^prontuario-1\//)]);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('valida o tipo de arquivo antes de enviar ao servidor', async () => {
    renderPage();
    const file = new File(['texto'], 'notas.txt', { type: 'text/plain' });
    fireEvent.change(await screen.findByLabelText('Arquivo *'), { target: { files: [file] } });

    expect(screen.getByRole('alert')).toHaveTextContent('Selecione uma imagem JPEG, PNG, GIF, WebP ou um PDF.');
    expect(screen.getByRole('button', { name: 'Adicionar anexo' })).toBeDisabled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('bloqueia novos anexos em uma evolução assinada', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...context, assinado: true }, error: null });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta evolução não aceita novos anexos');
    expect(screen.queryByLabelText('Arquivo *')).not.toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.auditAccess).toHaveBeenCalledOnce();
  });

  it('retorna à mesma ficha e aba depois de adicionar o anexo', async () => {
    renderPage();
    const file = new File(['laudo sintético'], 'resultado.pdf', { type: 'application/pdf' });
    fireEvent.change(await screen.findByLabelText('Arquivo *'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar anexo' }));

    await waitFor(() => expect(screen.getByTestId('current-location')).toHaveTextContent('/prontuarios?paciente=paciente-1&prontuario=prontuario-1&secao=anexos'));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      prontuario_id: 'prontuario-1',
      paciente_id: 'paciente-1',
      nome_arquivo: 'resultado.pdf',
      tipo_arquivo: 'application/pdf',
      categoria: 'documento',
      uploaded_by: 'user-1',
    }));
    expect(mocks.toastSuccess).toHaveBeenCalledOnce();
  });
});
