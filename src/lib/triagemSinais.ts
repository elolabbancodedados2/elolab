/**
 * Regras de entrada da ficha de triagem que não dependem da tela.
 */

export interface PressaoNormalizada {
  /** "SIS/DIA" pronto para gravar, ou null se não deu para interpretar. */
  valor: string | null;
  sistolica?: number;
  diastolica?: number;
  /** Preenchido quando o texto digitado foi reinterpretado (ex.: "12x8"). */
  aviso?: string;
}

/**
 * Aceita "120/80", "120 / 80", "120x80" e a forma falada em cmHg ("12x8",
 * "12/8"), que vira 120/80 com aviso. Qualquer outra coisa devolve null.
 */
export function normalizarPressaoArterial(texto: string): PressaoNormalizada {
  const limpo = texto.trim().replace(/\s+/g, '').replace(/[xX×]/g, '/');
  const partes = limpo.match(/^(\d{1,3})\/(\d{1,3})$/);
  if (!partes) return { valor: null };
  let sistolica = Number(partes[1]);
  let diastolica = Number(partes[2]);
  let aviso: string | undefined;
  if (sistolica <= 30 && diastolica <= 30) {
    sistolica *= 10;
    diastolica *= 10;
    aviso = `Pressão "${texto.trim()}" registrada como ${sistolica}/${diastolica} mmHg.`;
  } else if (partes[1].length < 2 || partes[2].length < 2) {
    return { valor: null };
  }
  return { valor: `${sistolica}/${diastolica}`, sistolica, diastolica, aviso };
}

/**
 * Altura gravada antes de a coluna aceitar centímetros vinha em metros
 * (ex.: 1,72). Na carga para correção, valores até 3 viram centímetros.
 */
export function alturaEmCentimetros(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(numero)) return null;
  return numero > 0 && numero <= 3 ? Math.round(numero * 100) : numero;
}

export interface SinaisParaAlerta {
  saturacao?: number | null;
  sistolica?: number | null;
  diastolica?: number | null;
  temperatura?: number | null;
}

/** Sinais que exigem confirmação quando o risco escolhido é verde ou azul. */
export function sinaisCriticos({ saturacao, sistolica, diastolica, temperatura }: SinaisParaAlerta): string[] {
  const achados: string[] = [];
  if (saturacao != null && saturacao < 90) achados.push(`saturação de ${saturacao}%`);
  if ((sistolica != null && sistolica >= 180) || (diastolica != null && diastolica >= 110)) {
    achados.push(`pressão de ${sistolica ?? '—'}/${diastolica ?? '—'} mmHg`);
  }
  if (temperatura != null && temperatura >= 39) achados.push(`temperatura de ${String(temperatura).replace('.', ',')} °C`);
  return achados;
}

export function riscoBaixo(risco: string | null | undefined): boolean {
  return risco === 'verde' || risco === 'azul';
}
