import { escapeHtml } from '@/lib/html';

const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw',
  C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn',
  G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww',
  O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn',
  S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw',
  W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn',
};

const MODULE_WIDTH = 2;
const QUIET_ZONE = 10;
const BAR_HEIGHT = 42;

export function barcode39Svg(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized || [...normalized].some((character) => !CODE39[character] || character === '*')) return null;

  const encoded = `*${normalized}*`;
  let cursor = QUIET_ZONE;
  const bars: string[] = [];
  for (let charIndex = 0; charIndex < encoded.length; charIndex++) {
    const pattern = CODE39[encoded[charIndex]];
    for (let index = 0; index < pattern.length; index++) {
      const width = (pattern[index] === 'w' ? 3 : 1) * MODULE_WIDTH;
      if (index % 2 === 0) bars.push(`<rect x="${cursor}" y="0" width="${width}" height="${BAR_HEIGHT}"/>`);
      cursor += width;
    }
    if (charIndex < encoded.length - 1) cursor += MODULE_WIDTH;
  }

  const width = cursor + QUIET_ZONE;
  const label = escapeHtml(normalized);
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código de barras da amostra ${label}" viewBox="0 0 ${width} ${BAR_HEIGHT}" width="${width}" height="${BAR_HEIGHT}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars.join('')}</g></svg>`;
}

export interface DadosEtiqueta {
  codigoAmostra: string;
  tubo: string;
  /** Identificação do paciente (dois identificadores: nome e nascimento). */
  paciente?: string | null;
  /** yyyy-MM-dd */
  nascimento?: string | null;
  /** Data e hora já formatadas no fuso da clínica. */
  dataColeta?: string | null;
  exames?: string[];
}

const dataBr = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

export function sampleLabelHtml({ codigoAmostra, tubo, paciente, nascimento, dataColeta, exames }: DadosEtiqueta): string {
  const code = codigoAmostra.trim().toUpperCase();
  const barcode = barcode39Svg(code);
  const linhaPaciente = paciente?.trim()
    ? `<div class="patient">${escapeHtml(paciente.trim())}${nascimento ? ` · Nasc. ${escapeHtml(dataBr(nascimento))}` : ''}</div>`
    : '';
  const linhaColeta = dataColeta ? `<div class="meta">Coleta: ${escapeHtml(dataColeta)}</div>` : '';
  const listaExames = exames?.filter(Boolean).length ? `<div class="meta">${escapeHtml(exames.filter(Boolean).join(', '))}</div>` : '';
  return `<div class="label">${linhaPaciente}<div class="sample-code">${escapeHtml(code)}</div>${barcode ? `<div class="barcode">${barcode}</div>` : '<div class="barcode-error">Código sem formato compatível para barras</div>'}<div class="tube">Tubo: ${escapeHtml(tubo || 'Não informado')}</div>${linhaColeta}${listaExames}</div>`;
}
