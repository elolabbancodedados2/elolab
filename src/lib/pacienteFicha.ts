/**
 * Regras de exibição e conferência da ficha do paciente.
 *
 * Ficam fora de `Pacientes.tsx` para serem testadas sem montar a página e
 * reaproveitadas pela lista, pelo painel lateral e pelo portal.
 */
import { ageFromDateOnly, appointmentStartHasPassed, daysBetweenDateOnly, isValidDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';

/**
 * Converte o texto digitado ("Penicilina, Dipirona; Látex") em itens.
 *
 * Antes o campo dividia a cada tecla e descartava o item vazio: digitar a
 * vírgula apagava a própria vírgula e não dava para escrever o segundo item.
 * Agora a tela guarda o texto e só converte ao sair do campo e ao salvar.
 */
export function separarLista(texto: string | null | undefined): string[] {
  const vistos = new Set<string>();
  const itens: string[] = [];
  for (const parte of String(texto ?? '').split(/[,;\n]/)) {
    const item = parte.replace(/\s+/g, ' ').trim();
    if (!item) continue;
    const chave = item.toLocaleLowerCase('pt-BR');
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    itens.push(item);
  }
  return itens;
}

export function juntarLista(itens: readonly string[] | null | undefined): string {
  return (itens ?? []).filter(Boolean).join(', ');
}

export const ROTULO_STATUS_AGENDAMENTO: Record<string, string> = {
  agendado: 'Agendada',
  confirmado: 'Confirmada',
  aguardando: 'Aguardando',
  aguardando_triagem: 'Aguardando triagem',
  em_triagem: 'Em triagem',
  em_atendimento: 'Em atendimento',
  aguardando_pagamento: 'Aguardando pagamento',
  finalizado: 'Realizada',
  concluido: 'Realizada',
  realizado: 'Realizada',
  atendimento_finalizado: 'Realizada',
  cancelado: 'Cancelada',
  faltou: 'Faltou',
};

export const TIPOS_AGENDAMENTO = [
  { value: 'consulta', label: 'Consulta', duracao: 30 },
  { value: 'retorno', label: 'Retorno', duracao: 20 },
  { value: 'exame', label: 'Exame', duracao: 30 },
  { value: 'coleta', label: 'Coleta laboratorial', duracao: 15 },
  { value: 'procedimento', label: 'Procedimento', duracao: 60 },
  { value: 'cirurgia', label: 'Cirurgia', duracao: 120 },
  { value: 'avaliacao', label: 'Avaliação', duracao: 40 },
  { value: 'checkup', label: 'Check-up', duracao: 60 },
  { value: 'triagem', label: 'Triagem', duracao: 15 },
  { value: 'enfermagem', label: 'Atendimento de enfermagem', duracao: 20 },
  { value: 'vacina', label: 'Vacinação', duracao: 15 },
  { value: 'curativo', label: 'Curativo', duracao: 20 },
  { value: 'outro', label: 'Outro', duracao: 30 },
] as const;

export const ROTULO_STATUS_EXAME: Record<string, string> = {
  solicitado: 'Solicitado',
  agendado: 'Agendado',
  em_andamento: 'Em andamento',
  coletado: 'Coletado',
  concluido: 'Concluído',
  laudo_disponivel: 'Laudo disponível',
  cancelado: 'Cancelado',
};

function rotuloGenerico(valor: string | null | undefined): string {
  const texto = String(valor ?? '').replace(/_/g, ' ').trim();
  return texto ? texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1) : '—';
}

export function rotuloStatusAgendamento(status: string | null | undefined): string {
  return ROTULO_STATUS_AGENDAMENTO[String(status ?? '')] ?? rotuloGenerico(status);
}

export function rotuloTipoAgendamento(tipo: string | null | undefined): string {
  if (!tipo) return 'Consulta';
  return TIPOS_AGENDAMENTO.find(item => item.value === tipo)?.label ?? rotuloGenerico(tipo);
}

export function rotuloStatusExame(status: string | null | undefined): string {
  return ROTULO_STATUS_EXAME[String(status ?? '')] ?? rotuloGenerico(status);
}

/**
 * Duração em minutos para um tipo de atendimento. O tipo cadastrado pela
 * clínica (tipos_consulta) vence; sem ele, vale a referência local.
 */
export function duracaoDoTipo(
  tipo: string | null | undefined,
  tiposClinica: ReadonlyArray<{ nome?: string | null; duracao_minutos?: number | null }> = [],
): number {
  const chave = String(tipo ?? '').trim().toLocaleLowerCase('pt-BR');
  const local = TIPOS_AGENDAMENTO.find(item => item.value === chave || item.label.toLocaleLowerCase('pt-BR') === chave);
  const nomes = new Set([chave, local?.value, local?.label.toLocaleLowerCase('pt-BR')].filter(Boolean));
  const daClinica = tiposClinica.find(item => nomes.has(String(item.nome ?? '').trim().toLocaleLowerCase('pt-BR')));
  const minutos = Number(daClinica?.duracao_minutos);
  if (Number.isFinite(minutos) && minutos > 0) return Math.round(minutos);
  return local?.duracao ?? 30;
}

export function sexoPorExtenso(sexo: string | null | undefined): string | null {
  const valor = String(sexo ?? '').trim().toLocaleLowerCase('pt-BR');
  if (valor === 'm' || valor === 'masculino') return 'Masculino';
  if (valor === 'f' || valor === 'feminino') return 'Feminino';
  if (valor === 'o' || valor === 'outro') return 'Outro';
  return null;
}

