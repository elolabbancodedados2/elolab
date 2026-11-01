/**
 * Modelos de mensagem para chamar o paciente no WhatsApp a partir da ficha ou
 * da lista. O texto sai pronto, mas a pessoa ainda revisa e envia no próprio
 * WhatsApp: nada é disparado automaticamente.
 */
import { linkWhatsApp } from '@/lib/whatsapp';

export type ModeloWhatsApp = 'saudacao' | 'confirmar' | 'retorno' | 'documentos' | 'aniversario';

export const MODELOS_WHATSAPP: ReadonlyArray<{ id: ModeloWhatsApp; rotulo: string }> = [
  { id: 'saudacao', rotulo: 'Mensagem livre' },
  { id: 'confirmar', rotulo: 'Confirmar próxima consulta' },
  { id: 'retorno', rotulo: 'Lembrar do retorno' },
  { id: 'documentos', rotulo: 'Pedir documentos do convênio' },
  { id: 'aniversario', rotulo: 'Parabéns pelo aniversário' },
];

export interface DadosMensagemPaciente {
  nome?: string | null;
  nome_social?: string | null;
  clinica?: string | null;
  /** "15/10 às 14:30" — usado em "confirmar". */
  proximaConsulta?: string | null;
}

export function primeiroNome(paciente: { nome?: string | null; nome_social?: string | null }): string {
  return String(paciente.nome_social || paciente.nome || '').trim().split(/\s+/)[0] || '';
}

export function textoModeloWhatsApp(modelo: ModeloWhatsApp, dados: DadosMensagemPaciente): string {
  const nome = primeiroNome(dados);
  const ola = nome ? `Olá, ${nome}!` : 'Olá!';
  const daClinica = dados.clinica?.trim() ? `da ${dados.clinica.trim()}` : 'da clínica';
  switch (modelo) {
    case 'confirmar':
      return dados.proximaConsulta
        ? `${ola} Aqui é ${daClinica}. Podemos confirmar sua consulta de ${dados.proximaConsulta}?`
        : `${ola} Aqui é ${daClinica}. Podemos confirmar sua próxima consulta?`;
    case 'retorno':
      return `${ola} Aqui é ${daClinica}. Está na hora do seu retorno. Quer que a gente reserve um horário?`;
    case 'documentos':
      return `${ola} Aqui é ${daClinica}. Para o atendimento pelo convênio, pode nos enviar uma foto da carteirinha e de um documento com foto?`;
    case 'aniversario':
      return `${ola} Toda a equipe ${daClinica} deseja um feliz aniversário!`;
    case 'saudacao':
    default:
      return `${ola} Aqui é ${daClinica}.`;
  }
}

export function linkModeloWhatsApp(telefone: string | null | undefined, modelo: ModeloWhatsApp, dados: DadosMensagemPaciente): string | null {
  return linkWhatsApp(telefone, textoModeloWhatsApp(modelo, dados));
}
