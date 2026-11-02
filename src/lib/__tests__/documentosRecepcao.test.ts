import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { linhasEtiqueta, textoDeclaracaoComparecimento } from '@/lib/documentosRecepcao';

describe('declaração de comparecimento', () => {
  it('usa o nome social com o civil entre parênteses e o período', () => {
    const texto = textoDeclaracaoComparecimento({
      nomeCivil: 'João da Silva', nomeSocial: 'Joana da Silva', data: '2026-11-01',
      horaChegada: '08:10', horaSaida: '09:05', clinicaNome: 'Clínica Elo', profissional: 'Dra. Ana',
    });
    expect(texto).toContain('Joana da Silva (nome civil: João da Silva)');
    expect(texto).toContain('em Clínica Elo');
    expect(texto).toContain('01 de novembro de 2026');
    expect(texto).toContain('das 08:10 às 09:05');
    expect(texto).toContain('com Dra. Ana');
  });

  it('funciona só com o nome civil e sem horários', () => {
    const texto = textoDeclaracaoComparecimento({ nomeCivil: 'Maria Souza', data: '2026-11-01' });
    expect(texto).toBe('Declaramos, para os devidos fins, que Maria Souza esteve presente nesta unidade no dia 01 de novembro de 2026, para atendimento de saúde.');
  });
});

describe('etiqueta térmica', () => {
  it('monta nome, nascimento com idade, convênio e carteirinha', () => {
    expect(linhasEtiqueta({
      nome: 'Maria Souza', dataNascimento: '1990-05-10', convenio: 'Unimed', carteirinha: '123',
      hoje: new Date(2026, 10, 1),
    })).toEqual(['Maria Souza', 'Nasc. 10/05/1990 · 36 anos', 'Convênio: Unimed', 'Cart.: 123']);
  });

  it('corta nomes longos e marca particular sem convênio', () => {
    const linhas = linhasEtiqueta({ nome: 'Maria Aparecida dos Santos Oliveira Pereira' });
    expect(linhas[0]).toHaveLength(28);
    expect(linhas[0].endsWith('…')).toBe(true);
    expect(linhas[1]).toBe('Particular');
  });
});
