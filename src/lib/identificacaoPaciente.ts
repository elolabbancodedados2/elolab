import { parseDateOnly } from '@/lib/dateOnly';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Mascara o CPF mantendo só os dois dígitos verificadores: `***.***.***-12`. */
export function mascararCpf(cpf: string | null | undefined): string | null {
  const digitos = (cpf ?? '').replace(/\D/g, '');
  if (digitos.length !== 11) return null;
  return `***.***.***-${digitos.slice(9)}`;
}

/**
 * Idade por extenso: dias para menores de 1 mês, meses para menores de 1 ano,
 * anos a partir daí. Devolve `null` para data inválida.
 */
export function descreverIdade(dataNascimento: string, hoje: Date = new Date()): string | null {
  const nascimento = parseDateOnly(dataNascimento);
  if (Number.isNaN(nascimento.getTime())) return null;

  let meses =
    (hoje.getFullYear() - nascimento.getFullYear()) * 12 +
    (hoje.getMonth() - nascimento.getMonth());
  if (hoje.getDate() < nascimento.getDate()) meses -= 1;

  if (meses < 1) {
    const hojeMeioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12);
    const dias = Math.max(0, Math.round((hojeMeioDia.getTime() - nascimento.getTime()) / DIA_MS));
    return dias === 1 ? '1 dia' : `${dias} dias`;
  }
  if (meses < 12) return meses === 1 ? '1 mês' : `${meses} meses`;
  const anos = Math.floor(meses / 12);
  return anos === 1 ? '1 ano' : `${anos} anos`;
}
