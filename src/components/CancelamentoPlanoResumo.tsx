import { formatDate } from '@/lib/formatters';
/** Efeito e data do cancelamento da assinatura recorrente, exibidos antes da confirmação. */
export function CancelamentoPlanoResumo({ isTrial, trialEnd }: { isTrial: boolean; trialEnd: Date | null }) {
  const hoje = formatDate(new Date(), 'short');
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium text-foreground">Data do cancelamento: {hoje} (ao confirmar)</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>O Mercado Pago cancelará a cobrança recorrente agora. Ao confirmar, o acesso ao plano será encerrado e nenhuma cobrança futura será feita.</li>
        {isTrial && trialEnd && (
          <li>O teste termina hoje, em vez de {formatDate(trialEnd, 'short')}, e a primeira cobrança não acontecerá.</li>
        )}
        <li>Os dados da clínica não são apagados. {isTrial ? 'Você poderá contratar um plano novamente em Planos.' : 'Para voltar a usar, basta assinar novamente em Planos.'}</li>
      </ul>
    </div>
  );
}
