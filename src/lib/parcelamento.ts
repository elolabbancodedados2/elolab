import { emCentavos } from '@/lib/dinheiro';
import { proximaOcorrencia } from '@/lib/projecaoFluxoCaixa';

export const MAX_PARCELAS = 36;

export interface Parcela {
  numero: number;
  total: number;
  valor: number;
  vencimento: string;
  descricao: string;
}

/**
 * Divide um valor em parcelas mensais. Os centavos que sobram da divisão vão
 * para as primeiras parcelas, para a soma fechar exatamente com o total. O
 * vencimento mantém o dia do primeiro, limitado ao fim do mês (31/01 → 28/02).
 */
export function dividirEmParcelas(input: {
  total: number;
  quantidade: number;
  primeiroVencimento: string;
  descricao: string;
}): Parcela[] {
  const quantidade = Math.trunc(input.quantidade);
  if (!Number.isFinite(input.total) || input.total <= 0) return [];
  if (!(quantidade >= 1 && quantidade <= MAX_PARCELAS)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.primeiroVencimento)) return [];

  const centavos = emCentavos(input.total);
  if (centavos < quantidade) return [];
  const base = Math.floor(centavos / quantidade);
  const resto = centavos - base * quantidade;
  const descricao = input.descricao.trim();
  const [ano, mes, dia] = input.primeiroVencimento.split('-').map(Number);

  return Array.from({ length: quantidade }, (_, i) => {
    // Calcula cada mês a partir do primeiro: encadear a partir de 28/02
    // empurraria todas as parcelas seguintes para o dia 28.
    const vencimento = i === 0
      ? input.primeiroVencimento
      : proximaOcorrencia(`${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, 'mensal', i)!;
    return {
      numero: i + 1,
      total: quantidade,
      valor: (base + (i < resto ? 1 : 0)) / 100,
      vencimento,
      descricao: quantidade > 1 ? `${descricao} (${i + 1}/${quantidade})` : descricao,
    };
  });
}
