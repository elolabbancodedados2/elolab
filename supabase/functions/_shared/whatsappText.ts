export function plainWhatsAppText(value: string): string {
  return value.replace(/\*/g, '').trim()
}
