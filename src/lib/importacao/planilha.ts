/**
 * Lê o arquivo que o cliente exportou do sistema antigo.
 *
 * CSV e XLSX, porque é isso que a Feegow, o iClinic e o Excel da secretária
 * produzem. Tudo vira texto: a conversão para data, CPF e telefone é problema
 * de `campos.ts`, que sabe explicar o erro em português.
 *
 * O `xlsx` entra por import dinâmico — são 430 KB que não podem estar no
 * pacote inicial de quem só quer ver a agenda.
 */

/** Marca de ordem de byte. Escrita por código para não virar caractere
 *  invisível no meio do arquivo, que é ilegível em revisão e o lint recusa. */
const BOM = String.fromCharCode(0xfeff);

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
  const XLSX = await import('xlsx');
  const buffer = await arquivo.arrayBuffer();
  // `cellDates` faz a data voltar como Date em vez do número de série; ainda
  // assim `campos.ts` trata o número, porque nem toda planilha marca a coluna
  // como data.
  const pasta = XLSX.read(buffer, { type: 'array', cellDates: true });

  const nomeAba = pasta.SheetNames[0];
  if (!nomeAba) return { cabecalhos: [], linhas: [] };

  const aba = pasta.Sheets[nomeAba];
  const matriz = XLSX.utils.sheet_to_json<any[]>(aba, {
    header: 1, raw: false, defval: '', blankrows: false,
  });

  const naoVazias = matriz.filter(l => Array.isArray(l) && l.some(c => String(c ?? '').trim() !== ''));
  if (naoVazias.length === 0) return { cabecalhos: [], linhas: [], aba: nomeAba };

  const [cabecalhos, ...resto] = naoVazias;
  const nomes = cabecalhos.map((c: any) => String(c ?? '').trim());

  return {
    aba: nomeAba,
    cabecalhos: nomes,
    linhas: resto.map(l => nomes.map((_, i) => String(l[i] ?? '').trim())),
  };
}

export async function lerArquivo(arquivo: File): Promise<Planilha> {
  const nome = arquivo.name.toLowerCase();

  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
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
