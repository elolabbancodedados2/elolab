import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('@/lib/avisos', () => ({ avisar: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks }));

import { DigitalSignature } from '@/components/clinical/DigitalSignature';

describe('clinical signature page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('opens the contextual review without a dialog', () => {
    const onOpenReview = vi.fn();
    render(
      <DigitalSignature
        documentId="record-12345678"
        documentType="prontuario"
        signerName="Dr. Example"
        onOpenReview={onOpenReview}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Assinatura/ }));

    expect(onOpenReview).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls the existing signing RPC and returns after success', async () => {
    const signature = {
      signedAt: '2026-10-30T12:00:00.000Z',
      signerName: 'Dr. Example',
      signerCRM: '12345',
      hash: 'abcdef1234567890',
      method: 'eletronica_simples',
      verificationCode: 'qa-code',
    };
    const onSigned = vi.fn();
    const onCloseReview = vi.fn();
    mocks.rpc.mockResolvedValue({ data: signature, error: null });

    render(
      <DigitalSignature
        documentId="record-12345678"
        documentType="prontuario"
        signerName="Dr. Example"
        fullPage
        onSigned={onSigned}
        onCloseReview={onCloseReview}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Assinar e fechar/ }));

    await waitFor(() => expect(onSigned).toHaveBeenCalledWith(signature));
    expect(mocks.rpc).toHaveBeenCalledWith('assinar_prontuario_verificavel', { p_prontuario_id: 'record-12345678' });
    expect(onCloseReview).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the page open and shows a recoverable error if signing fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Network failure' } });

    render(
      <DigitalSignature
        documentId="record-12345678"
        documentType="prontuario"
        signerName="Dr. Example"
        fullPage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Assinar e fechar/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network failure');
    expect(screen.getByTestId('clinical-signature-page')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
