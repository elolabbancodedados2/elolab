export type WhatsAppAgentCapability =
  | 'informacoes_clinica'
  | 'consultar_disponibilidade'
  | 'criar_agendamento'
  | 'consultar_agendamentos_paciente'
  | 'cancelar_agendamento'
  | 'reagendar_agendamento'
  | 'registrar_triagem';

const toolCapabilities: Record<string, WhatsAppAgentCapability> = {
  consultar_informacoes_clinica: 'informacoes_clinica',
  cancelar_agendamento: 'cancelar_agendamento',
  reagendar_agendamento: 'reagendar_agendamento',
  confirmar_presenca: 'consultar_agendamentos_paciente',
  listar_especialidades: 'consultar_disponibilidade',
  consultar_disponibilidade: 'consultar_disponibilidade',
  criar_agendamento: 'criar_agendamento',
  consultar_agendamentos_paciente: 'consultar_agendamentos_paciente',
  registrar_triagem: 'registrar_triagem',
};

export function normalizeMedicalSpecialty(value: string): string {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const aliases: Record<string, string> = {
    'clinico geral': 'clinica geral', 'medicina geral': 'clinica geral', clinico: 'clinica geral', clinica: 'clinica geral',
    ginecologista: 'ginecologia', gineocologista: 'ginecologia', ginecologistas: 'ginecologia', ginecologo: 'ginecologia',
  };
  return aliases[text] || text;
}

export function normalizeBrazilianPhone(value: string | null | undefined): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length === 12 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function findUniquePatientIdByPhone(
  remotePhone: string,
  candidates: Array<{ id: string; telefone?: string | null }>,
): string | null {
  const normalizedRemote = normalizeBrazilianPhone(remotePhone);
  if (normalizedRemote.length < 10) return null;

  const matches = candidates.filter((candidate) =>
    normalizeBrazilianPhone(candidate.telefone) === normalizedRemote,
  );
  return matches.length === 1 ? matches[0].id : null;
}

export function isWhatsAppToolAllowed(
  toolName: string,
  capabilities: unknown,
): boolean {
  if (toolName === 'transferir_humano') return true;
  const requiredCapability = toolCapabilities[toolName];
  return Boolean(
    requiredCapability &&
    Array.isArray(capabilities) &&
    capabilities.includes(requiredCapability),
  );
}

export type ExplicitConfirmation = 'yes' | 'no' | 'unclear';

export function parseExplicitConfirmation(value: string): ExplicitConfirmation {
  const normalized = value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['sim', 's', 'confirmo', 'confirmar', 'confirmado', 'autorizo'].includes(normalized)) return 'yes';
  if (['nao', 'n', 'cancelar', 'cancelo'].includes(normalized)) return 'no';
  return 'unclear';
}
