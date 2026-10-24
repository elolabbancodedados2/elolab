export function receitaOrigemQuitada(status: string | null | undefined): boolean {
  return status === 'pago';
}

export function podeAprovarRepasse(statusRepasse: string, statusReceita: string | null | undefined): boolean {
  return statusRepasse === 'pendente' && receitaOrigemQuitada(statusReceita);
}

export function podePagarRepasse(statusRepasse: string, statusReceita: string | null | undefined): boolean {
  return statusRepasse === 'aprovado' && receitaOrigemQuitada(statusReceita);
}

export function descreverRegraRepasse(tipo: string | null | undefined, valor: number | null | undefined): string {
  const numero = Number(valor) || 0;
  return tipo === 'fixo'
    ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero)} por atendimento`
    : `${numero.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da receita`;
}