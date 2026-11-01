import { describe, expect, it } from 'vitest';
import { extrairCidadeUf, linhaCrmMedico, linhaLocalEData } from '@/lib/documentoEmissao';

describe('extrairCidadeUf', () => {
  it('lê a cidade e a UF do endereço da clínica', () => {
    expect(extrairCidadeUf('Rua das Flores, 100, Centro, Campinas - SP, 13010-000')).toEqual({ cidade: 'Campinas', uf: 'SP' });
    expect(extrairCidadeUf('Av. Brasil, 50 — São José dos Campos/SP')).toEqual({ cidade: 'São José dos Campos', uf: 'SP' });
  });
  it('não chuta sem padrão reconhecível', () => {
    expect(extrairCidadeUf('Rua sem cidade, 10')).toBeNull();
    expect(extrairCidadeUf('')).toBeNull();
  });
});

describe('linhaLocalEData', () => {
  it('usa a cidade configurada e a data de emissão', () => {
    expect(linhaLocalEData('2026-03-03', { cidade: 'Recife', uf: 'pe' })).toBe('Recife/PE, 3 de março de 2026.');
  });
  it('cai para o endereço e, sem cidade, mostra só a data', () => {
    expect(linhaLocalEData('2026-03-03', { endereco: 'Rua A, 1, Natal - RN' })).toBe('Natal/RN, 3 de março de 2026.');
    expect(linhaLocalEData('2026-03-03', {})).toBe('3 de março de 2026.');
  });
});

describe('linhaCrmMedico', () => {
  it('monta CRM com UF e omite o que falta', () => {
    expect(linhaCrmMedico({ crm: '12345', crmUf: 'sp', especialidade: 'Cardiologia' })).toBe('CRM-SP 12345 | Cardiologia');
    expect(linhaCrmMedico({ crm: '', especialidade: 'Clínica' })).toBe('Clínica');
  });
});
