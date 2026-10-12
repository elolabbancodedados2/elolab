export interface ChatReadReceiptMessage {
  id: string;
  conversa_id: string;
  lida_em: string | null;
}

export interface ChatReadReceiptEvent extends ChatReadReceiptMessage {
  clinica_id: string;
}

export function aplicarReciboLeitura<T extends ChatReadReceiptMessage>(
  messages: T[],
  event: ChatReadReceiptEvent,
  conversaId: string,
  clinicaId: string,
): T[] {
  if (event.conversa_id !== conversaId || event.clinica_id !== clinicaId || !event.lida_em) return messages;
  const index = messages.findIndex(message => message.id === event.id && message.conversa_id === conversaId);
  if (index === -1 || messages[index].lida_em === event.lida_em) return messages;
  return messages.map((message, currentIndex) => currentIndex === index
    ? { ...message, lida_em: event.lida_em }
    : message);
}
