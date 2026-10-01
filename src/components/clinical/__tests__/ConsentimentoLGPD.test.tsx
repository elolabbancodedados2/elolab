import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { ConsentimentoLGPD } from '@/components/clinical/ConsentimentoLGPD';

const consentimentoAceito = {
  id: 'consent-1',
  tipo_consentimento: 'tratamento_dados',
  versao_termo: '1.0',
  aceito: true,
  data_aceite: '2026-01-01T12:00:00Z',
  revogado: false,
  data_revogacao: null,
  motivo_revogacao: null,
};

describe('ConsentimentoLGPD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ insert: mocks.insert, update: mocks.update });
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single, maybeSingle: mocks.maybeSingle });
    mocks.single.mockResolvedValue({ data: { id: 'consent-new' }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'consent-1' }, error: null });
  });

  it('não confirma o aceite se o banco devolver erro', async () => {
    const atualizado = vi.fn();
    mocks.single.mockResolvedValue({ data: null, error: new Error('RLS negou a gravação') });
    render(<ConsentimentoLGPD pacienteId="pac-1" pacienteNome="Ana" consentimentos={[]} onConsentimentoRegistrado={atualizado} />);

    fireEvent.click(screen.getByRole('button', { name: 'Novo Consentimento' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Compartilhamento com Convênio/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Consentimento' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Erro',
      description: 'Não foi possível registrar o consentimento. Nenhum aceite foi confirmado.',
      variant: 'destructive',
    })));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Consentimento registrado' }));
    expect(atualizado).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Termo de Consentimento LGPD' })).toBeVisible();
  });

  it('confirma e atualiza a lista somente depois de gravar o aceite', async () => {
    const atualizado = vi.fn();
    render(<ConsentimentoLGPD pacienteId="pac-1" pacienteNome="Ana" consentimentos={[]} onConsentimentoRegistrado={atualizado} />);

    fireEvent.click(screen.getByRole('button', { name: 'Novo Consentimento' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Compartilhamento com Convênio/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Consentimento' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Consentimento registrado' })));
    expect(atualizado).toHaveBeenCalledOnce();
    expect(screen.queryByRole('heading', { name: 'Termo de Consentimento LGPD' })).not.toBeInTheDocument();
  });

  it('não confirma revogação se a atualização falhar', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error('Falha de rede') });
    render(<ConsentimentoLGPD pacienteId="pac-1" pacienteNome="Ana" consentimentos={[consentimentoAceito]} onConsentimentoRegistrado={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revogar' }));
    fireEvent.change(screen.getByPlaceholderText('Motivo da revogação...'), { target: { value: 'Solicitação do paciente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Revogação' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Erro',
      description: 'Não foi possível revogar o consentimento.',
      variant: 'destructive',
    })));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Consentimento revogado' }));
    expect(screen.getByRole('heading', { name: 'Revogar Consentimento' })).toBeVisible();
  });
});
