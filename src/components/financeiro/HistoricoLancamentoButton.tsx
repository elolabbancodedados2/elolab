import { History } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface Props {
  lancamentoId: string;
  descricao: string | null;
  rotulos?: Record<string, string>;
  restoreSearchTerm?: string;
}

/** Abre a trilha de auditoria da conta a pagar em uma página com contexto próprio. */
export function HistoricoLancamentoButton({ lancamentoId, descricao, rotulos, restoreSearchTerm = '' }: Props) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <Button asChild size="icon" variant="ghost" className="h-9 w-9 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10" aria-label={`Histórico de alterações de ${descricao || 'lançamento'}`} title="Histórico de alterações">
      <Link
        to={`/contas/pagar/${encodeURIComponent(lancamentoId)}/historico`}
        state={{
          returnTo,
          returnState: {
            ...(location.state && typeof location.state === 'object' ? location.state : {}),
            restoreSearchTerm,
          },
          rotulos,
        }}
      >
        <History className="h-4 w-4" />
      </Link>
    </Button>
  );
}
