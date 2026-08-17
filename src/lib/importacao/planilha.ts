/**
 * Lê o arquivo que o cliente exportou do sistema antigo.
 *
 * CSV e XLSX, porque é isso que a Feegow, o iClinic e o Excel da secretária
 * produzem. Tudo vira texto: a conversão para data, CPF e telefone é problema
 * de `campos.ts`, que sabe explicar o erro em português.
 *
 * `read-excel-file` substituiu `xlsx@0.18.5` em 08/2026: a lib antiga tinha
 * prototype pollution e ReDoS sem patch upstream (SEC-001 do report de
 * segurança). Esta é ~5× menor no bundle e mantida.
 *
 * O `read-excel-file` entra por import dinâmico — o chunk sai do caminho
 * inicial de quem só quer ver a agenda.
 */

/** Marca de ordem de byte. Escrita por código para não virar caractere
 *  invisível no meio do arquivo, que é ilegível em revisão e o lint recusa. */
const BOM = String.fromCharCode(0xfeff);
const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const MAXIMO_DE_LINHAS = 100_000;

export interface Planilha {
  cabecalhos: string[];
  linhas: string[][];
  /** Nome da aba, quando o arquivo tem mais de uma. */
  aba?: string;
}

/**
 * Separador do CSV: vírgula ou ponto e vírgula.
 *
 * Excel em português salva CSV com PONTO E VÍRGULA, porque a vírgula é o
 * separador decimal. Assumir vírgula faz o arquivo inteiro virar uma coluna só
 * — e é o erro mais comum de importador brasileiro.
 */
export function detectarSeparador(primeiraLinha: string): ';' | ',' | '\t' {
  const foraDeAspas = primeiraLinha.replace(/"[^"]*"/g, '');
  const ponto = (foraDeAspas.match(/;/g) || []).length;
  const virgula = (foraDeAspas.match(/,/g) || []).length;
  const tab = (foraDeAspas.match(/\t/g) || []).length;
  if (tab > ponto && tab > virgula) return '\t';
  return ponto >= virgula ? ';' : ',';
}

/** CSV com aspas, separador dentro de aspas e aspas duplicadas escapadas. */
export function lerCsv(texto: string): Planilha {
  // Sem tirar o BOM, ele gruda no primeiro cabeçalho como um caractere
  // invisível antes do texto, e "Nome" deixa de casar com qualquer apelido —
  // a coluna do nome fica sem mapeamento e a importação recusa tudo.
  const limpo = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const primeira = limpo.split(/\r?\n/)[0] ?? '';
  const sep = detectarSeparador(primeira);

  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];

    if (dentroDeAspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') { campo += '"'; i++; }
        else dentroDeAspas = false;
      } else campo += c;
      continue;
    }

    if (c === '"') { dentroDeAspas = true; continue; }
    if (c === sep) { linha.push(campo); campo = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    campo += c;
  }
  if (campo !== '' || linha.length > 0) { linha.push(campo); linhas.push(linha); }

  const semVazias = linhas.filter(l => l.some(c => String(c).trim() !== ''));
  if (semVazias.length === 0) return { cabecalhos: [], linhas: [] };

  const [cabecalhos, ...resto] = semVazias;
  return {
    cabecalhos: cabecalhos.map(c => c.trim()),
    linhas: resto.map(l => cabecalhos.map((_, i) => String(l[i] ?? '').trim())),
  };
}

export async function lerXlsx(arquivo: File): Promise<Planilha> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');

  // `readXlsxFile(file)` sem opções devolve `Sheet[]` (todas as abas, com
  // nome e dados). Pegamos a primeira. Cada Row é um array de valores
  // nativos: string | number | boolean | Date | null.
  const abas = await readXlsxFile(arquivo);
  const primeira = abas[0];
  if (!primeira) return { cabecalhos: [], linhas: [] };

  const rows = primeira.data;

  if (rows.length > MAXIMO_DE_LINHAS) {
    throw new Error(`A planilha excede o limite de ${MAXIMO_DE_LINHAS.toLocaleString('pt-BR')} linhas.`);
  }

  const naoVazias = rows.filter(l => Array.isArray(l) && l.some(c => String(c ?? '').trim() !== ''));
  if (naoVazias.length === 0) return { cabecalhos: [], linhas: [], aba: primeira.sheet };

  const [cabecalhos, ...resto] = naoVazias;
  // Data vem como `Date`; convertemos para dd/MM/yyyy no formato brasileiro,
  // que é o que `campos.ts::converterData` já aceita.
  const paraTexto = (c: unknown): string => {
    if (c == null) return '';
    if (c instanceof Date) {
      const dd = String(c.getUTCDate()).padStart(2, '0');
      const mm = String(c.getUTCMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${c.getUTCFullYear()}`;
    }
    return String(c).trim();
  };
  const nomes = cabecalhos.map(paraTexto);

  return {
    aba: primeira.sheet,
    cabecalhos: nomes,
    linhas: resto.map(l => nomes.map((_, i) => paraTexto(l[i]))),
  };
}

export async function lerArquivo(arquivo: File): Promise<Planilha> {
  if (arquivo.size > TAMANHO_MAXIMO) {
    throw new Error('O arquivo excede o limite de 10 MB. Divida a planilha antes de importar.');
  }
  const nome = arquivo.name.toLowerCase();

  // `.xls` binário antigo NÃO é suportado por `read-excel-file`. Se aparecer,
  // avisamos o usuário para converter no próprio Excel para `.xlsx` — o modo
  // binário caiu junto com `xlsx@0.18.5` como parte da mitigação do SEC-001.
  if (nome.endsWith('.xls') && !nome.endsWith('.xlsx')) {
    throw new Error('Arquivos .xls (formato antigo) não são mais aceitos. Abra no Excel e salve como .xlsx antes de importar.');
  }
  if (nome.endsWith('.xlsx')) {
    return lerXlsx(arquivo);
  }
  if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
    // Exportação de sistema antigo costuma vir em Windows-1252: lido como
    // UTF-8, "José" chega como "JosÃ©". O caractere de substituição (U+FFFD)
    // denuncia a leitura errada, e aí relemos com a codificação certa.
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    let texto = new TextDecoder('utf-8').decode(bytes);
    if (texto.includes(String.fromCharCode(0xfffd))) {
      texto = new TextDecoder('windows-1252').decode(bytes);
    }
    return lerCsv(texto);
  }

  throw new Error(`Formato não suportado: "${arquivo.name}". Envie .csv, .xlsx ou .xls.`);
}

/** Prefixo que faz o Excel em português abrir o CSV já em UTF-8. */
export const PREFIXO_UTF8_PARA_EXCEL = BOM;
