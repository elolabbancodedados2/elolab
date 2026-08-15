import { describe, it, expect } from 'vitest';
import { converterData, cpfValido, CAMPO_POR_NOME, normalizarCabecalho } from '@/lib/importacao/campos';
import { mapearAutomaticamente, faltandoObrigatorios, pontuar } from '@/lib/importacao/mapeamento';
import { detectarSeparador, lerCsv } from '@/lib/importacao/planilha';
import { converterLinha, podeImportar, chaveDeComparacao, marcarDuplicadas, resumir } from '@/lib/importacao/linhas';
import { traduzirErro, csvDasRecusadas } from '@/lib/importacao/importar';
import { CAMPOS_PACIENTE } from '@/lib/importacao/campos';

/**
 * Migração de base é operação de uma vez só: ou o arquivo entra certo, ou a
 * clínica descobre meses depois que metade dos aniversários está um dia
 * atrasada. Estes testes cobrem os pontos onde isso acontece.
 */

describe('converterData', () => {
  it('lê o formato brasileiro', () => {
    expect(converterData('25/12/1980').valor).toBe('1980-12-25');
    expect(converterData('01/02/2020').valor).toBe('2020-02-01');
  });

  it('lê ISO', () => {
    expect(converterData('1980-12-25').valor).toBe('1980-12-25');
    expect(converterData('1980-12-25T00:00:00').valor).toBe('1980-12-25');
  });

  it('lê o número de série do Excel', () => {
    // 25/12/1980 = 29580 dias desde 30/12/1899.
    expect(converterData('29580').valor).toBe('1980-12-25');
  });

  /**
   * O bug que já custou 19 correções neste app: `new Date('25/12/1980')` em
   * UTC-3 devolve o dia anterior. A conversão é textual justamente por isso.
   */
  it('não perde um dia por fuso horário', () => {
    for (const d of ['01/01/2000', '31/12/1999', '29/02/2024']) {
      const [dia, mes, ano] = d.split('/');
      expect(converterData(d).valor).toBe(`${ano}-${mes}-${dia}`);
    }
  });

  it('resolve ano de dois dígitos para o passado quando faz sentido', () => {
    expect(converterData('15/04/85').valor).toBe('1985-04-15');
    expect(converterData('15/04/05').valor).toBe('2005-04-15');
  });

  it('recusa data impossível em vez de arredondar', () => {
    expect(converterData('31/02/2020').erro).toBeTruthy();
    expect(converterData('15/13/2020').erro).toBeTruthy();
    expect(converterData('banana').erro).toBeTruthy();
  });

  it('célula vazia não é erro', () => {
    expect(converterData('')).toEqual({ valor: null });
    expect(converterData('   ')).toEqual({ valor: null });
  });
});

describe('cpfValido', () => {
  it('aceita CPF real com e sem máscara', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(cpfValido('529.982.247-26')).toBe(false);
  });

  it('recusa os onze dígitos repetidos', () => {
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('00000000000')).toBe(false);
  });

  it('recusa tamanho errado', () => {
    expect(cpfValido('1234567890')).toBe(false);
  });
});

describe('conversão de campos', () => {
  it('CPF entra só com os dígitos, para casar com o índice do banco', () => {
    expect(CAMPO_POR_NOME.cpf.converter('529.982.247-25').valor).toBe('52998224725');
  });

  it('sexo aceita as formas que aparecem em planilha', () => {
    const s = CAMPO_POR_NOME.sexo.converter;
    expect(s('Masculino').valor).toBe('M');
    expect(s('feminino').valor).toBe('F');
    expect(s('F').valor).toBe('F');
    expect(s('Outro').valor).toBe('O');
    // O banco tem CHECK em M/F/O: deixar passar viraria erro no insert.
    expect(s('talvez').erro).toBeTruthy();
  });

  it('telefone tira máscara e o 55 do país', () => {
    const t = CAMPO_POR_NOME.telefone.converter;
    expect(t('(11) 91234-5678').valor).toBe('11912345678');
    expect(t('+55 11 91234-5678').valor).toBe('11912345678');
    expect(t('1234').erro).toBeTruthy();
  });

  it('UF inválida vira erro em vez de sujar o cadastro', () => {
    expect(CAMPO_POR_NOME.estado.converter('SP').valor).toBe('SP');
    expect(CAMPO_POR_NOME.estado.converter('XX').erro).toBeTruthy();
  });
});

