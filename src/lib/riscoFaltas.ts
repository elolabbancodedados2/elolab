export type FaixaRiscoFalta = 'alto' | 'medio' | 'baixo';

export function formatarIndiceRisco(probabilidade: number): number {
  const valorFinito = Number.isFinite(probabilidade) ? probabilidade : 0;
  return Math.round(Math.min(1, Math.max(0, valorFinito)) * 100);
}

export function classificarRiscoFalta(probabilidade: number): FaixaRiscoFalta {
  if (probabilidade >= 0.7) return 'alto';
  if (probabilidade >= 0.4) return 'medio';
  return 'baixo';
}

export function correspondeFiltroRiscoFalta(probabilidade: number, filtro: string): boolean {
  return filtro === 'todos' || filtro === classificarRiscoFalta(probabilidade);
}

export function formatarDataHoraRiscoFalta(timestamp: string | number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('day')}/${value('month')}/${value('year')} às ${value('hour')}:${value('minute')}`;
}
