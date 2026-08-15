/**
 * Da linha da planilha ao cadastro de paciente — com o erro dito em português.
 *
 * A parte que decide se a migração dá certo não é inserir: é o que acontece
 * com as 40 linhas ruins de um arquivo de 3.000. Elas não podem derrubar a
 * importação inteira nem sumir em silêncio; têm que voltar identificadas, com
 * o número da linha do Excel, para a pessoa corrigir na origem.
 */
import { CAMPO_POR_NOME, CAMPOS_AGENDAMENTO, apenasDigitos, type Campo } from './campos';
import type { Mapeamento } from './mapeamento';

export interface LinhaConvertida {
  /** Número da linha COMO APARECE NO EXCEL: 1 é o cabeçalho. */
  linha: number;
  paciente: Record<string, any>;
  erros: string[];
  /** Preenchido depois, ao comparar com quem já está no banco. */
  duplicadaDe?: string;
}

export function converterLinha(
  celulas: string[],
  mapeamento: Mapeamento,
  numeroDaLinha: number,
  campos?: Campo[],
): LinhaConvertida {
  const porNome: Record<string, Campo> = campos
    ? Object.fromEntries(campos.map(c => [c.nome, c]))
    : CAMPO_POR_NOME;
  const paciente: Record<string, any> = {};
  const erros: string[] = [];

  for (const [colunaTexto, nomeDoCampo] of Object.entries(mapeamento)) {
    if (!nomeDoCampo) continue;
    const campo = porNome[nomeDoCampo];
    if (!campo) continue;

    const bruto = celulas[Number(colunaTexto)] ?? '';
    const { valor, erro } = campo.converter(bruto);

    if (erro) {
      // Campo obrigatório inválido derruba a linha; opcional inválido vira
      // aviso e o cadastro entra sem ele. Recusar um paciente inteiro porque o
      // CEP veio com 7 dígitos seria perder o paciente para salvar o CEP.
      erros.push(campo.obrigatorio ? `${campo.rotulo}: ${erro}` : `${campo.rotulo} ignorado (${erro})`);
      if (campo.obrigatorio) continue;
    }
    if (valor !== null && valor !== undefined && valor !== '') {
      paciente[nomeDoCampo] = valor;
    }
  }

  // Só a importação de paciente exige `nome`; a de agendamento tem os seus
  // próprios obrigatórios, já cobertos pela conversão campo a campo.
  const ehAgendamento = !!campos && campos === CAMPOS_AGENDAMENTO;
  if (!ehAgendamento && !paciente.nome) {
    if (!erros.some(e => e.startsWith('Nome'))) erros.push('Nome: coluna vazia');
  }

  return { linha: numeroDaLinha, paciente, erros };
}

/** Erros que impedem a linha de entrar (o resto é aviso). */
export function errosImpeditivos(linha: LinhaConvertida): string[] {
  return linha.erros.filter(e => !e.includes('ignorado'));
}

export function podeImportar(linha: LinhaConvertida): boolean {
  if (errosImpeditivos(linha).length > 0) return false;
  // Paciente precisa de nome; agendamento precisa de paciente, data e hora.
  if ('data' in linha.paciente || 'hora_inicio' in linha.paciente) {
    return !!linha.paciente.data && !!linha.paciente.hora_inicio && !!linha.paciente.paciente_nome;
  }
  return !!linha.paciente.nome;
}

/**
 * Chave de comparação de um paciente.
 *
 * CPF quando existe — é o único identificador confiável. Sem CPF, nome
 * normalizado + data de nascimento: dois "José da Silva" nascidos no mesmo dia
 * na mesma clínica é raro o bastante para valer o risco, e muito menos custoso
 * que criar o mesmo paciente duas vezes.
 *
 * Sem CPF e sem data de nascimento não há chave: a linha entra como nova. Unir
 * por nome puro juntaria pai e filho de mesmo nome.
 */
export function chaveDeComparacao(p: {
  cpf?: string | null; nome?: string | null; data_nascimento?: string | null;
}): string | null {
  const cpf = apenasDigitos(p.cpf ?? '');
  if (cpf.length === 11) return `cpf:${cpf}`;

  const nome = String(p.nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  const nasc = String(p.data_nascimento ?? '').slice(0, 10);
  if (nome && nasc) return `nome:${nome}|${nasc}`;

  return null;
}

/** Marca linhas repetidas DENTRO do próprio arquivo e contra o que já existe. */
export function marcarDuplicadas(
  linhas: LinhaConvertida[],
  jaExistem: Map<string, string>,
): LinhaConvertida[] {
  const vistasNoArquivo = new Map<string, number>();

  return linhas.map(l => {
    const chave = chaveDeComparacao(l.paciente);
    if (!chave) return l;

    const noArquivo = vistasNoArquivo.get(chave);
    if (noArquivo !== undefined) {
      return { ...l, duplicadaDe: `linha ${noArquivo} deste mesmo arquivo` };
    }
    vistasNoArquivo.set(chave, l.linha);

    const noBanco = jaExistem.get(chave);
    if (noBanco) return { ...l, duplicadaDe: noBanco };

    return l;
  });
}

export interface Resumo {
  total: number;
  prontas: number;
  duplicadas: number;
  comErro: number;
  comAviso: number;
}

export function resumir(linhas: LinhaConvertida[]): Resumo {
  return {
    total: linhas.length,
    prontas: linhas.filter(l => podeImportar(l) && !l.duplicadaDe).length,
    duplicadas: linhas.filter(l => !!l.duplicadaDe).length,
    comErro: linhas.filter(l => !podeImportar(l)).length,
    comAviso: linhas.filter(l => podeImportar(l) && l.erros.length > 0).length,
  };
}
