/**
 * Grava os pacientes lidos da planilha.
 *
 * As três regras que evitam a migração virar um problema maior que o original:
 *
 * 1. `clinica_id` vem SEMPRE do usuário logado, nunca do arquivo. Planilha é
 *    texto que qualquer um edita; se ela pudesse escolher a clínica de destino,
 *    o isolamento entre clínicas seria contornável por upload.
 *
 * 2. Duplicata não entra. A comparação é por CPF, e sem CPF por nome +
 *    nascimento — comparando o CPF pelos DÍGITOS, porque a base atual tem 63
 *    cadastros com máscara e 16 sem.
 *
 * 3. Em lotes, com o resultado de cada lote conferido. Uma linha ruim no meio
 *    de 3.000 não pode derrubar as outras 2.999 nem passar despercebida.
 */
import { supabase } from '@/integrations/supabase/client';
import { chaveDeComparacao, podeImportar, type LinhaConvertida } from './linhas';
import { PREFIXO_UTF8_PARA_EXCEL } from './planilha';

const LOTE = 200;

export interface ResultadoImportacao {
  inseridos: number;
  ignorados: number;
  falhas: Array<{ linha: number; nome: string; erro: string }>;
}

/**
 * Índice do que já existe na clínica, na mesma chave usada para a planilha.
 * Uma leitura só: consultar paciente por paciente faria 3.000 requisições.
 */
export async function carregarExistentes(clinicaId: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const PAGINA = 1000;
  let de = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('pacientes')
      .select('id, nome, cpf, data_nascimento')
      .eq('clinica_id', clinicaId)
      .range(de, de + PAGINA - 1);

    if (error) throw new Error(`Não consegui ler os pacientes atuais: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const p of data) {
      const chave = chaveDeComparacao(p as any);
      if (chave && !mapa.has(chave)) mapa.set(chave, `já cadastrado: ${p.nome}`);
    }

    if (data.length < PAGINA) break;
    de += PAGINA;
  }

  return mapa;
}

export async function importarPacientes(
  linhas: LinhaConvertida[],
  clinicaId: string,
  aoProgredir?: (feitas: number, total: number) => void,
): Promise<ResultadoImportacao> {
  if (!clinicaId) {
    throw new Error('Sem clínica no seu perfil — não sei para onde importar.');
  }

  const importaveis = linhas.filter(l => podeImportar(l) && !l.duplicadaDe);
  const ignorados = linhas.length - importaveis.length;

  const falhas: ResultadoImportacao['falhas'] = [];
  let inseridos = 0;

  for (let i = 0; i < importaveis.length; i += LOTE) {
    const lote = importaveis.slice(i, i + LOTE);
    const registros = lote.map(l => ({ ...l.paciente, clinica_id: clinicaId }));

    const { data, error } = await supabase
      .from('pacientes')
      .insert(registros as any)
      .select('id');

    if (error) {
      // O lote inteiro foi recusado por causa de uma linha. Repete uma a uma
      // para salvar as boas e apontar exatamente qual é a ruim — sem isso a
      // pessoa recebe "erro no lote 7" e não tem o que fazer com a informação.
      for (const l of lote) {
        const { error: erroLinha } = await supabase
          .from('pacientes')
          .insert({ ...l.paciente, clinica_id: clinicaId } as any)
          .select('id')
          .single();

        if (erroLinha) {
          falhas.push({
            linha: l.linha,
            nome: l.paciente.nome ?? '(sem nome)',
            erro: traduzirErro(erroLinha.message),
          });
        } else {
          inseridos++;
        }
      }
    } else {
      inseridos += data?.length ?? lote.length;
    }

    aoProgredir?.(Math.min(i + LOTE, importaveis.length), importaveis.length);
  }

  return { inseridos, ignorados, falhas };
}

/** Mensagem do Postgres → frase que a recepção entende. */
export function traduzirErro(mensagem: string): string {
  const m = String(mensagem ?? '');
  if (m.includes('pacientes_cpf_por_clinica')) return 'CPF já cadastrado nesta clínica';
  if (m.includes('pacientes_sexo_check')) return 'sexo precisa ser M, F ou O';
  if (m.includes('row-level security')) return 'sem permissão para cadastrar pacientes';
  if (m.includes('invalid input syntax for type date')) return 'data de nascimento inválida';
  if (m.includes('violates not-null')) return 'faltou um campo obrigatório';
  if (m.includes('value too long')) return 'algum campo passou do tamanho permitido';
  return m;
}

/** CSV das linhas recusadas, para corrigir na origem e subir de novo. */
export function csvDasRecusadas(
  linhas: LinhaConvertida[],
  falhas: ResultadoImportacao['falhas'],
): string {
  const porLinha = new Map(falhas.map(f => [f.linha, f.erro]));
  const problemas = linhas
    .map(l => {
      const doBanco = porLinha.get(l.linha);
      if (doBanco) return { linha: l.linha, nome: l.paciente.nome ?? '', motivo: doBanco };
      if (l.duplicadaDe) return { linha: l.linha, nome: l.paciente.nome ?? '', motivo: l.duplicadaDe };
      if (!podeImportar(l)) return { linha: l.linha, nome: l.paciente.nome ?? '', motivo: l.erros.join(' / ') };
      return null;
    })
    .filter(Boolean) as Array<{ linha: number; nome: string; motivo: string }>;

  const escapar = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  // Ponto e vírgula e BOM: é o que o Excel em português abre sem perguntar nada.
  return PREFIXO_UTF8_PARA_EXCEL + ['Linha;Nome;Motivo']
    .concat(problemas.map(p => [p.linha, escapar(p.nome), escapar(p.motivo)].join(';')))
    .join('\r\n');
}
