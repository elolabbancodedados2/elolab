import { describe, expect, it } from 'vitest';
import { classificarAutorizacoes, montarRespostaAutorizacao } from '@/lib/autorizacaoConvenio';

const hoje = '2026-11-01';

describe('montarRespostaAutorizacao', () => {
  it('exige senha na autorização e grava a validade', () => {
    expect(montarRespostaAutorizacao({ decisao: 'autorizada', senha: ' ', validade: '', observacao: '', hoje }).erro).toMatch(/senha/);
    const { payload } = montarRespostaAutorizacao({ decisao: 'autorizada', senha: ' ABC123 ', validade: '2026-11-30', observacao: '', hoje }, '2026-11-01T12:00:00.000Z');
    expect(payload).toEqual({ status: 'autorizada', numero_autorizacao: 'ABC123', data_autorizacao: '2026-11-01T12:00:00.000Z', data_expiracao: '2026-11-30', observacoes: null });
  });

  it('recusa validade no passado', () => {
    expect(montarRespostaAutorizacao({ decisao: 'autorizada', senha: 'X1', validade: '2026-10-31', observacao: '', hoje }).erro).toMatch(/validade/);
  });

  it('exige o motivo da negativa', () => {
    expect(montarRespostaAutorizacao({ decisao: 'negada', senha: '', validade: '', observacao: 'não', hoje }).erro).toMatch(/motivo/);
    expect(montarRespostaAutorizacao({ decisao: 'negada', senha: '', validade: '2026-12-01', observacao: 'Fora da cobertura', hoje }).payload)
      .toMatchObject({ status: 'negada', data_expiracao: null, observacoes: 'Fora da cobertura' });
  });
});

describe('classificarAutorizacoes', () => {
  it('separa pendentes, vencendo, vencidas e negadas', () => {
    const fila = classificarAutorizacoes([
      { id: 'p', status: 'pendente', data_expiracao: null },
      { id: 'v', status: 'autorizada', data_expiracao: '2026-11-05' },
      { id: 'longe', status: 'autorizada', data_expiracao: '2026-12-30' },
      { id: 'x', status: 'autorizada', data_expiracao: '2026-10-30' },
      { id: 'n', status: 'negada', data_expiracao: null },
    ], hoje);
    expect(fila.pendentes.map(i => i.id)).toEqual(['p']);
    expect(fila.vencendo.map(i => i.id)).toEqual(['v']);
    expect(fila.vencidas.map(i => i.id)).toEqual(['x']);
    expect(fila.negadas.map(i => i.id)).toEqual(['n']);
  });
});
