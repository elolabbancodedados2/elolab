export type WhatsAppAgentCapability =
  | 'informacoes_clinica'
  | 'consultar_disponibilidade'
  | 'criar_agendamento'
  | 'consultar_agendamentos_paciente'
  | 'cancelar_agendamento'
  | 'reagendar_agendamento'
  | 'registrar_triagem';

export const WHATSAPP_AGENT_CAPABILITIES: Array<{
  value: WhatsAppAgentCapability;
  label: string;
  description: string;
}> = [
  { value: 'informacoes_clinica', label: 'Responder sobre a clínica', description: 'Informa endereço, contatos e horários cadastrados pela clínica.' },
  { value: 'consultar_disponibilidade', label: 'Consultar horários', description: 'Verifica os horários livres e profissionais disponíveis.' },
  { value: 'criar_agendamento', label: 'Marcar consultas', description: 'Agenda uma consulta após o paciente escolher dia e horário.' },
  { value: 'consultar_agendamentos_paciente', label: 'Consultar minhas consultas', description: 'Mostra apenas os próximos agendamentos do número que chamou.' },
  { value: 'cancelar_agendamento', label: 'Desmarcar consultas', description: 'Solicita confirmação do paciente antes de cancelar.' },
  { value: 'reagendar_agendamento', label: 'Remarcar consultas', description: 'Confirma o novo horário com o paciente antes de alterar.' },
  { value: 'registrar_triagem', label: 'Fazer pré-triagem', description: 'Registra sintomas para a equipe; não fornece diagnóstico.' },
];

export interface WhatsAppAgent {
  id: string;
  nome: string;
  tipo: string;
  habilidades: WhatsAppAgentCapability[];
  humor: string;
  instrucoes_personalizadas: string | null;
  ativo: boolean;
  temperatura: number;
  max_tokens: number;
  mensagem_boas_vindas: string;
  mensagem_encerramento: string;
  horario_atendimento_inicio: string;
  horario_atendimento_fim: string;
  atende_fora_horario: boolean;
  mensagem_fora_horario: string;
  created_at: string;
}

export interface WhatsAppSession {
  id: string;
  instance_name: string;
  instance_id: string | null;
  status: string;
  qr_code: string | null;
  phone_number: string | null;
  agent_id: string | null;
  created_at: string;
  whatsapp_agents?: WhatsAppAgent;
}

export interface WhatsAppConversation {
  id: string;
  session_id: string;
  remote_jid: string;
  status: string;
  ultima_mensagem_at: string;
  responsavel_id: string | null;
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente';
  nao_lidas: number;
  primeira_resposta_em: string | null;
  atendimento_humano_em: string | null;
  encerrada_em: string | null;
  sla_limite_em: string | null;
  resumo_ia: string | null;
  satisfacao_nota: number | null;
  satisfacao_comentario: string | null;
  pacientes?: { nome: string } | null;
  profiles?: { nome: string } | null;
}

export interface WhatsAppMessage {
  id: string;
  direcao: string;
  conteudo: string | null;
  status: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface WhatsAppInternalNote {
  id: string;
  conteudo: string;
  created_at: string;
  autor_id: string;
  profiles?: { nome: string } | null;
}

export interface WhatsAppStats {
  messages: number;
  conversations: number;
  actions: number;
}

export interface NewAgentForm {
  nome: string;
  tipo: string;
  habilidades: WhatsAppAgentCapability[];
  humor: string;
  instrucoes_personalizadas: string;
  temperatura: number;
  max_tokens: number;
  mensagem_boas_vindas: string;
  mensagem_encerramento: string;
  horario_atendimento_inicio: string;
  horario_atendimento_fim: string;
  atende_fora_horario: boolean;
  mensagem_fora_horario: string;
}

export const defaultAgentForm: NewAgentForm = {
  nome: '',
  tipo: 'geral',
  habilidades: [
    'informacoes_clinica',
    'consultar_disponibilidade',
    'criar_agendamento',
    'consultar_agendamentos_paciente',
    'cancelar_agendamento',
    'reagendar_agendamento',
  ],
  humor: 'profissional',
  instrucoes_personalizadas: '',
  temperatura: 0.7,
  max_tokens: 2000,
  mensagem_boas_vindas: 'Olá! Sou o assistente virtual da clínica. Como posso ajudá-lo?',
  mensagem_encerramento: 'Obrigado pelo contato! Tenha um ótimo dia.',
  horario_atendimento_inicio: '08:00',
  horario_atendimento_fim: '18:00',
  atende_fora_horario: false,
  mensagem_fora_horario: 'Nosso atendimento funciona de segunda a sexta, das 8h às 18h. Deixe sua mensagem que retornaremos em breve.',
};