describe('mapeamento automático de colunas', () => {
  it('reconhece cabeçalhos comuns', () => {
    const m = mapearAutomaticamente(['Nome Completo', 'CPF', 'Data de Nascimento', 'Celular', 'E-mail']);
    expect(m[0]).toBe('nome');
    expect(m[1]).toBe('cpf');
    expect(m[2]).toBe('data_nascimento');
    expect(m[3]).toBe('telefone');
    expect(m[4]).toBe('email');
  });

  it('ignora acento, caixa e pontuação do cabeçalho', () => {
    const m = mapearAutomaticamente(['NOME', 'endereço', 'observações']);
    expect(m[0]).toBe('nome');
    expect(m[1]).toBe('logradouro');
    expect(m[2]).toBe('observacoes');
  });

  it('não dá o mesmo campo para duas colunas', () => {
    const m = mapearAutomaticamente(['Telefone', 'Telefone 2', 'Celular']);
    const usados = Object.values(m).filter(Boolean);
    expect(new Set(usados).size).toBe(usados.length);
  });

  it('"número" do endereço não rouba a carteirinha', () => {
    const m = mapearAutomaticamente(['Nome', 'Número', 'Número da Carteirinha']);
    expect(m[1]).toBe('numero');
    expect(m[2]).toBe('numero_carteira');
  });

  it('coluna desconhecida fica sem campo, não chuta', () => {
    const m = mapearAutomaticamente(['Nome', 'Código Interno XPTO']);
    expect(m[0]).toBe('nome');
    expect(m[1]).toBeNull();
  });

  it('avisa quando o nome não foi mapeado', () => {
    expect(faltandoObrigatorios(mapearAutomaticamente(['CPF', 'Telefone']))).toEqual(['Nome']);
    expect(faltandoObrigatorios(mapearAutomaticamente(['Nome', 'CPF']))).toEqual([]);
  });

  it('cabeçalho idêntico pontua mais que parcial', () => {
    const campoNome = CAMPOS_PACIENTE.find(c => c.nome === 'nome')!;
    expect(pontuar('nome', campoNome)).toBe(100);
    expect(pontuar('nome do paciente completo', campoNome)).toBe(80);
    expect(pontuar('xyz', campoNome)).toBe(0);
  });

  it('normalizarCabecalho tira acento e pontuação', () => {
    expect(normalizarCabecalho('  Data de Nascimento ')).toBe('data de nascimento');
    expect(normalizarCabecalho('E-MAIL')).toBe('e mail');
  });
});

describe('leitura de CSV', () => {
  /** Excel em português salva com ponto e vírgula — o erro clássico. */
  it('detecta ponto e vírgula do Excel brasileiro', () => {
    expect(detectarSeparador('Nome;CPF;Telefone')).toBe(';');
    expect(detectarSeparador('Nome,CPF,Telefone')).toBe(',');
  });

  it('vírgula dentro de aspas não conta como separador', () => {
    expect(detectarSeparador('"Silva, João";123')).toBe(';');
  });

  it('lê linhas com campo entre aspas contendo o separador', () => {
    const p = lerCsv('Nome;Cidade\r\n"Silva; João";São Paulo\r\n');
    expect(p.cabecalhos).toEqual(['Nome', 'Cidade']);
    expect(p.linhas).toEqual([['Silva; João', 'São Paulo']]);
  });

  it('aspas duplicadas viram uma aspa', () => {
    const p = lerCsv('Nome\n"Maria ""Bibi"" Souza"\n');
    expect(p.linhas[0][0]).toBe('Maria "Bibi" Souza');
  });

  it('remove o BOM do Excel para o cabeçalho casar', () => {
    const p = lerCsv('﻿Nome;CPF\nJoão;123\n');
    expect(p.cabecalhos[0]).toBe('Nome');
  });

  it('descarta linhas totalmente vazias', () => {
    const p = lerCsv('Nome;CPF\nJoão;1\n;\n\nMaria;2\n');
    expect(p.linhas.length).toBe(2);
  });
});

