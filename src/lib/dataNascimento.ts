import { ageFromDateOnly, isValidDateOnly } from '@/lib/dateOnly';

export const ANO_MINIMO_NASCIMENTO = 1900;
export const IDADE_MAXIMA_PACIENTE = 130;
export const DATA_MINIMA_NASCIMENTO = `${ANO_MINIMO_NASCIMENTO}-01-01`;

/** Datas antes de 1900 ou com mais de 130 anos quase sempre são erro de digitação. */
export function dataNascimentoImplausivel(data: string, referencia: Date = new Date()): boolean {
  if (!isValidDateOnly(data)) return false;
  if (data < DATA_MINIMA_NASCIMENTO) return true;
  return ageFromDateOnly(data, referencia) > IDADE_MAXIMA_PACIENTE;
}
