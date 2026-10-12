export function receitaOrigemQuitada(status: string | null | undefined): boolean {
  return status === 'pago';
}

export function podeAprovarRepasse(statusRepasse: string, statusReceita: string | null | undefined): boolean {
  return statusRepasse === 'pendente' && receitaOrigemQuitada(statusReceita);
}

export function podePagarRepasse(statusRepasse: string, statusReceita: string | null | undefined): boolean {
  return statusRepasse === 'aprovado' && receitaOrigemQuitada(statusReceita);
}
