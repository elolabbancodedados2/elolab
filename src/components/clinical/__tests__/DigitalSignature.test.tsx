import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { DigitalSignature } from '@/components/clinical/DigitalSignature';

describe('signature safety', () => {
  it('blocks signing and explains why while there are unsaved changes', () => {
    render(
      <DigitalSignature
        documentId="record-12345678"
        documentType="prontuario"
        signerName="Dr. Test"
        disabledReason="Save changes before signing."
      />,
    );

    expect(screen.getByRole('button', { name: /Assinatura eletr/i })).toBeDisabled();
    expect(screen.getByText('Save changes before signing.')).toBeVisible();
  });
});

describe('descrição da assinatura do prontuário', () => {
  beforeEach(() => vi.clearAllMocks());

  it('identifica o registro como eletrônico simples sem afirmar assinatura digital', () => {
    render(
      <DigitalSignature
        documentId="record-12345678"
        documentType="prontuario"
        signerName="Dra. Ana Costa"
        signerCRM="CRM-SP 12345"
        alreadySigned
      />,
    );

    expect(screen.getByText('Assinado eletronicamente')).toBeInTheDocument();
    expect(screen.queryByText('Assinado digitalmente')).not.toBeInTheDocument();
  });

  it('explica que a assinatura do app não usa certificado ICP-Brasil', () => {
    render(
      <DigitalSignature
        documentId="record-12345678"
        documentType="prontuario"
        signerName="Dra. Ana Costa"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Assinatura eletrônica' }));
    expect(screen.getByText(/exigem certificado ICP-Brasil/i)).toBeInTheDocument();
    expect(screen.getByText(/prescrição Memed/i)).toBeInTheDocument();
  });
});
