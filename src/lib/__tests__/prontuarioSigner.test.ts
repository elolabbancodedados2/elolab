import { describe, expect, it } from 'vitest';
import { obterIdentificacaoAssinante } from '@/lib/prontuarioSigner';

describe('identificação do assinante do prontuário', () => {
  it('exibe a identidade gravada na assinatura, não o médico atualmente vinculado', () => {
    expect(obterIdentificacaoAssinante({
      assinado: true,
      assinado_por: 'Dra. Ana Costa',
      crm_assinante: 'CRM-SP 12345',
      medicoVinculado: { nome: 'Dr. Bruno Lima', crm: 'CRM-SP 99999' },
    })).toEqual({ nome: 'Dra. Ana Costa', crm: 'CRM-SP 12345' });
  });

  it('usa o profissional vinculado enquanto o prontuário ainda está sem assinatura', () => {
    expect(obterIdentificacaoAssinante({
      assinado: false,
      assinado_por: null,
      crm_assinante: null,
      medicoVinculado: { nome: 'Dr. Bruno Lima', crm: 'CRM-SP 99999' },
    })).toEqual({ nome: 'Dr. Bruno Lima', crm: 'CRM-SP 99999' });
  });
});
