import { describe, expect, it } from 'vitest';
import { bloqueiaEnvio, validarLoteTiss, type GuiaLote } from '../tissLoteValidacao';

const lote = { numero_lote: '123', competencia: '2026-09-01', versao_tiss: '04.01.00', convenio_id: 'c1', quantidade_guias: 2, valor_apresentado: 0.3 };
const guia = (extra: Partial<GuiaLote>): GuiaLote => ({
  id: 'g1', numero_guia: 'G-1', numero_carteira: '0001', paciente_id: 'p1', autorizacao_id: null,
  data_atendimento: '2026-09-10', codigo_procedimento: '10101012', tipo_servico: 'consulta', quantidade: 1, valor_total: 0.1, ...extra,
});
const base = { lote, registroAns: '123456', autorizacoes: [], hoje: '2026-10-24' };

describe('validação do lote TISS', () => {
  it('aceita lote consistente sem pendências', () => {
    const r = validarLoteTiss({ ...base, guias: [guia({}), guia({ id: 'g2', numero_guia: 'G-2', valor_total: 0.2 })] });
    expect(r).toEqual([]);
    expect(bloqueiaEnvio(r)).toBe(false);
  });

  it('aponta campos do cabeçalho e totais divergentes do lote', () => {
    const r = validarLoteTiss({
      ...base,
      lote: { ...lote, numero_lote: '1234567890123', versao_tiss: '4.1' },
      registroAns: '12',
      guias: [guia({})],
    });
    expect(r.map(p => [p.numeroGuia, p.campo, p.gravidade])).toEqual([
      [null, 'registro_ans', 'erro'],
      [null, 'versao_tiss', 'erro'],
      [null, 'numero_lote', 'erro'],
      [null, 'quantidade_guias', 'erro'],
      [null, 'valor_apresentado', 'erro'],
    ]);
    expect(r[4].mensagem).toBe('Valor apresentado (R$ 0,30) difere da soma das guias (R$ 0,10).');
  });

  it('aponta cada guia e campo inválido', () => {
    const r = validarLoteTiss({
      ...base,
      lote: { ...lote, valor_apresentado: 0.2 },
      guias: [
        guia({ numero_carteira: ' ', codigo_procedimento: '1010', data_atendimento: '2026-10-02' }),
        guia({ id: 'g2', numero_guia: 'G-1', valor_total: 0.1 }),
      ],
    });
    expect(r.map(p => [p.numeroGuia, p.campo])).toEqual([
      ['G-1', 'numero_carteira'],
      ['G-1', 'codigo_procedimento'],
      ['G-1', 'data_atendimento'],
      ['G-1', 'numero_guia'],
    ]);
    expect(r.find(p => p.campo === 'numero_guia')?.guiaId).toBe('g2');
  });

  it('avisa quando o lote não tem guias detalhadas, sem bloquear', () => {
    const r = validarLoteTiss({ ...base, guias: [] });
    expect(r).toEqual([expect.objectContaining({ campo: 'guias', gravidade: 'aviso' })]);
    expect(bloqueiaEnvio(r)).toBe(false);
  });
});

describe('divergência entre autorizado e faturado', () => {
  const autorizacao = { id: 'a1', status: 'autorizada', convenio_id: 'c1', paciente_id: 'p1', tipo_servico: 'consulta', data_expiracao: '2026-09-30', numero_autorizacao: 'AUT-9' };

  it('detecta autorização não aprovada, de outro convênio/paciente, outro serviço ou vencida', () => {
    const r = validarLoteTiss({
      ...base,
      lote: { ...lote, quantidade_guias: 1, valor_apresentado: 0.1 },
      autorizacoes: [{ ...autorizacao, status: 'pendente', convenio_id: 'c2', paciente_id: 'p9', tipo_servico: 'exame', data_expiracao: '2026-09-05' }],
      guias: [guia({ autorizacao_id: 'a1' })],
    });
    expect(r.every(p => p.tipo === 'autorizacao' && p.gravidade === 'erro')).toBe(true);
    expect(r.map(p => p.campo)).toEqual(['autorizacao_status', 'autorizacao_convenio', 'paciente_id', 'tipo_servico', 'data_atendimento']);
    expect(r[3].mensagem).toBe('Guia faturada como consulta, mas a autorização AUT-9 é para exame.');
    expect(bloqueiaEnvio(r)).toBe(true);
  });

  it('acusa autorização inexistente e avisa guia sem autorização fora de consulta', () => {
    const r = validarLoteTiss({
      ...base,
      guias: [guia({ autorizacao_id: 'sumiu' }), guia({ id: 'g2', numero_guia: 'G-2', tipo_servico: 'exame', valor_total: 0.2 })],
    });
    expect(r.map(p => [p.numeroGuia, p.campo, p.gravidade])).toEqual([
      ['G-1', 'autorizacao_id', 'erro'],
      ['G-2', 'autorizacao_id', 'aviso'],
    ]);
  });
});
