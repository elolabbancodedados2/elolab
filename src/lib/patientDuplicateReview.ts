export function maskDuplicateReviewPhone(value: string | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return 'Telefone não informado';
  if (digits.length <= 4) return '•'.repeat(digits.length);
  return `•••••${digits.slice(-4)}`;
}
