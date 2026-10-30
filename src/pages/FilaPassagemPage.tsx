import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardCopy, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function FilaPassagemPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { summary?: unknown; returnTo?: unknown } | null;
  const summary = typeof state?.summary === 'string' && state.summary.length <= 4000 ? state.summary : '';
  const returnTo = typeof state?.returnTo === 'string' && /^\/fila(?:\?.*)?$/.test(state.returnTo)
    ? state.returnTo
    : '/fila';

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      toast.success('Resumo de passagem de turno copiado.');
    } catch {
      toast.error('Não foi possível copiar neste dispositivo. Selecione o resumo e copie manualmente.');
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Passagem de turno"
        description="Resumo operacional da fila no momento em que você abriu esta tarefa. Não inclui nomes nem informações clínicas."
        icon={<FileText />}
        actions={<Button type="button" variant="outline" className="rounded-full" onClick={() => navigate(returnTo)}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar para a fila</Button>}
      />
      {!summary ? (
        <ErrorState title="Resumo indisponível" description="Abra a passagem de turno pela Fila para gerar um resumo atualizado." onRetry={() => navigate('/fila', { replace: true })} />
      ) : (
        <section aria-labelledby="fila-passagem-heading" className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 id="fila-passagem-heading" className="text-base font-semibold">Resumo da fila</h2>
              <p className="text-sm text-muted-foreground">Revise o estado atual antes de compartilhar com o próximo turno.</p>
            </div>
            <Button type="button" className="gap-2 rounded-full" onClick={() => void copySummary()}>
              <ClipboardCopy aria-hidden="true" className="h-4 w-4" /> Copiar resumo
            </Button>
          </div>
          <Textarea
            aria-label="Resumo operacional da passagem de turno"
            readOnly
            value={summary}
            onFocus={event => event.currentTarget.select()}
            className="min-h-64 resize-y font-mono text-sm leading-6"
          />
        </section>
      )}
    </div>
  );
}
