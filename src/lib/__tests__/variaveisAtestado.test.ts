import { describe, expect, it } from 'vitest';
import { legendaVariaveisAtestado, substituirVariaveisAtestado } from '@/lib/variaveisAtestado';

describe('substituirVariaveisAtestado', () => {
  const valores = { nome_paciente: 'Ana', data_emissao: '01/11/2026', medico_nome: 'Dr. Luiz', medico_crm: '123', dias: '3' };

  it('aceita o nome principal e os sinônimos do editor de modelos', () => {
    expect(substituirVariaveisAtestado('{{paciente}} em {{data}} por {{medico}} (CRM {{crm}}), {{dias}} dias', valores))
      .toBe('Ana em 01/11/2026 por Dr. Luiz (CRM 123), 3 dias');
    expect(substituirVariaveisAtestado('{{nome_paciente}} {{ Medico_Nome }}', valores)).toBe('Ana Dr. Luiz');
  });

  it('mantém variáveis desconhecidas ou sem valor', () => {
    expect(substituirVariaveisAtestado('{{foo}} {{cid}}', valores)).toBe('{{foo}} {{cid}}');
  });

  it('lista as variáveis com sinônimos', () => {
    expect(legendaVariaveisAtestado()).toContain('{{nome_paciente}} (ou {{paciente}}, {{nome}})');
  });
});
