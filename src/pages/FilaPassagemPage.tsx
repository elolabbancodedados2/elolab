import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ClipboardCopy, FileText, ListTodo } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

export default function FilaPassagemPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { summary?: unknown; returnTo?: unknown; note?: unknown } | null;
  const summary = typeof state?.summary === 'string' && state.summary.length <= 4000 ? state.summary : '';
  const [note, setNote] = useState(typeof state?.note === 'string' && state.note.length <= 1200 ? state.note : '');
  const returnTo = typeof state?.returnTo === 'string' && (state.returnTo === '/recepcao' || /^\/fila(?:\?.*)?$/.test(state.returnTo))
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

  const registerTask = () => {
    const operationalNote = note.trim();
    const description = [
      'Resumo operacional da passagem de turno:',
      summary,
      operationalNote ? `Pendência para acompanhamento:\n${operationalNote}` : 'Pendência para acompanhamento:',
    ].join('\n\n');

    navigate('/tarefas/nova', {
      state: {
        returnTo: '/fila/passagem',
        returnState: { summary, returnTo, note },
        taskPrefill: {
          titulo: 'Pendência da passagem de turno',
          descricao: description,
          prioridade: 'media',
          data_vencimento: todaySaoPauloDateOnly(),
          categoria: 'Administrativo',
        },
      },
    });
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Passagem de turno"
        description="Resumo operacional da fila no momento em que você abriu esta tarefa. Não inclui nomes nem informações clínicas."
        icon={<FileText />}
        actions={<Button type="button" variant="outline" className="rounded-full" onClick={() => navigate(returnTo)}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />{returnTo === '/recepcao' ? 'Voltar para a Recepção' : 'Voltar para a fila'}</Button>}
      />
      {!summary ? (
        <ErrorState title="Resumo indisponível" description="Abra a passagem de turno pela Fila para gerar um resumo atualizado." onRetry={() => navigate('/fila', { replace: true })} />
      ) : (
        <section aria-labelledby="fila-passagem-heading" className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <article className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Visão do turno</p>
                <h2 id="fila-passagem-heading" className="mt-1 font-display text-lg font-semibold">Resumo da fila</h2>
                <p className="text-sm text-muted-foreground">Revise o estado atual antes de compartilhar com o próximo turno.</p>
              </div>
              <Button type="button" variant="outline" className="gap-2 rounded-full" onClick={() => void copySummary()}>
                <ClipboardCopy aria-hidden="true" className="h-4 w-4" /> Copiar resumo
              </Button>
            </header>
            <div className="p-4 sm:p-6">
              <Textarea
                aria-label="Resumo operacional da passagem de turno"
                readOnly
                value={summary}
                onFocus={event => event.currentTarget.select()}
                className="min-h-72 resize-y border-0 bg-muted/45 font-mono text-sm leading-6 shadow-none focus-visible:ring-1"
              />
            </div>
          </article>

          <aside className="flex h-fit flex-col gap-4 rounded-2xl border border-primary/15 bg-primary/[0.04] p-5 shadow-sm sm:p-6">
            <div>
              <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <ListTodo aria-hidden="true" className="size-5" />
              </span>
              <h2 className="font-display text-lg font-semibold">Deixe uma pendência para a equipe</h2>
              <p className="mt-1 text-sm text-muted-foreground">A observação e o resumo serão levados para Tarefas, onde você define responsável e prazo.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="passagem-nota">Observação operacional <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Textarea
                id="passagem-nota"
                value={note}
                maxLength={1200}
                onChange={event => setNote(event.target.value)}
                placeholder="Ex.: revisar bloqueios da fila e confirmar retorno com a equipe..."
                rows={5}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">Use este campo para assuntos operacionais. O resumo não inclui nomes nem informações clínicas.</p>
            </div>
            <Button type="button" className="w-full gap-2 rounded-full" onClick={registerTask}>
              Registrar pendência <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          </aside>
        </section>
      )}
    </div>
  );
}
