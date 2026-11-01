/**
 * Operações em lote na tabela de preços de exames de um convênio:
 * importar CSV, reajustar por percentual e copiar de outro convênio.
 * Tudo aqui é cálculo puro; a tela mostra a prévia e só depois grava.
 */
import { arredondarReais, emCentavos } from '@/lib/dinheiro';
import { normalizarTexto } from '@/lib/buscaPaciente';

export interface ItemTabela {
  tipo_exame: string;
  codigo_tuss: string | null;
  descricao: string | null;
  valor_tabela: number;
  valor_filme: number;
  valor_custo: number;
  valor_repasse: number;
}

export interface ItemExistente extends ItemTabela { id: string }

export interface LinhaPrevia {
  acao: 'inserir' | 'atualizar' | 'manter';
  id?: string;
  item: ItemTabela;
  valorAnterior?: number;
}

export interface ErroImportacao { linha: number; mensagem: string }

const chave = (tipo: string) => normalizarTexto(tipo.trim());

/** "1.234,56", "1234.56" ou "R$ 89,90" → número. Vazio vira 0; inválido vira NaN. */
export function lerValor(bruto: string | undefined): number {
  const texto = (bruto ?? '').replace(/R\$/i, '').replace(/\s/g, '');
  if (!texto) return 0;
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return Number.NaN;
  return Number(normalizado);
}

function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i += 1; } else aspas = !aspas;
    } else if (c === separador && !aspas) { campos.push(atual); atual = ''; } else atual += c;
  }
  campos.push(atual);
  return campos.map(campo => campo.trim());
}

const COLUNAS: Record<string, keyof ItemTabela> = {
  exame: 'tipo_exame', tipo_exame: 'tipo_exame', nome: 'tipo_exame',
  tuss: 'codigo_tuss', codigo_tuss: 'codigo_tuss', codigo: 'codigo_tuss',
  descricao: 'descricao',
  valor: 'valor_tabela', valor_tabela: 'valor_tabela', preco: 'valor_tabela',
  filme: 'valor_filme', valor_filme: 'valor_filme',
  custo: 'valor_custo', valor_custo: 'valor_custo',
  repasse: 'valor_repasse', valor_repasse: 'valor_repasse',
};

/**
 * Lê um CSV exportado de planilha (separador ";" ou ","). A primeira linha
 * é o cabeçalho; são aceitas as colunas exame, tuss, descricao, valor,
 * filme, custo e repasse (com ou sem acento e prefixo "valor_").
 */
export function lerCsvTabela(conteudo: string): { itens: ItemTabela[]; erros: ErroImportacao[] } {
  const linhas = conteudo.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) return { itens: [], erros: [{ linha: 1, mensagem: 'O arquivo precisa de cabeçalho e ao menos uma linha.' }] };
  const separador = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const cabecalho = dividirLinha(linhas[0], separador).map(c => COLUNAS[normalizarTexto(c).replace(/\s+/g, '_')]);
  if (!cabecalho.includes('tipo_exame') || !cabecalho.includes('valor_tabela')) {
    return { itens: [], erros: [{ linha: 1, mensagem: 'O cabeçalho precisa das colunas "exame" e "valor".' }] };
  }
  const itens: ItemTabela[] = [];
  const erros: ErroImportacao[] = [];
  const vistos = new Set<string>();
  linhas.slice(1).forEach((linha, indice) => {
    const numero = indice + 2;
    const campos = dividirLinha(linha, separador);
    const bruto: Partial<Record<keyof ItemTabela, string>> = {};
    cabecalho.forEach((coluna, i) => { if (coluna) bruto[coluna] = campos[i]; });
    const tipo = (bruto.tipo_exame ?? '').trim();
    if (!tipo) { erros.push({ linha: numero, mensagem: 'Nome do exame vazio.' }); return; }
    if (vistos.has(chave(tipo))) { erros.push({ linha: numero, mensagem: `"${tipo}" aparece mais de uma vez.` }); return; }
    const valores = (['valor_tabela', 'valor_filme', 'valor_custo', 'valor_repasse'] as const).map(c => lerValor(bruto[c]));
    if (valores.some(v => !Number.isFinite(v) || v < 0)) { erros.push({ linha: numero, mensagem: `Valor inválido em "${tipo}".` }); return; }
    if (valores[0] <= 0) { erros.push({ linha: numero, mensagem: `"${tipo}" precisa de valor de tabela maior que zero.` }); return; }
    const tuss = (bruto.codigo_tuss ?? '').replace(/\D/g, '');
    if (tuss && tuss.length !== 8) { erros.push({ linha: numero, mensagem: `Código TUSS de "${tipo}" deve ter 8 dígitos.` }); return; }
    vistos.add(chave(tipo));
    itens.push({
      tipo_exame: tipo, codigo_tuss: tuss || null, descricao: (bruto.descricao ?? '').trim() || null,
      valor_tabela: arredondarReais(valores[0]), valor_filme: arredondarReais(valores[1]),
      valor_custo: arredondarReais(valores[2]), valor_repasse: arredondarReais(valores[3]),
    });
  });
  return { itens, erros };
}

