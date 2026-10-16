/** Monta um link wa.me a partir de um telefone brasileiro (com ou sem DDI). */
export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const numero = digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
