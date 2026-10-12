import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { rpc, toast } = vi.hoisted(() => ({
  rpc: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/components/patients/PacienteCombobox', () => ({
  PacienteCombobox: ({ onChange, disabled }: { onChange: (id: string, paciente: { id: string; nome: string; nome_social: null; telefone: string | null }) => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => onChange('patient-1', { id: 'patient-1', nome: 'Ana Souza', nome_social: null, telefone: '11999999999' })}>Selecionar Ana Souza</button>
  ),
}));

import PortalPacientesClinica from '@/pages/PortalPacientesClinica';

describe('Acesso ao Portal do Paciente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gera e mostra um link individual no domínio atual', async () => {
    rpc.mockResolvedValue({ data: 'https://app.elolab.com.br/portal-paciente?token=token-seguro', error: null });
    render(<PortalPacientesClinica />);

    expect(screen.getByRole('heading', { name: 'Como funciona' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Ana Souza' }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar link de acesso/ }));

    const link = await screen.findByLabelText('Link individual do portal');
    expect(link).toHaveValue(`${window.location.origin}/portal-paciente?token=token-seguro`);
    expect(rpc).toHaveBeenCalledWith('link_portal_paciente', { p_paciente_id: 'patient-1' });
    expect(toast.success).toHaveBeenCalledWith('Link de acesso gerado para este paciente.');
  });

  it('rejeita uma URL inesperada retornada pela RPC', async () => {
    rpc.mockResolvedValue({ data: 'https://evil.example/phishing?token=token-seguro', error: null });
    render(<PortalPacientesClinica />);

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Ana Souza' }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar link de acesso/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Não foi possível gerar o link do portal.',
      { description: 'O link retornado está incompleto.' },
    ));
    expect(screen.queryByLabelText('Link individual do portal')).not.toBeInTheDocument();
  });

  it('impede trocar o paciente enquanto o link está sendo gerado', async () => {
    rpc.mockReturnValue(new Promise(() => {}));
    render(<PortalPacientesClinica />);

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Ana Souza' }));
    fireEvent.click(screen.getByRole('button', { name: /Gerar link de acesso/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Selecionar Ana Souza' })).toBeDisabled());
  });
});
