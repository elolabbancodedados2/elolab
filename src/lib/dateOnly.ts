/**
 * Conversão segura de colunas DATE do Postgres para Date do JavaScript.
 *
 * O PROBLEMA
 * Uma coluna DATE chega do Supabase como "2026-07-27". O construtor do
 * JavaScript trata uma string ISO só-data como UTC:
 *
 *   new Date('2026-07-27')            → 2026-07-27T00:00:00Z
 *   ...exibido em America/Sao_Paulo   → 26/07/2026  ❌ um dia a menos
 *
 * Num sistema de saúde isso significa atestado, receita, vencimento e data de
 * nascimento aparecendo com a data errada — e, em cálculos de atraso, um dia
 * a mais de inadimplência.
 *
 * A SOLUÇÃO
 * Ancorar no meio-dia local. Nenhum fuso do mundo desloca 12h a ponto de
 * cruzar a virada do dia, então a data exibida é sempre a data gravada.
 *
 * QUANDO USAR
 * Só para colunas DATE (`data`, `data_emissao`, `data_vencimento`,
 * `data_nascimento`, `validade`...). Colunas TIMESTAMPTZ (`created_at`,
 * `updated_at`, `timestamp`) já carregam o instante correto — nessas, use
 * `new Date()` normalmente.
 */

/** Converte "YYYY-MM-DD" em Date no fuso local, ancorado ao meio-dia. */
export function parseDateOnly(value: string): Date;
export function parseDateOnly(value: string | null | undefined): Date | null;
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;

  // Já vem com hora (timestamptz ou "YYYY-MM-DDTHH:mm") → respeita o valor
  if (value.includes('T') || value.includes(' ')) return new Date(value);

  return new Date(`${value}T12:00:00`);
}

/**
 * Um `Date` como "YYYY-MM-DD" no fuso local (não em UTC).
 *
 * Use no lugar de `data.toISOString().split('T')[0]`, que devolve o dia em UTC:
 * no Brasil (UTC−3), das 21h à meia-noite esse recorte já é o dia seguinte, e a
 * clínica que atende à noite grava lançamento, agendamento e vencimento com a
 * data errada.
 */
export function toDateOnly(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Data de hoje como "YYYY-MM-DD" no fuso local (não em UTC). */
export function todayDateOnly(): string {
  return toDateOnly(new Date());
}

/** Dias inteiros entre duas datas-only. Positivo = `fim` no futuro. */
export function daysBetweenDateOnly(inicio: string, fim: string): number {
  const a = parseDateOnly(inicio);
  const b = parseDateOnly(fim);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
