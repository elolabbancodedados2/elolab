/**
 * Importar a agenda do sistema antigo.
 *
 * É o que faz a clínica conseguir trabalhar no dia seguinte à migração: sem
 * isso a recepção abre o app e vê um dia vazio enquanto a sala de espera enche.
 *
 * A diferença para a importação de pacientes é que aqui cada linha APONTA para
 * cadastros que já precisam existir:
 *
 *   • Paciente não encontrado → a linha NÃO entra. Criar um paciente a partir
 *     de uma linha de agenda geraria um cadastro sem CPF nem nascimento — ou
 *     seja, uma duplicata do que a importação de pacientes acabou de fazer
 *     direito. A ordem é: pacientes primeiro, agenda depois.
 *
 *   • Profissional não encontrado → a linha ENTRA sem profissional, com aviso.
 *     Consulta sem médico definido é remarcável em dois cliques; consulta que
 *     não existe é um paciente que aparece e ninguém esperava.
 */
import { supabase } from '@/integrations/supabase/client';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { chaveDeComparacao, podeImportar, type LinhaConvertida } from './linhas';
import { traduzirErro } from './importar';

const LOTE = 200;

export interface ResultadoAgenda {
  inseridos: number;
  ignorados: number;
  semPaciente: number;
  semProfissional: number;
  falhas: Array<{ linha: number; nome: string; erro: string }>;
}

export interface IndicesDaClinica {
  /** chave de comparação → id do paciente */
  pacientes: Map<string, string>;
  /** nome normalizado → id do médico */
  medicos: Map<string, string>;
}

/** Carrega, de uma vez, com quem as linhas da planilha vão ser casadas. */
export async function carregarIndices(clinicaId: string): Promise<IndicesDaClinica> {
  const pacientes = new Map<string, string>();
  const medicos = new Map<string, string>();
  const PAGINA = 1000;

  let de = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('pacientes')
      .select('id, nome, cpf, data_nascimento')
      .eq('clinica_id', clinicaId)
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(`Não consegui ler os pacientes: ${error.message}`);
    if (!data?.length) break;

    for (const p of data) {
      const porChave = chaveDeComparacao(p as any);
      if (porChave && !pacientes.has(porChave)) pacientes.set(porChave, p.id);
      // Índice extra por nome puro: a planilha de agenda quase nunca traz CPF
      // nem nascimento, só o nome. Fica como último recurso, depois da chave.
      const soNome = `nome:${normalizarTexto(p.nome)}`;
      if (!pacientes.has(soNome)) pacientes.set(soNome, p.id);
    }
    if (data.length < PAGINA) break;
    de += PAGINA;
  }

  const { data: meds, error: erroMed } = await supabase
    .from('medicos')
    .select('id, nome')
    .eq('clinica_id', clinicaId);
  if (erroMed) throw new Error(`Não consegui ler os profissionais: ${erroMed.message}`);

  for (const m of meds ?? []) {
    const n = normalizarTexto(m.nome);
    if (n) medicos.set(n, m.id);
    // "Dra. Ana Laura" na planilha e "Ana Laura" no cadastro são a mesma pessoa.
    const semTitulo = n.replace(/^(dr|dra|doutor|doutora)\.?\s+/, '').trim();
    if (semTitulo && !medicos.has(semTitulo)) medicos.set(semTitulo, m.id);
  }

  return { pacientes, medicos };
}

/** Acha o paciente da linha: CPF, depois nome+nascimento, depois só nome. */
export function acharPaciente(
  linha: Record<string, any>,
  indice: Map<string, string>,
): string | null {
  const porChave = chaveDeComparacao({
    cpf: linha.paciente_cpf,
    nome: linha.paciente_nome,
    data_nascimento: linha.paciente_nascimento,
  });
  if (porChave && indice.has(porChave)) return indice.get(porChave)!;

  const soNome = `nome:${normalizarTexto(linha.paciente_nome ?? '')}`;
  return indice.get(soNome) ?? null;
}

export function acharMedico(nome: string | undefined, indice: Map<string, string>): string | null {
  if (!nome) return null;
  const n = normalizarTexto(nome);
  if (indice.has(n)) return indice.get(n)!;
  const semTitulo = n.replace(/^(dr|dra|doutor|doutora)\.?\s+/, '').trim();
  return indice.get(semTitulo) ?? null;
}

/** Já existe agendamento igual? Mesmo paciente, mesmo dia, mesma hora. */
function chaveDoAgendamento(pacienteId: string, data: string, hora: string): string {
  return `${pacienteId}|${data}|${String(hora).slice(0, 5)}`;
}

