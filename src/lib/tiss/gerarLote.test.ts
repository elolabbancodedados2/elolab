import { describe, expect, it } from 'vitest';
import { hashLoteTiss, gerarXmlLoteTiss, type LoteTiss } from './index';

const lote: LoteTiss = {
  lote: { numero_lote: 'L&1', competencia: '2026-09-01', versao_tiss: '04.01.00', convenio_id: 'c1', quantidade_guias: 1, valor_apresentado: 125.5 },
  registro_ans: '123456',
  guias: [
    { id: 'g1', numero_guia: 'G<1', numero_carteira: 'C&1', paciente_id: 'p1', autorizacao_id: null, data_atendimento: '2026-09-10', codigo_procedimento: '12345678', tipo_servico: 'consulta', tipo_guia: 'consulta', quantidade: 1, valor_total: 125.5 },
    { id: 'g2', numero_guia: 'G2', numero_carteira: 'C2', paciente_id: 'p2', autorizacao_id: 'a2', data_atendimento: '2026-09-11', codigo_procedimento: '87654321', tipo_servico: 'exame', tipo_guia: 'sp_sadt', quantidade: 1, valor_total: 20 },
  ],
};

describe('gerador de lote TISS', () => {
  it('escapa valores XML preservando os dados do lote e das guias', () => {
    const xml = gerarXmlLoteTiss(lote);
    expect(xml).toContain('L&amp;1');
    expect(xml).toContain('G&lt;1');
    expect(xml).toContain('C&amp;1');
    expect(xml).toContain('<codigoProcedimento>12345678</codigoProcedimento>');
    expect(xml).toContain('<guia tipo="consulta">');
    expect(xml).toContain('<guia tipo="sp_sadt">');
  });

  it('gera hash SHA-256 estável para o conteúdo do lote', async () => {
    expect(await hashLoteTiss(lote)).toBe(await hashLoteTiss(lote));
    expect(await hashLoteTiss(lote)).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashLoteTiss({ ...lote, lote: { ...lote.lote, numero_lote: 'L2' } })).not.toBe(await hashLoteTiss(lote));
  });
});
