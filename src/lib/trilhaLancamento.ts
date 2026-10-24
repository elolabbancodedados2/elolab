export const CAMPOS_TRILHA: Record<string, string> = {
  data_vencimento: 'Vencimento',
  valor: 'Valor',
  categoria: 'Categoria',
  centro_custo: 'Centro de custo',
};

export function formatarValorTrilha(campo: string, valor: string | null, rotulos: Record<string, string> = {}): string {
  if (valor === null || valor === '') return '—';
  if (campo === 'valor') {
    const numero = Number(valor);
    return Number.isFinite(numero) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero) : valor;
  }
  if (campo === 'data_vencimento' && /^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10).split('-').reverse().join('/');
  return rotulos[valor] ?? valor;
}
