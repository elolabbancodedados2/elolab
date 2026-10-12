import { describe, expect, it } from 'vitest';
import { dadosAoRegistrarColeta, podeGerenciarLaboratorioPorPapel, podeRegistrarResultado, STATUS_COLETA_LABELS } from '../laboratorioWorkflow';

describe('estado da coleta para lançamento de resultados', () => {
  it('permite incluir resultados enquanto a amostra está coletada ou em análise', () => {
    expect(podeRegistrarResultado('coletado')).toBe(true);
    expect(podeRegistrarResultado('em_analise')).toBe(true);
  });

  it('impede novas linhas depois que a coleta foi encerrada', () => {
    expect(podeRegistrarResultado('pendente')).toBe(false);
    expect(podeRegistrarResultado('validado')).toBe(false);
    expect(podeRegistrarResultado('liberado')).toBe(false);
    expect(podeRegistrarResultado('cancelado')).toBe(false);
  });
});

describe('permissões e transições da worklist', () => {
  it('reserva a limpeza em lote e a gestão a admin e enfermagem', () => {
    expect(podeGerenciarLaboratorioPorPapel(['admin'])).toBe(true);
    expect(podeGerenciarLaboratorioPorPapel(['enfermagem'])).toBe(true);
    expect(podeGerenciarLaboratorioPorPapel(['medico'])).toBe(false);
    expect(podeGerenciarLaboratorioPorPapel(['recepcao'])).toBe(false);
  });

  it('registra o usuário e o instante da clínica ao iniciar uma coleta', () => {
    expect(dadosAoRegistrarColeta(new Date('2026-10-11T15:00:00.000Z'), 'user-1')).toEqual({
      data_coleta: '2026-10-11T15:00:00.000Z', coletado_por: 'user-1',
    });
  });

  it('inclui coletas rejeitadas no vocabulário de status da worklist', () => {
    expect(STATUS_COLETA_LABELS.rejeitada).toBe('Rejeitada');
  });
});
