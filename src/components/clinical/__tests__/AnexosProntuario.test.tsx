import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
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
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { AnexosProntuario } from '@/components/clinical/AnexosProntuario';

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
    mocks.from.mockReturnValue({ insert: mocks.insert, delete: mocks.delete });
    mocks.delete.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });
    mocks.upload.mockResolvedValue({ data: { path: 'prontuario-1/arquivo.pdf' }, error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('remove o arquivo do Storage se não conseguir salvar os metadados', async () => {
    const adicionado = vi.fn();
    mocks.insert.mockResolvedValue({ error: new Error('Falha no banco') });
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[]} onAnexoAdicionado={adicionado} onAnexoRemovido={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Anexo' }));
    const arquivo = new File(['laudo clínico'], 'resultado.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Arquivo *'), { target: { files: [arquivo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro no upload' })));
    expect(mocks.remove).toHaveBeenCalledWith(['prontuario-1/arquivo.pdf']);
    expect(adicionado).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Arquivo enviado' }));
  });

  it('mantém o registro do anexo se o Storage falhar ao excluí-lo', async () => {
    const removido = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.remove.mockResolvedValue({ error: new Error('Storage indisponível') });
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[anexo]} onAnexoAdicionado={vi.fn()} onAnexoRemovido={removido} />);

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
    render(<AnexosProntuario prontuarioId="prontuario-1" pacienteId="paciente-1" anexos={[anexo]} onAnexoAdicionado={vi.fn()} onAnexoRemovido={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Baixar anexo resultado.pdf' }));

    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    expect(aba.opener).toBeNull();
    expect(navegar).not.toHaveBeenCalled();
    resolver({ data: { signedUrl: 'https://storage.example/signed-file' }, error: null });

    await waitFor(() => expect(navegar).toHaveBeenCalledWith('https://storage.example/signed-file'));
    abrir.mockRestore();
  });
});
