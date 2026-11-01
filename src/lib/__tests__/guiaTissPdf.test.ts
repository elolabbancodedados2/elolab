import { describe, expect, it } from 'vitest';
import { camposGuiaTiss, modeloDaGuia } from '@/lib/guiaTissPdf';

const lote = { numero_lote: '000042', competencia: '2026-10-01', versao_tiss: '4.01.00', convenios: { nome: 'Saúde Mais', registro_ans: '123456' } };
const guia = { numero_guia: 'G1', numero_carteira: '999', data_atendimento: '2026-10-15', codigo_procedimento: '10101012', tipo_servico: 'consulta', quantidade: 1, valor_total: 150 };

describe('guiaTissPdf', () => {
  it('escolhe o modelo pela natureza do serviço', () => {
    expect(modeloDaGuia('consulta')).toBe('consulta');
    expect(modeloDaGuia('exame')).toBe('sp_sadt');
    expect(modeloDaGuia('terapia')).toBe('sp_sadt');
  });

  it('monta os campos da guia com datas e valores em pt-BR', () => {
    const { titulo, campos } = camposGuiaTiss(guia, lote, { numero_autorizacao: 'A-1', paciente_nome: 'Ana' });
    expect(titulo).toBe('Guia de consulta');
    const valor = (rotulo: string) => campos.find(c => c.rotulo === rotulo)?.valor;
    expect(valor('Registro ANS')).toBe('123456');
    expect(valor('Data do atendimento')).toBe('15/10/2026');
    expect(valor('Lote')).toBe('000042 · competência 10/2026');
    expect(valor('Beneficiário')).toBe('Ana');
    expect(valor('Valor total')).toMatch(/150,00/);
  });

  it('usa a guia SP/SADT para exames', () => {
    expect(camposGuiaTiss({ ...guia, tipo_servico: 'exame' }, lote).titulo).toBe('Guia de SP/SADT');
  });
});
