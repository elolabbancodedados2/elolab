export function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (/^55\d{10,11}$/.test(digits)) return digits;
  throw new Error('Telefone brasileiro inválido para WhatsApp.');
}

export function notificationHtml(content: string, plain: boolean): string {
  const html = plain ? content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : content;
  return html.replace(/\n/g, '<br>');
}
