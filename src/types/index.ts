// Re-export Supabase types
export * from './supabase';

// ========================================
// Legacy Types (for backward compatibility)
// ========================================

// User & Auth Types
export type UserRole = 'admin' | 'medico' | 'recepcao' | 'enfermagem' | 'financeiro';

export interface User {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  avatar?: string;
  crm?: string;
  especialidade?: string;
  telefone?: string;
  ativo: boolean;
  criadoEm: string;
}

// Patient Types
export interface Paciente {
  id: string;
  nome: string;
  cpf: string;
  dataNascimento: string;
  telefone: string;
  email?: string;
  sexo?: 'M' | 'F' | 'O';
  estado_civil?: string;
  profissao?: string;
  tipo_sanguineo?: string;
  endereco: Endereco;
  convenio?: Convenio;
  alergias: string[];
  observacoes?: string;
  criadoEm: string;
}

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface Convenio {
  nome: string;
  numeroCarteira: string;
  validade: string;
}

// Appointment Types
export type StatusAgendamento = 'agendado' | 'confirmado' | 'aguardando' | 'em_atendimento' | 'finalizado' | 'cancelado' | 'faltou';

export interface Agendamento {
  id: string;
  pacienteId: string;
  paciente?: Paciente;
  medicoId: string;
  medico?: User;
  data: string;
  horaInicio: string;
  horaFim: string;
  tipo: 'consulta' | 'retorno' | 'exame' | 'procedimento';
  status: StatusAgendamento;
  observacoes?: string;
  sala?: string;
  criadoEm: string;
}

// Queue Types
export interface FilaAtendimento {
  id: string;
  agendamentoId: string;
  agendamento?: Agendamento;
  posicao: number;
  horarioChegada: string;
  cobrancaEstado?: 'pendente' | 'confirmada' | 'gratuita';
  status: 'aguardando' | 'chamado' | 'em_atendimento' | 'finalizado';
  sala?: string;
  prioridade?: 'normal' | 'preferencial' | 'urgente';
}

// Medical Record Types
export interface Prontuario {
  id: string;
  pacienteId: string;
  medicoId: string;
  agendamentoId: string;
  data: string;
  queixaPrincipal: string;
  historiaDoencaAtual: string;
  examesFisicos: string;
  hipoteseDiagnostica: string;
  conduta: string;
  prescricoes: Prescricao[];
  criadoEm: string;
}

export interface Prescricao {
  id: string;
  medicamento: string;
  dosagem: string;
  posologia: string;
  duracao: string;
  observacoes?: string;
}

// Financial Types
export type StatusPagamento = 'pendente' | 'pago' | 'cancelado' | 'estornado' | 'atrasado';

export interface Lancamento {
  id: string;
  tipo: 'receita' | 'despesa';
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  dataVencimento?: string;
  status: StatusPagamento;
  pacienteId?: string;
  agendamentoId?: string;
  formaPagamento?: 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'convenio' | 'boleto';
  criadoEm: string;
}

// Estoque Types
export interface ItemEstoque {
  id: string;
  nome: string;
  descricao?: string;
  categoria: string;
  quantidade: number;
  quantidadeMinima: number;
  unidade: string;
  valorUnitario: number;
  fornecedor?: string;
  lote?: string;
  validade?: string;
  localizacao?: string;
  criadoEm: string;
}

export interface MovimentacaoEstoque {
  id: string;
  itemId: string;
  tipo: 'entrada' | 'saida' | 'ajuste';
  quantidade: number;
  motivo: string;
  usuarioId: string;
  data: string;
}

// Exame Types
export type StatusExame = 'solicitado' | 'agendado' | 'realizado' | 'laudo_disponivel' | 'cancelado';

export interface Exame {
  id: string;
  pacienteId: string;
  medicoSolicitanteId: string;
  tipoExame: string;
  descricao?: string;
  status: StatusExame;
  dataSolicitacao: string;
  dataAgendamento?: string;
  dataRealizacao?: string;
  resultado?: string;
  arquivoResultado?: string;
  observacoes?: string;
  criadoEm: string;
}

// Sala/Leito Types
export type StatusSala = 'disponivel' | 'ocupado' | 'manutencao' | 'limpeza';

export interface Sala {
  id: string;
  nome: string;
  tipo: 'consultorio' | 'exame' | 'procedimento' | 'triagem' | 'espera';
  capacidade: number;
  equipamentos?: string[];
  status: StatusSala;
  medicoResponsavel?: string;
}

export interface Leito {
  id: string;
  numero: string;
  tipo: 'enfermaria' | 'uti' | 'observacao' | 'recuperacao';
  status: 'disponivel' | 'ocupado' | 'reservado' | 'manutencao';
  pacienteId?: string;
  dataOcupacao?: string;
  previsaoAlta?: string;
}

// Lista de Espera
export interface ItemListaEspera {
  id: string;
  pacienteId: string;
  medicoId?: string;
  especialidade?: string;
  prioridade: 'normal' | 'preferencial' | 'urgente';
  motivo: string;
  preferenciaHorario?: string;
  dataCadastro: string;
  status: 'aguardando' | 'notificado' | 'confirmado' | 'agendado' | 'desistiu';
  observacoes?: string;
}

// Triagem Types
export interface Triagem {
  id: string;
  agendamentoId: string;
  pacienteId: string;
  enfermeiroId: string;
  pressaoArterial: string;
  frequenciaCardiaca: number;
  frequenciaRespiratoria: number;
  temperatura: number;
  saturacao: number;
  peso: number;
  altura: number;
  imc: number;
  queixaPrincipal: string;
  classificacaoRisco: 'verde' | 'amarelo' | 'laranja' | 'vermelho';
  observacoes?: string;
  dataHora: string;
}

// Atestado Type
export interface Atestado {
  id: string;
  pacienteId: string;
  medicoId: string;
  tipo: 'comparecimento' | 'afastamento' | 'acompanhante';
  dataEmissao: string;
  dataInicio?: string;
  dataFim?: string;
  dias?: number;
  cid?: string;
  motivo: string;
  observacoes?: string;
}

// Convênio Completo Type
export interface ConvenioCompleto {
  id: string;
  nome: string;
  codigo: string;
  cnpj: string;
  telefone?: string;
  email?: string;
  website?: string;
  tipoPlanos: string[];
  valorConsulta: number;
  valorRetorno: number;
  carencia?: number;
  ativo: boolean;
  criadoEm: string;
}

// Dashboard Types
export interface DashboardStats {
  pacientesHoje: number;
  consultasAgendadas: number;
  faturamentoMes: number;
  taxaOcupacao: number;
}
