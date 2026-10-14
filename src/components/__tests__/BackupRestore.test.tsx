import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupRestore } from '@/components/BackupRestore';

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
  previaRestauracao: vi.fn(() => Promise.resolve({ novos: 1, sobrescritos: 2, porTabela: [] })),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: 'clinica-1' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

async function abrirPrevia() {
  const { container } = render(<BackupRestore />);
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
});
