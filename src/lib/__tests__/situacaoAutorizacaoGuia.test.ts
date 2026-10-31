import { describe, expect, it } from 'vitest';
import { situacaoAutorizacaoGuia, type AutorizacaoValidacao, type GuiaLote } from '../tissLoteValidacao';

const guia = (extra: Partial<GuiaLote> = {}): GuiaLote => ({
  id: 'g1', numero_guia: '1001', numero_carteira: '123', paciente_id: 'p1', autorizacao_id: 'a1',
  data_atendimento: '2026-10-10', codigo_procedimento: '40301010', tipo_servico: 'exame', quantidade: 1, valor_total: 80,
  ...extra,
});
const autorizacao = (extra: Partial<AutorizacaoValidacao> = {}): AutorizacaoValidacao => ({
  id: 'a1', status: 'autorizada', convenio_id: 'c1', paciente_id: 'p1', tipo_servico: 'exame',
  data_expiracao: '2026-10-31', numero_autorizacao: 'AUT-9', ...extra,
});
const mapa = (...itens: AutorizacaoValidacao[]) => new Map(itens.map(a => [a.id, a]));

describe('situacaoAutorizacaoGuia', () => {
  it('autorizada quando bate convênio, paciente, serviço e validade', () => {
    expect(situacaoAutorizacaoGuia(guia(), 'c1', mapa(autorizacao()))).toMatchObject({ situacao: 'autorizada', numero: 'AUT-9' });
  });

  it('consulta sem autorização é dispensada; exame sem autorização não', () => {
    expect(situacaoAutorizacaoGuia(guia({ autorizacao_id: null, tipo_servico: 'consulta' }), 'c1', mapa()).situacao).toBe('dispensada');
    expect(situacaoAutorizacaoGuia(guia({ autorizacao_id: null }), 'c1', mapa()).situacao).toBe('sem_autorizacao');
  });

  it('pendente, negada e vencida', () => {
    expect(situacaoAutorizacaoGuia(guia(), 'c1', mapa(autorizacao({ status: 'pendente' }))).situacao).toBe('pendente');
    expect(situacaoAutorizacaoGuia(guia(), 'c1', mapa(autorizacao({ status: 'negada' }))).situacao).toBe('negada');
    expect(situacaoAutorizacaoGuia(guia({ data_atendimento: '2026-11-02' }), 'c1', mapa(autorizacao())).situacao).toBe('vencida');
  });

  it('divergente quando a autorização é de outro convênio, paciente ou some', () => {
    expect(situacaoAutorizacaoGuia(guia(), 'c2', mapa(autorizacao())).situacao).toBe('divergente');
    expect(situacaoAutorizacaoGuia(guia({ paciente_id: 'p2' }), 'c1', mapa(autorizacao())).situacao).toBe('divergente');
    expect(situacaoAutorizacaoGuia(guia(), 'c1', mapa()).situacao).toBe('divergente');
  });
});
