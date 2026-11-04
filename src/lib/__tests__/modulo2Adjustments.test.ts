import { describe, expect, it } from 'vitest';
import { clinicalSummaryContext } from '../../../supabase/functions/_shared/clinicalSummaryContext';
import { calcularIMC } from '../vitalSigns';
import { proximoDaFilaDoMedico } from '../filaChamada';

describe('ajustes do módulo 2', () => {
  it('envia idade e sexo, sem nome ou nascimento mesmo repetidos no texto clínico', () => {
    const context = clinicalSummaryContext({ nome: 'Pessoa Teste', data_nascimento: '2000-11-04', sexo: 'F', alergias: ['penicilina'] }, { consultas: [{ conduta: 'Pessoa Teste, nascimento 04/11/2000 e 2000-11-04' }] }, new Date('2026-11-03T12:00:00Z'));
    expect(context.paciente).toEqual({ idade: 25, sexo: 'F' });
    expect(JSON.stringify(context)).not.toMatch(/Pessoa Teste|2000-11-04|04\/11\/2000/);
    expect(context.alergias).toEqual(['penicilina']);
  });
  it.each([['70', '170', 24.2], ['70', '1,70', 24.2], ['', '170', null], ['70abc', '170', null], ['-1', '170', null]])('IMC compartilhado: %s/%s', (p, a, expected) => {
    expect(calcularIMC(p as string, a as string)).toBe(expected);
  });
  it('chama somente o próximo aguardando do médico no dia, por prioridade e posição', () => {
    const base = { medico_id: 'm1', data: '2026-11-03' };
    const rows = [
      { id: 'outro', status: 'aguardando', prioridade: 'urgente', posicao: 1, agendamentos: { ...base, medico_id: 'm2' } },
      { id: 'antigo', status: 'aguardando', prioridade: 'urgente', posicao: 2, agendamentos: { ...base, data: '2026-11-02' } },
      { id: 'normal', status: 'aguardando', prioridade: 'normal', posicao: 3, agendamentos: base },
      { id: 'chamado', status: 'chamado', prioridade: 'urgente', posicao: 4, agendamentos: base },
      { id: 'proximo', status: 'aguardando', prioridade: 'urgente', posicao: 5, agendamentos: base },
    ];
    expect(proximoDaFilaDoMedico(rows, 'm1', '2026-11-03')?.id).toBe('proximo');
    expect(proximoDaFilaDoMedico(rows, 'ausente', '2026-11-03')).toBeNull();
  });
});
