import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FlaskConical, Loader2, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { mensagemDeErro } from '@/lib/erros';
import { podeGerenciarLaboratorioPorPapel } from '@/lib/laboratorioWorkflow';
import { supabase } from '@/integrations/supabase/client';

type LaboratorioLocationState = {
  laboratorioSearch?: unknown;
  buscaPaciente?: unknown;
};

export default function LimparFilaAntigaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const routeState = location.state as LaboratorioLocationState | null;
  const returnSearch = typeof routeState?.laboratorioSearch === 'string' && routeState.laboratorioSearch.startsWith('?')
    ? routeState.laboratorioSearch
    : '';
  const returnTo = `/laboratorio${returnSearch}`;
  const returnState = {
    buscaPaciente: typeof routeState?.buscaPaciente === 'string' ? routeState.buscaPaciente : '',
    focusLimparFila: true,
  };
  const voltar = () => navigate(returnTo, { state: returnState });
  const podeGerenciar = podeGerenciarLaboratorioPorPapel(profile?.roles);
  const [dias, setDias] = useState('30');
  const [motivo, setMotivo] = useState('');
  const clinicId = profile?.clinica_id;

  const preview = useQuery({
    queryKey: ['preview-limpar-fila-lab', clinicId, dias],
    enabled: !!clinicId && podeGerenciar && Number.isInteger(Number(dias)) && Number(dias) >= 1,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - Number(dias) * 86400_000).toISOString();
      const { count, error } = await supabase
        .from('coletas_laboratorio')
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', clinicId!)
        .eq('status', 'pendente')
        .lt('created_at', cutoff);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const cleanup = useMutation({
    mutationFn: async () => {
      if (!clinicId || !podeGerenciar) throw new Error('Seu perfil não pode limpar a fila do laboratório.');
      const dayCount = Number(dias);
      if (!Number.isInteger(dayCount) || dayCount < 1) throw new Error('Informe um número inteiro de dias maior que zero.');
      const trimmedReason = motivo.trim();
      if (trimmedReason.length < 5) throw new Error('Informe um motivo com pelo menos 5 caracteres.');
      const { data, error } = await supabase.rpc('cancelar_coletas_pendentes_antigas', {
        p_dias: dayCount,
        p_motivo: trimmedReason,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: async (count) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['coletas-laboratorio', clinicId] }),
        queryClient.invalidateQueries({ queryKey: ['preview-limpar-fila-lab', clinicId] }),
      ]);
      toast.success(count === 0 ? 'Nenhuma coleta precisou ser cancelada' : `${count} coleta(s) cancelada(s)`);
      voltar();
    },
  });

  if (!clinicId) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Cancelar coletas antigas" description="A clínica da sessão não foi identificada." icon={<FlaskConical />} />
        <ErrorState title="Fila indisponível" description="Atualize a sessão antes de revisar ou alterar coletas." />
        <Button variant="outline" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao laboratório</Button>
      </section>
    );
  }

  if (!podeGerenciar) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Cancelar coletas antigas" description="Esta operação exige um perfil autorizado para gestão do laboratório." icon={<FlaskConical />} />
        <Button variant="outline" onClick={voltar}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao laboratório</Button>
      </section>
    );
  }

  const dayCount = Number(dias);
  const validDays = Number.isInteger(dayCount) && dayCount >= 1;
  const canSubmit = validDays && !preview.isLoading && !preview.isError && Boolean(preview.data) && motivo.trim().length >= 5 && !cleanup.isPending;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5" data-testid="lab-bulk-cleanup-page">
      <PageHeader
        title="Cancelar coletas pendentes antigas"
        description="Revise o impacto e registre o motivo antes de remover pendências que não chegaram ao laboratório."
        icon={<FlaskConical />}
        actions={<Button variant="outline" onClick={voltar} className="min-h-10"><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao laboratório</Button>}
      />

      <section aria-labelledby="lab-cleanup-form-heading" className="space-y-5 rounded-lg border bg-card p-4 sm:p-6">
        <div>
          <h2 id="lab-cleanup-form-heading" className="font-semibold">Defina o corte da fila</h2>
          <p className="mt-1 text-sm text-muted-foreground">A contagem é uma prévia. No processamento, só serão canceladas coletas que ainda estejam pendentes e atendam ao mesmo corte.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="lab-cleanup-days">Mais antigas que (dias)</Label>
          <Input
            id="lab-cleanup-days"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={dias}
            onChange={event => {
              setDias(event.target.value);
              cleanup.reset();
            }}
            aria-describedby="lab-cleanup-days-help"
          />
          <p id="lab-cleanup-days-help" className="text-xs text-muted-foreground">O período é contado pela data de criação da coleta.</p>
        </div>

        <div aria-live="polite" className="rounded-md border bg-muted/30 p-4">
          {preview.isLoading && <p role="status" className="text-sm text-muted-foreground">Calculando quantas coletas correspondem ao corte…</p>}
          {preview.isError && <ErrorState compact title="Não foi possível calcular o impacto" error={preview.error} onRetry={() => void preview.refetch()} />}
          {!preview.isLoading && !preview.isError && !validDays && <p className="text-sm text-muted-foreground">Informe um número inteiro de dias maior que zero para calcular a prévia.</p>}
          {!preview.isLoading && !preview.isError && validDays && preview.data === 0 && <p className="text-sm text-muted-foreground">Nenhuma coleta pendente atende a esse corte. Nenhum registro será alterado.</p>}
          {!preview.isLoading && !preview.isError && validDays && Boolean(preview.data) && <p className="text-sm font-medium">{preview.data} coleta(s) pendente(s) da sua clínica correspondem ao corte.</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lab-cleanup-reason">Motivo obrigatório para auditoria</Label>
          <Textarea
            id="lab-cleanup-reason"
            value={motivo}
            onChange={event => {
              setMotivo(event.target.value);
              cleanup.reset();
            }}
            placeholder="Explique por que essas coletas não serão processadas."
            rows={4}
            aria-describedby="lab-cleanup-reason-help"
          />
          <p id="lab-cleanup-reason-help" className="text-xs text-muted-foreground">Mínimo de 5 caracteres. O motivo será registrado na auditoria.</p>
        </div>

        <p role="note" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-muted-foreground">
          A operação considera apenas coletas em <strong>pendente</strong>. Material coletado, em análise, validado ou liberado permanece intacto.
        </p>

        {cleanup.isError && <p role="alert" className="text-sm text-destructive">{mensagemDeErro(cleanup.error)}. Revise a fila e tente novamente; o motivo informado foi mantido.</p>}

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={voltar} disabled={cleanup.isPending}>Cancelar</Button>
          <Button type="button" variant="destructive" onClick={() => cleanup.mutate()} disabled={!canSubmit} className="min-h-10">
            {cleanup.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {cleanup.isPending ? 'Cancelando coletas…' : `Cancelar ${preview.data ?? 0} coleta(s)`}
          </Button>
        </div>
      </section>
    </section>
  );
}
