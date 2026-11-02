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
  frequenciaCardiaca?: number | null;
  frequenciaRespiratoria?: number | null;
  glicemia?: number | null;
  dor?: number | null;
}

const numeroBR = (valor: number) => String(valor).replace('.', ',');
const valido = (valor: number | null | undefined): valor is number => valor != null && Number.isFinite(valor);

/** Sinais que exigem confirmação quando o risco escolhido é verde ou azul. */
export function sinaisCriticos({
  saturacao, sistolica, diastolica, temperatura,
  frequenciaCardiaca, frequenciaRespiratoria, glicemia, dor,
}: SinaisParaAlerta): string[] {
  const achados: string[] = [];
  if (valido(saturacao) && saturacao < 90) achados.push(`saturação de ${saturacao}%`);
  if ((valido(sistolica) && sistolica >= 180) || (valido(diastolica) && diastolica >= 110)) {
    achados.push(`pressão de ${sistolica ?? '—'}/${diastolica ?? '—'} mmHg`);
  } else if (valido(sistolica) && sistolica < 90) {
    achados.push(`pressão de ${sistolica}/${diastolica ?? '—'} mmHg`);
  }
  if (valido(temperatura) && temperatura >= 39) achados.push(`temperatura de ${numeroBR(temperatura)} °C`);
  if (valido(frequenciaCardiaca) && (frequenciaCardiaca >= 130 || frequenciaCardiaca < 40)) {
    achados.push(`frequência cardíaca de ${frequenciaCardiaca} bpm`);
  }
  if (valido(frequenciaRespiratoria) && (frequenciaRespiratoria >= 30 || frequenciaRespiratoria <= 8)) {
    achados.push(`frequência respiratória de ${frequenciaRespiratoria} irpm`);
  }
  if (valido(glicemia) && (glicemia < 70 || glicemia >= 300)) achados.push(`glicemia de ${numeroBR(glicemia)} mg/dL`);
  if (valido(dor) && dor >= 8) achados.push(`dor ${dor}/10`);
  return achados;
}

export function riscoBaixo(risco: string | null | undefined): boolean {
  return risco === 'verde' || risco === 'azul';
}

export type Tendencia = 'subiu' | 'caiu' | 'estável';

/** Compara o valor de agora com o da triagem anterior; null sem os dois valores. */
export function tendenciaSinal(
  atual: number | null | undefined,
  anterior: number | null | undefined,
  tolerancia = 0,
): Tendencia | null {
  if (!valido(atual) || !valido(anterior)) return null;
  const diferenca = atual - anterior;
  if (Math.abs(diferenca) <= tolerancia) return 'estável';
  return diferenca > 0 ? 'subiu' : 'caiu';
}

export type RiscoSugerido ='vermelho' | 'laranja' | 'amarelo';

export interface SugestaoRisco {
  risco: RiscoSugerido;
  motivos: string[];
}

/**
 * Sugestão de classificação a partir dos sinais vitais, inspirada nos
 * discriminadores gerais de Manchester e nos limites do NEWS2. Serve só de
 * apoio: a classificação continua sendo decisão da enfermagem. Devolve null
 * quando nenhum sinal sai da faixa de atenção.
 */
export function sugerirRisco(sinais: SinaisParaAlerta): SugestaoRisco | null {
  const { saturacao, sistolica, temperatura, frequenciaCardiaca, frequenciaRespiratoria, glicemia, dor, diastolica } = sinais;
  const niveis: Record<RiscoSugerido, string[]> = { vermelho: [], laranja: [], amarelo: [] };

  if (valido(saturacao)) {
    if (saturacao < 85) niveis.vermelho.push(`saturação de ${saturacao}%`);
    else if (saturacao < 92) niveis.laranja.push(`saturação de ${saturacao}%`);
    else if (saturacao < 95) niveis.amarelo.push(`saturação de ${saturacao}%`);
  }
  if (valido(sistolica)) {
    if (sistolica < 80) niveis.vermelho.push(`pressão sistólica de ${sistolica} mmHg`);
    else if (sistolica < 90 || sistolica >= 220) niveis.laranja.push(`pressão sistólica de ${sistolica} mmHg`);
    else if (sistolica >= 180 || (valido(diastolica) && diastolica >= 110)) niveis.amarelo.push(`pressão de ${sistolica}/${diastolica ?? '—'} mmHg`);
  }
  if (valido(frequenciaCardiaca)) {
    if (frequenciaCardiaca < 40 || frequenciaCardiaca > 150) niveis.vermelho.push(`frequência cardíaca de ${frequenciaCardiaca} bpm`);
    else if (frequenciaCardiaca >= 130) niveis.laranja.push(`frequência cardíaca de ${frequenciaCardiaca} bpm`);
    else if (frequenciaCardiaca >= 111 || frequenciaCardiaca <= 50) niveis.amarelo.push(`frequência cardíaca de ${frequenciaCardiaca} bpm`);
  }
  if (valido(frequenciaRespiratoria)) {
    if (frequenciaRespiratoria <= 8 || frequenciaRespiratoria >= 35) niveis.vermelho.push(`frequência respiratória de ${frequenciaRespiratoria} irpm`);
    else if (frequenciaRespiratoria >= 25) niveis.laranja.push(`frequência respiratória de ${frequenciaRespiratoria} irpm`);
    else if (frequenciaRespiratoria >= 21 || frequenciaRespiratoria <= 11) niveis.amarelo.push(`frequência respiratória de ${frequenciaRespiratoria} irpm`);
  }
  if (valido(temperatura)) {
    if (temperatura >= 41 || temperatura < 35) niveis.laranja.push(`temperatura de ${numeroBR(temperatura)} °C`);
    else if (temperatura >= 38.5) niveis.amarelo.push(`temperatura de ${numeroBR(temperatura)} °C`);
  }
  if (valido(glicemia)) {
    if (glicemia < 50) niveis.laranja.push(`glicemia de ${numeroBR(glicemia)} mg/dL`);
    else if (glicemia < 70 || glicemia >= 300) niveis.amarelo.push(`glicemia de ${numeroBR(glicemia)} mg/dL`);
  }
  if (valido(dor)) {
    if (dor >= 8) niveis.laranja.push(`dor ${dor}/10`);
    else if (dor >= 5) niveis.amarelo.push(`dor ${dor}/10`);
  }

  for (const risco of ['vermelho', 'laranja', 'amarelo'] as const) {
    if (niveis[risco].length > 0) return { risco, motivos: niveis[risco] };
  }
  return null;
}
