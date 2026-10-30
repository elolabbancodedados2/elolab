import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { BackupRestore } from '@/components/BackupRestore';
import { getStorageStats, previaRestauracao } from '@/lib/backup';

const backup = {
  createdAt: '2026-10-01T12:00:00.000Z',
  completo: true,
  metadata: {
    totalRecords: 3,
    tablesCount: 1,
    collectionCounts: { pacientes: 3 },
    tabelasComFalha: [],
    tabelasTruncadas: [],
  },
};

vi.mock('@/lib/backup', () => ({
  downloadBackup: vi.fn(),
  restoreBackup: vi.fn(),
  getStorageStats: vi.fn(() => Promise.resolve({ used: '1 MB', collections: {} })),
  validateBackup: vi.fn(() => ({ valid: true, backup })),
  clinicaDoBackup: vi.fn(() => null),
  previaRestauracao: vi.fn(() => Promise.resolve({ novos: 1, sobrescritos: 2, porTabela: [], puladas: [] })),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-1' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

async function abrirPrevia() {
  const { container } = render(<MemoryRouter><BackupRestore /></MemoryRouter>);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText('Pré-visualização do Backup');
  return screen.getByRole('button', { name: /Restaurar Backup/ });
}

describe('BackupRestore — confirmação da restauração', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa estilo destrutivo quando "Substituir dados existentes" está ligado', async () => {
    const botao = await abrirPrevia();

    expect(screen.getByRole('heading', { name: 'Conferir restauração' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeChecked();
    expect(botao).toHaveClass('bg-destructive');
  });

  it('mantém o estilo primário quando a substituição está desligada', async () => {
    const botao = await abrirPrevia();

    await userEvent.click(screen.getByRole('switch'));

    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(botao).not.toHaveClass('bg-destructive');
    expect(botao).toHaveClass('bg-primary');
  });

  it('bloqueia a restauração até calcular a prévia e permite tentar novamente', async () => {
    vi.mocked(previaRestauracao)
      .mockRejectedValueOnce(new Error('falha sintética'))
      .mockResolvedValueOnce({ novos: 1, sobrescritos: 2, porTabela: [], puladas: [] });

    const botao = await abrirPrevia();
    await screen.findByRole('alert');
    expect(botao).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Conferir novamente' }));
    await waitFor(() => expect(botao).toBeEnabled());
  });

  it('mostra falha de consulta do espaço sem rejeição não tratada e permite repetir', async () => {
    vi.mocked(getStorageStats).mockRejectedValueOnce(new Error('falha sintética'));
    render(<MemoryRouter><BackupRestore /></MemoryRouter>);

    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    expect(screen.getByText('Indisponível')).toBeVisible();
    vi.mocked(getStorageStats).mockResolvedValueOnce({ used: '2 MB', collections: {} });
    await userEvent.click(retry);
    await waitFor(() => expect(screen.getByText('2 MB')).toBeVisible());
  });
});
