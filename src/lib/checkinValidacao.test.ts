import { describe, expect, it } from 'vitest';
import { primeiraFalhaCheckin, validarCheckin } from './checkinValidacao';

const HOJE = '2026-10-24';
const base = {
  agendamento: { id: 'ag-1', paciente_id: 'pac-1', clinica_id: 'cli-1', data: HOJE, status: 'confirmado' },
  paciente: { id: 'pac-1', clinica_id: 'cli-1', ativo: true },
  clinicaId: 'cli-1',
  hoje: HOJE,
};

describe('validação do check-in', () => {
  it('aprova paciente, compromisso e unidade coerentes', () => {
    const itens = validarCheckin(base);
    expect(itens.map((item) => [item.id, item.ok])).toEqual([
      ['paciente', true], ['compromisso', true], ['unidade', true],
    ]);
    expect(primeiraFalhaCheckin(itens)).toBeNull();
  });

  it('recusa paciente inativo ou de outro cadastro', () => {
    expect(primeiraFalhaCheckin(validarCheckin({ ...base, paciente: { ...base.paciente, ativo: false } })))
      .toBe('Paciente inativo. Reative o cadastro antes do check-in.');
    expect(primeiraFalhaCheckin(validarCheckin({ ...base, paciente: { ...base.paciente, id: 'outro' } })))
      .toBe('O paciente não corresponde ao agendamento.');
    expect(primeiraFalhaCheckin(validarCheckin({ ...base, paciente: null })))
      .toBe('Cadastro do paciente não carregado.');
  });

  it('recusa compromisso de outro dia ou encerrado', () => {
    expect(primeiraFalhaCheckin(validarCheckin({ ...base, agendamento: { ...base.agendamento, data: '2026-10-23' } })))
      .toBe('O agendamento não é de hoje.');
    expect(primeiraFalhaCheckin(validarCheckin({ ...base, agendamento: { ...base.agendamento, status: 'cancelado' } })))
      .toBe('O agendamento está cancelado e não aceita check-in.');
    expect(primeiraFalhaCheckin(validarCheckin({ ...base, agendamento: { ...base.agendamento, status: 'em_atendimento' } })))
      .toBe('O atendimento já foi iniciado.');
  });

  it('recusa unidade divergente ou não identificada', () => {
    expect(primeiraFalhaCheckin(validarCheckin({ ...base, agendamento: { ...base.agendamento, clinica_id: 'cli-2' } })))
      .toBe('O agendamento pertence a outra unidade.');
    expect(primeiraFalhaCheckin(validarCheckin({ ...base, paciente: { ...base.paciente, clinica_id: 'cli-2' } })))
      .toBe('O paciente pertence a outra unidade.');
    expect(primeiraFalhaCheckin(validarCheckin({ ...base, clinicaId: null })))
      .toBe('Unidade da sessão não identificada. Atualize o perfil.');
  });
});
