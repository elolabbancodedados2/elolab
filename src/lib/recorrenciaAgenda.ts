export type FrequenciaRecorrencia = 'nao' | 'semanal' | 'quinzenal' | 'mensal';

export const FREQUENCIAS_RECORRENCIA: Array<{ valor: FrequenciaRecorrencia; rotulo: string }> = [
  { valor: 'nao', rotulo: 'Não repetir' },
  { valor: 'semanal', rotulo: 'Toda semana' },
  { valor: 'quinzenal', rotulo: 'A cada 15 dias' },
  { valor: 'mensal', rotulo: 'Todo mês' },
];

export const MAX_OCORRENCIAS = 12;

/**
 * Datas das ocorrências seguintes à primeira (que o formulário já grava).
 * Mensal mantém o dia e, quando o mês é mais curto, usa o último dia.
 */
export function datasDaRecorrencia(inicio: string, frequencia: FrequenciaRecorrencia, totalOcorrencias: number): string[] {
  if (frequencia === 'nao' || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return [];
  const total = Math.min(Math.max(Math.trunc(totalOcorrencias) || 1, 1), MAX_OCORRENCIAS);
  const [ano, mes, dia] = inicio.split('-').map(Number);
  const datas: string[] = [];
  for (let i = 1; i < total; i++) {
    let data: Date;
    if (frequencia === 'mensal') {
      const ultimoDia = new Date(Date.UTC(ano, mes - 1 + i + 1, 0)).getUTCDate();
      data = new Date(Date.UTC(ano, mes - 1 + i, Math.min(dia, ultimoDia)));
    } else {
      data = new Date(Date.UTC(ano, mes - 1, dia + i * (frequencia === 'semanal' ? 7 : 14)));
    }
    datas.push(data.toISOString().slice(0, 10));
  }
  return datas;
}
