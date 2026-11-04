import { describe, expect, it } from 'vitest';
import { buildReceitaPdf } from '../receitaPdf';

describe('receituário único', () => {
  it.each([
    ['simples', 'RECEITUÁRIO MÉDICO', 1],
    ['controle_especial', 'RECEITUÁRIO DE CONTROLE ESPECIAL', 2],
    ['antimicrobiano', 'RECEITUÁRIO DE ANTIMICROBIANO', 2],
  ] as const)('gera texto e vias do tipo %s', async (tipo, titulo, paginas) => {
    const pdf = await buildReceitaPdf({ tipo, pacienteNome: 'Pessoa Teste', cpf: '', pacienteEndereco: 'Rua Exemplo, 42', dataEmissao: '03/11/2026', medicoNome: 'Dra. Teste', crm: '12345', especialidade: '', medicamentosTexto: 'Medicamento 10 mg\nTomar pela manhã' });
    const text = pdf.output();
    expect(pdf.getNumberOfPages()).toBe(paginas);
    expect(text).toContain(titulo);
    expect(text).toContain('Medicamento 10 mg');
    if (tipo === 'controle_especial') expect(text.match(/Rua Exemplo, 42/g)).toHaveLength(2);
  });
});
