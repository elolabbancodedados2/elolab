import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  it('does not enable consent actions when history could not be loaded', () => {
    render(<ConsentimentoLGPD consentimentos={[]} isError onNovoConsentimento={vi.fn()} onRevogarConsentimento={vi.fn()} />);

    expect(screen.getByText(/Não foi possível carregar o histórico/)).toBeVisible();
    expect(screen.queryByText(/consentimento obrigatório para tratamento de dados ainda não foi registrado/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo Consentimento' })).toBeDisabled();
  });

  it('opens the dedicated registration page instead of a dialog', () => {
    const onNovoConsentimento = vi.fn();
    render(<ConsentimentoLGPD consentimentos={[]} onNovoConsentimento={onNovoConsentimento} onRevogarConsentimento={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Novo Consentimento' }));

    expect(onNovoConsentimento).toHaveBeenCalledOnce();
    expect(screen.queryByRole('heading', { name: 'Termo de Consentimento LGPD' })).not.toBeInTheDocument();
  });

  it('opens the dedicated revocation page with the selected consent type', () => {
    const onRevogarConsentimento = vi.fn();
    render(<ConsentimentoLGPD consentimentos={[consentimentoAceito]} onNovoConsentimento={vi.fn()} onRevogarConsentimento={onRevogarConsentimento} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revogar' }));

    expect(onRevogarConsentimento).toHaveBeenCalledWith('tratamento_dados');
    expect(screen.queryByRole('heading', { name: 'Revogar Consentimento' })).not.toBeInTheDocument();
  });
});