export async function carregarAgendaExistente(clinicaId: string): Promise<Set<string>> {
  const existentes = new Set<string>();
  const PAGINA = 1000;
  let de = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('agendamentos')
      .select('paciente_id, data, hora_inicio')
      .eq('clinica_id', clinicaId)
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(`Não consegui ler a agenda atual: ${error.message}`);
    if (!data?.length) break;

    for (const a of data) {
      existentes.add(chaveDoAgendamento(a.paciente_id, String(a.data), String(a.hora_inicio)));
    }
    if (data.length < PAGINA) break;
    de += PAGINA;
  }
  return existentes;
}

/** Resolve as linhas contra o cadastro, antes de gravar nada. */
export function prepararAgenda(
  linhas: LinhaConvertida[],
  indices: IndicesDaClinica,
  jaNaAgenda: Set<string>,
): LinhaConvertida[] {
  const nesteArquivo = new Set<string>();

  return linhas.map(l => {
    if (!podeImportar(l)) return l;

    const pacienteId = acharPaciente(l.paciente, indices.pacientes);
    if (!pacienteId) {
      return {
        ...l,
        erros: [...l.erros, `Paciente não cadastrado: "${l.paciente.paciente_nome ?? '?'}" — importe os pacientes primeiro`],
      };
    }

    const medicoId = acharMedico(l.paciente.medico_nome, indices.medicos);
    const avisos = [...l.erros];
    if (l.paciente.medico_nome && !medicoId) {
      avisos.push(`Profissional ignorado ("${l.paciente.medico_nome}" não está cadastrado)`);
    }

    const chave = chaveDoAgendamento(pacienteId, l.paciente.data, l.paciente.hora_inicio);
    if (jaNaAgenda.has(chave)) {
      return { ...l, erros: avisos, duplicadaDe: 'já existe na agenda, no mesmo dia e horário' };
    }
    if (nesteArquivo.has(chave)) {
      return { ...l, erros: avisos, duplicadaDe: 'repetido neste mesmo arquivo' };
    }
    nesteArquivo.add(chave);

    return {
      ...l,
      erros: avisos,
      paciente: { ...l.paciente, _paciente_id: pacienteId, _medico_id: medicoId },
    };
  });
}

export async function importarAgendamentos(
  linhas: LinhaConvertida[],
  clinicaId: string,
  aoProgredir?: (feitas: number, total: number) => void,
): Promise<ResultadoAgenda> {
  if (!clinicaId) throw new Error('Sem clínica no seu perfil — não sei para onde importar.');

  const importaveis = linhas.filter(l => podeImportar(l) && !l.duplicadaDe && l.paciente._paciente_id);
  const semPaciente = linhas.filter(l => l.erros.some(e => e.startsWith('Paciente não cadastrado'))).length;
  const semProfissional = importaveis.filter(l => !l.paciente._medico_id).length;

  const falhas: ResultadoAgenda['falhas'] = [];
  let inseridos = 0;

  const montar = (l: LinhaConvertida) => ({
    paciente_id: l.paciente._paciente_id,
    medico_id: l.paciente._medico_id ?? null,
    data: l.paciente.data,
    hora_inicio: l.paciente.hora_inicio,
    tipo: l.paciente.tipo ?? null,
    status: l.paciente.status ?? 'agendado',
    observacoes: l.paciente.observacoes ?? null,
    clinica_id: clinicaId,
  });

  for (let i = 0; i < importaveis.length; i += LOTE) {
    const lote = importaveis.slice(i, i + LOTE);
    const { data, error } = await (supabase as any)
      .from('agendamentos')
      .insert(lote.map(montar))
      .select('id');

    if (error) {
      // Uma linha ruim não pode derrubar as outras 199: repete uma a uma para
      // salvar as boas e apontar exatamente qual falhou.
      for (const l of lote) {
        const { error: erroLinha } = await (supabase as any)
          .from('agendamentos').insert(montar(l)).select('id').single();
        if (erroLinha) {
          falhas.push({
            linha: l.linha,
            nome: l.paciente.paciente_nome ?? '(sem nome)',
            erro: traduzirErro(erroLinha.message),
          });
        } else inseridos++;
      }
    } else {
      inseridos += data?.length ?? lote.length;
    }

    aoProgredir?.(Math.min(i + LOTE, importaveis.length), importaveis.length);
  }

  return {
    inseridos,
    ignorados: linhas.length - inseridos,
    semPaciente,
    semProfissional,
    falhas,
  };
}