/** Compara itens novos com a tabela atual, pelo nome do exame. */
export function previaMesclagem(novos: ReadonlyArray<ItemTabela>, existentes: ReadonlyArray<ItemExistente>): LinhaPrevia[] {
  const porNome = new Map(existentes.map(e => [chave(e.tipo_exame), e]));
  return novos.map(item => {
    const atual = porNome.get(chave(item.tipo_exame));
    if (!atual) return { acao: 'inserir', item };
    const igual = (['valor_tabela', 'valor_filme', 'valor_custo', 'valor_repasse'] as const).every(c => emCentavos(atual[c]) === emCentavos(item[c]))
      && (atual.codigo_tuss ?? null) === (item.codigo_tuss ?? null);
    return { acao: igual ? 'manter' : 'atualizar', id: atual.id, item: { ...item, tipo_exame: atual.tipo_exame }, valorAnterior: atual.valor_tabela };
  });
}

/** Reajuste percentual (ex.: 5 = +5%, -3 = -3%) do valor de tabela e do filme. */
export function previaReajuste(existentes: ReadonlyArray<ItemExistente>, percentual: number): LinhaPrevia[] {
  const fator = 1 + percentual / 100;
  return existentes.map(e => {
    const item: ItemTabela = {
      tipo_exame: e.tipo_exame, codigo_tuss: e.codigo_tuss, descricao: e.descricao,
      valor_tabela: arredondarReais(Number(e.valor_tabela) * fator), valor_filme: arredondarReais(Number(e.valor_filme || 0) * fator),
      valor_custo: Number(e.valor_custo || 0), valor_repasse: Number(e.valor_repasse || 0),
    };
    return { acao: emCentavos(item.valor_tabela) === emCentavos(e.valor_tabela) && emCentavos(item.valor_filme) === emCentavos(e.valor_filme || 0) ? 'manter' : 'atualizar', id: e.id, item, valorAnterior: e.valor_tabela };
  });
}

/** Itens de outra tabela multiplicados por um fator (1 = mesmo valor; 0,9 = 10% abaixo). */
export function itensCopiados(origem: ReadonlyArray<ItemTabela>, fator: number): ItemTabela[] {
  return origem.map(o => ({
    tipo_exame: o.tipo_exame, codigo_tuss: o.codigo_tuss, descricao: o.descricao,
    valor_tabela: arredondarReais(Number(o.valor_tabela) * fator), valor_filme: arredondarReais(Number(o.valor_filme || 0) * fator),
    valor_custo: Number(o.valor_custo || 0), valor_repasse: Number(o.valor_repasse || 0),
  }));
}

export const resumoPrevia = (linhas: ReadonlyArray<LinhaPrevia>) => ({
  inserir: linhas.filter(l => l.acao === 'inserir').length,
  atualizar: linhas.filter(l => l.acao === 'atualizar').length,
  manter: linhas.filter(l => l.acao === 'manter').length,
});
