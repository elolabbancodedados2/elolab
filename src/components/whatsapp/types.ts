export interface WhatsAppAgent {
  id: string;
  nome: string;
  tipo: string;
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
  pacientes?: { nome: string } | null;
}

export interface WhatsAppMessage {
  id: string;
  direcao: string;
  conteudo: string | null;
  status: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface WhatsAppStats {
  messages: number;
  conversations: number;
  actions: number;
}

export interface NewAgentForm {
  nome: string;
  tipo: string;
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