describe('conversão de linha', () => {
  const mapa = { 0: 'nome', 1: 'cpf', 2: 'data_nascimento', 3: 'cep' } as any;

  it('monta o paciente a partir das colunas mapeadas', () => {
    const l = converterLinha(['João da Silva', '529.982.247-25', '25/12/1980', '01310-100'], mapa, 2);
    expect(l.paciente).toEqual({
      nome: 'João da Silva', cpf: '52998224725',
      data_nascimento: '1980-12-25', cep: '01310100',
    });
    expect(podeImportar(l)).toBe(true);
  });

  /** Perder o paciente para salvar o CEP seria o pior negócio possível. */
  it('campo opcional inválido vira aviso e o paciente entra sem ele', () => {
    const l = converterLinha(['João', '', '', '123'], mapa, 3);
    expect(podeImportar(l)).toBe(true);
    expect(l.paciente.cep).toBeUndefined();
    expect(l.erros.some(e => e.includes('ignorado'))).toBe(true);
  });

  it('sem nome a linha não entra', () => {
    const l = converterLinha(['', '529.982.247-25', '', ''], mapa, 4);
    expect(podeImportar(l)).toBe(false);
  });

  it('guarda o número da linha do Excel para a pessoa achar o erro', () => {
    expect(converterLinha(['Ana'], mapa, 57).linha).toBe(57);
  });
});

describe('duplicadas', () => {
  const linha = (n: number, p: any) => ({ linha: n, paciente: p, erros: [] });

  it('CPF é a chave quando existe', () => {
    expect(chaveDeComparacao({ cpf: '529.982.247-25', nome: 'X' })).toBe('cpf:52998224725');
  });

  it('sem CPF usa nome + nascimento, ignorando acento e caixa', () => {
    const a = chaveDeComparacao({ nome: 'José da Silva', data_nascimento: '1980-12-25' });
    const b = chaveDeComparacao({ nome: 'JOSE DA SILVA', data_nascimento: '1980-12-25' });
    expect(a).toBe(b);
  });

  /** Unir por nome puro juntaria pai e filho de mesmo nome. */
  it('só nome, sem nascimento, não gera chave', () => {
    expect(chaveDeComparacao({ nome: 'José da Silva' })).toBeNull();
  });

  it('pega repetida dentro do próprio arquivo', () => {
    const r = marcarDuplicadas([
      linha(2, { nome: 'A', cpf: '52998224725' }),
      linha(3, { nome: 'A de novo', cpf: '529.982.247-25' }),
    ] as any, new Map());
    expect(r[0].duplicadaDe).toBeUndefined();
    expect(r[1].duplicadaDe).toContain('linha 2');
  });

  it('pega quem já está no banco, mesmo com máscara diferente', () => {
    const jaExiste = new Map([['cpf:52998224725', 'já cadastrado: João']]);
    const r = marcarDuplicadas([linha(2, { nome: 'João', cpf: '529.982.247-25' })] as any, jaExiste);
    expect(r[0].duplicadaDe).toContain('João');
  });

  it('resume o que vai acontecer antes de gravar', () => {
    const r = resumir([
      { linha: 2, paciente: { nome: 'A' }, erros: [] },
      { linha: 3, paciente: { nome: 'B' }, erros: [], duplicadaDe: 'já cadastrado' },
      { linha: 4, paciente: {}, erros: ['Nome: coluna vazia'] },
      { linha: 5, paciente: { nome: 'D' }, erros: ['CEP ignorado (curto)'] },
    ] as any);
    expect(r).toEqual({ total: 4, prontas: 2, duplicadas: 1, comErro: 1, comAviso: 1 });
  });
});

describe('erros e devolutiva', () => {
  it('traduz erro do Postgres para o balcão', () => {
    expect(traduzirErro('duplicate key value violates unique constraint "pacientes_cpf_por_clinica"'))
      .toBe('CPF já cadastrado nesta clínica');
    expect(traduzirErro('new row violates row-level security policy'))
      .toBe('sem permissão para cadastrar pacientes');
  });

  it('devolve as recusadas em CSV que o Excel abre', () => {
    const csv = csvDasRecusadas(
      [{ linha: 7, paciente: { nome: 'Zé' }, erros: ['Nome: x'] }] as any,
      [{ linha: 7, nome: 'Zé', erro: 'CPF já cadastrado nesta clínica' }],
    );
    expect(csv).toContain('Linha;Nome;Motivo');
    expect(csv).toContain('7;"Zé";"CPF já cadastrado nesta clínica"');
    expect(csv.startsWith('﻿')).toBe(true);
  });
});
