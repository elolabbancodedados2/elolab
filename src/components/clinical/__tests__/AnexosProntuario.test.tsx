import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  publicationIn: vi.fn(),
  publicationSelect: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { AnexosProntuario } from '@/components/clinical/AnexosProntuario';

describe('read-only attachments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps viewing and downloading available while disabling attachment changes', () => {
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[anexo]} readOnly onAnexoRemovido={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Adicionar Anexo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir anexo resultado.pdf' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Visualizar anexo resultado.pdf' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Baixar anexo resultado.pdf' })).toBeEnabled();
  });
});

const anexo = {
  id: 'anexo-1',
  nome_arquivo: 'resultado.pdf',
  tipo_arquivo: 'application/pdf',
  tamanho_bytes: 1200,
  url_arquivo: 'prontuario-1/arquivo.pdf',
  categoria: 'laudo',
  descricao: null,
  created_at: null,
};

describe('AnexosProntuario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageFrom.mockReturnValue({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.createSignedUrl });
    mocks.publicationSelect.mockReturnValue({ in: mocks.publicationIn });
    mocks.publicationIn.mockResolvedValue({ data: [], error: null });
    mocks.rpc.mockImplementation((name: string) => name === 'registrar_acesso_documento_clinico'
      ? Promise.resolve({ data: 'audit-id', error: null })
      : Promise.resolve({ data: { publicado: true }, error: null }));
    mocks.from.mockImplementation((table: string) => table === 'documentos_portal_paciente'
      ? { select: mocks.publicationSelect }
      : { insert: mocks.insert, delete: mocks.delete });
    mocks.delete.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });
    mocks.upload.mockResolvedValue({ data: { path: 'prontuario-1/arquivo.pdf' }, error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('encaminha a inclusão para a página própria sem abrir modal', () => {
    const navigate = vi.fn();
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[]} onAdicionarAnexo={navigate} onAnexoRemovido={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Anexo' }));

    expect(navigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mantém o registro do anexo se o Storage falhar ao excluí-lo', async () => {
    const removido = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.remove.mockResolvedValue({ error: new Error('Storage indisponível') });
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[anexo]} onAnexoRemovido={removido} />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir anexo resultado.pdf' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Erro',
      description: 'Não foi possível excluir o anexo.',
      variant: 'destructive',
    })));
    expect(confirm).toHaveBeenCalledOnce();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(removido).not.toHaveBeenCalled();
    expect(screen.getByText('resultado.pdf')).toBeVisible();
    confirm.mockRestore();
  });

  it('abre a nova aba no clique antes de aguardar o link assinado', async () => {
    let resolver!: (value: { data: { signedUrl: string }; error: null }) => void;
    mocks.createSignedUrl.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    const navegar = vi.fn();
    const aba = { opener: window, close: vi.fn(), location: { replace: navegar } } as unknown as Window;
    const abrir = vi.spyOn(window, 'open').mockReturnValue(aba);
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[anexo]} onAnexoRemovido={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Baixar anexo resultado.pdf' }));

    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    expect(aba.opener).toBeNull();
    expect(navegar).not.toHaveBeenCalled();
    resolver({ data: { signedUrl: 'https://storage.example/signed-file' }, error: null });

    await waitFor(() => expect(navegar).toHaveBeenCalledWith('https://storage.example/signed-file'));
    abrir.mockRestore();
  });

  it('registra visualização antes de mostrar o anexo', async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example/signed-file' }, error: null });
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[anexo]} onAnexoRemovido={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Visualizar anexo resultado.pdf' }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(mocks.rpc).toHaveBeenCalledWith('registrar_acesso_documento_clinico', {
      p_tipo: 'anexo_prontuario', p_documento_id: 'anexo-1', p_acao: 'visualizacao',
    });
  });

  it('não baixa o anexo se a auditoria do download falhar', async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example/signed-file' }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('Auditoria indisponível') });
    const aba = { opener: window, close: vi.fn(), location: { replace: vi.fn() } } as unknown as Window;
    const abrir = vi.spyOn(window, 'open').mockReturnValue(aba);
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[anexo]} onAnexoRemovido={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Baixar anexo resultado.pdf' }));

    await waitFor(() => expect(aba.close).toHaveBeenCalledOnce());
    expect(aba.location.replace).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Não foi possível registrar o download' }));
    abrir.mockRestore();
  });

  it('permits an authorized clinician to publish an attachment with origin and future validity', async () => {
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[anexo]} podeGerenciarPortal onAnexoRemovido={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Disponibilizar no portal para resultado.pdf' }));
    fireEvent.change(screen.getByLabelText('Validade do documento'), { target: { value: '2027-01-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar documento no portal' }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('gerenciar_documento_portal_paciente', {
      p_anexo_id: 'anexo-1',
      p_publicado: true,
      p_validade_ate: '2027-01-10',
      p_origem: 'clinica',
    }));
    expect(await screen.findByText(/Disponível no portal/)).toBeVisible();
  });

  it('revokes a published attachment through the scoped publication RPC', async () => {
    mocks.publicationIn.mockResolvedValue({
      data: [{ anexo_id: 'anexo-1', publicado: true, validade_ate: '2027-01-10', origem: 'externo' }],
      error: null,
    });
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[anexo]} podeGerenciarPortal onAnexoRemovido={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revogar documento do portal para resultado.pdf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revogação do portal' }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('gerenciar_documento_portal_paciente', {
      p_anexo_id: 'anexo-1',
      p_publicado: false,
      p_validade_ate: '2027-01-10',
      p_origem: 'externo',
    }));
  });

  it('does not show portal publication controls without explicit permission', () => {
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[anexo]} onAnexoRemovido={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /portal para resultado\.pdf/i })).not.toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalledWith('documentos_portal_paciente');
  });
});