/** "34 anos", "1 ano", "Menos de 1 ano"; nunca "34a". */
export function textoIdade(dataNascimento: string | null | undefined, referencia?: Date): string {
  if (!dataNascimento) return 'Idade não informada';
  if (!isValidDateOnly(dataNascimento)) return 'Nascimento inválido';
  const idade = ageFromDateOnly(dataNascimento, referencia);
  if (!Number.isFinite(idade) || idade < 0) return 'Nascimento inválido';
  if (idade === 0) return 'Menos de 1 ano';
  return `${idade} ${idade === 1 ? 'ano' : 'anos'}`;
}

/** Nome social em destaque, com o nome de registro como apoio. */
export function nomesDoPaciente(paciente: { nome?: string | null; nome_social?: string | null }) {
  const registro = String(paciente.nome ?? '').trim();
  const social = String(paciente.nome_social ?? '').trim();
  if (social && social.toLocaleLowerCase('pt-BR') !== registro.toLocaleLowerCase('pt-BR')) {
    return { principal: social, registro };
  }
  return { principal: registro || social || 'Paciente', registro: null as string | null };
}

export function formatarCpf(cpf: string | null | undefined): string {
  const digitos = String(cpf ?? '').replace(/\D/g, '').slice(0, 11);
  if (digitos.length > 9) return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  if (digitos.length > 6) return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
  if (digitos.length > 3) return `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
  return digitos;
}

/** "***.456.789-**": o suficiente para conferir sem expor o documento inteiro. */
export function cpfMascarado(cpf: string | null | undefined): string | null {
  const digitos = String(cpf ?? '').replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length !== 11) return '***';
  return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
}

export type SituacaoCarteirinha = { nivel: 'vencida' | 'vence_em_breve'; texto: string; dias: number } | null;

/** Alerta de validade da carteirinha do convênio (30 dias de antecedência). */
export function situacaoCarteirinha(
  validade: string | null | undefined,
  hoje: string = todaySaoPauloDateOnly(),
  antecedenciaDias = 30,
): SituacaoCarteirinha {
  if (!validade || !isValidDateOnly(validade)) return null;
  const dias = daysBetweenDateOnly(hoje, validade);
  if (dias < 0) return { nivel: 'vencida', texto: `Carteirinha vencida há ${-dias} ${dias === -1 ? 'dia' : 'dias'}`, dias };
  if (dias === 0) return { nivel: 'vence_em_breve', texto: 'Carteirinha vence hoje', dias };
  if (dias <= antecedenciaDias) return { nivel: 'vence_em_breve', texto: `Carteirinha vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`, dias };
  return null;
}

const STATUS_ENCERRADOS = new Set(['cancelado', 'faltou', 'finalizado', 'concluido', 'realizado', 'atendimento_finalizado']);

/** Separa "Próximas" (mais cedo primeiro) do "Histórico" (mais recente primeiro). */
export function separarConsultas<T extends { data: string; hora_inicio?: string | null; status?: string | null }>(
  consultas: readonly T[],
  agora: Date = new Date(),
): { proximas: T[]; historico: T[] } {
  const proximas: T[] = [];
  const historico: T[] = [];
  for (const consulta of consultas) {
    const encerrada = STATUS_ENCERRADOS.has(String(consulta.status ?? ''));
    const passou = appointmentStartHasPassed(consulta.data, String(consulta.hora_inicio ?? '').slice(0, 5), agora);
    if (!encerrada && !passou) proximas.push(consulta);
    else historico.push(consulta);
  }
  const chave = (c: T) => `${c.data} ${String(c.hora_inicio ?? '').slice(0, 5)}`;
  proximas.sort((a, b) => chave(a).localeCompare(chave(b)));
  historico.sort((a, b) => chave(b).localeCompare(chave(a)));
  return { proximas, historico };
}

/** Horário de início já passou em São Paulo? Aceita "HH:mm". */
export function horarioJaPassou(data: string, hora: string, agora: Date = new Date()): boolean {
  return appointmentStartHasPassed(data, hora, agora);
}

const CAMPOS_SENSIVEIS = new Set(['cpf', 'cpf_responsavel']);

/**
 * Diferença entre o cadastro carregado e o salvo, para a trilha de auditoria.
 * CPF entra só como "alterado": a trilha não precisa repetir o documento.
 */
export function diferencasCadastro(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  ignorar: readonly string[] = [],
): { field: string; oldValue: unknown; newValue: unknown }[] {
  const normalizar = (valor: unknown) => {
    if (valor === undefined || valor === '') return null;
    if (Array.isArray(valor)) return valor.length ? JSON.stringify(valor) : null;
    return valor;
  };
  const campos = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  const mudancas: { field: string; oldValue: unknown; newValue: unknown }[] = [];
  for (const campo of campos) {
    if (ignorar.includes(campo)) continue;
    const anterior = normalizar(antes[campo]);
    const novo = normalizar(depois[campo]);
    if (anterior === novo) continue;
    if (CAMPOS_SENSIVEIS.has(campo)) {
      mudancas.push({ field: campo, oldValue: anterior === null ? null : '(informado)', newValue: novo === null ? null : '(alterado)' });
    } else {
      mudancas.push({ field: campo, oldValue: anterior, newValue: novo });
    }
  }
  return mudancas;
}

export const MOTIVOS_DUPLICIDADE: Record<string, string> = {
  telefone: 'Mesmo telefone',
  nome_data_nascimento: 'Mesmo nome e nascimento',
  cpf: 'Mesmo CPF',
};

export function rotuloMotivoDuplicidade(motivo: string): string {
  return MOTIVOS_DUPLICIDADE[motivo] ?? 'Nome e nascimento coincidem';
}
