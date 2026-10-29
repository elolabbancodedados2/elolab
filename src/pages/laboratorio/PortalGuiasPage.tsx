import { useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Copy, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

const FORMATADOR_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const FORMATADOR_DATA_HORA_LONGA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function formatarDataHoraSaoPaulo(value?: string | null, longo = false): string {
  if (!value) return '—';
  const instante = new Date(value);
  if (!Number.isFinite(instante.getTime())) return '—';
  return (longo ? FORMATADOR_DATA_HORA_LONGA : FORMATADOR_DATA_HORA).format(instante);
}

export default function PortalGuiasPage() {
  const { profile, user } = useSupabaseAuth();
  return <PortalGuiasWorkspace key={profile?.clinica_id ?? ''} clinicaId={profile?.clinica_id} userId={user?.id} />;
}

function PortalGuiasWorkspace({ clinicaId, userId }: { clinicaId?: string | null; userId?: string }) {
  const { profile } = useSupabaseAuth();
  const location = useLocation();
  const completed = useRef(false);
  const queryClient = useQueryClient();
  const [descricao, setDescricao] = useState('');

  const { data: tokens = [], isLoading, error: tokensError, refetch: refetchTokens } = useQuery({
    queryKey: ['portal_guias_tokens', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('portal_guias_tokens')
        .select('*')
        .eq('clinica_id', clinicaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const criarToken = useMutation({
    mutationFn: async () => {
      if (!clinicaId || !userId) throw new Error('Clínica ou usuário não identificado. Atualize a sessão e tente novamente.');
      const { error } = await (supabase as any).from('portal_guias_tokens').insert({
        clinica_id: clinicaId, descricao: descricao.trim() || null, criado_por: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => { setDescricao(''); queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }); toast.success('Link gerado'); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: any) => {
      if (!clinicaId) throw new Error('Clínica não identificada.');
      const { data, error } = await (supabase as any).from('portal_guias_tokens').update({ ativo })
        .eq('id', id).eq('clinica_id', clinicaId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este link não pertence à clínica atual ou já foi removido.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }),
    onError: (error: any) => toast.error('Não foi possível atualizar o link', { description: error.message }),
  });

  const deletarToken = useMutation({
    mutationFn: async (id: string) => {
      if (!clinicaId) throw new Error('Clínica não identificada.');
      const { data, error } = await (supabase as any).from('portal_guias_tokens').delete()
        .eq('id', id).eq('clinica_id', clinicaId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este link não pertence à clínica atual ou já foi removido.');
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }); toast.success('Removido'); },
    onError: (error: any) => toast.error('Não foi possível remover o link', { description: error.message }),
  });

  const copiarLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar automaticamente. Selecione e copie o endereço manualmente.');
    }
  };

  const baseUrl = window.location.origin;

  const busy = criarToken.isPending || toggleAtivo.isPending || deletarToken.isPending;
  return <div className="mx-auto max-w-5xl space-y-6 pb-24 lg:pb-8">
    <UnsavedChangesGuard dirty={!!descricao.trim()} busy={busy} completed={completed} />
    <PageHeader title="Portal externo de guias" icon={<Link2 className="h-5 w-5" />} description="Gerencie os links usados por médicos e clínicas externas para enviar guias sem login." actions={<Button asChild variant="outline"><Link to="/guias-externas" state={{ guiaFilters: location.state?.guiaFilters }}>Voltar às guias</Link></Button>} />
    <fieldset className="min-w-0 space-y-6" disabled={busy} aria-busy={busy}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end border-b pb-6">
          <div className="min-w-0 flex-1">
            <Label htmlFor="portal-guias-descricao">Descrição (opcional)</Label>
            <Input id="portal-guias-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Dr. José — Clínica Vida" />
          </div>
          <Button onClick={() => criarToken.mutate()} disabled={criarToken.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" /> Gerar link
          </Button>
        </div>

        <div className="divide-y">
          {isLoading ? <Skeleton className="h-20 w-full" /> :
            tokensError ? <ErrorState compact error={tokensError} onRetry={() => void refetchTokens()} /> :
            tokens.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum link gerado.</p> :
            tokens.map((t: any) => {
              const url = `${baseUrl}/portal-guias/${t.token}`;
              return (
                <section key={t.id} aria-label={t.descricao || 'Link genérico'}>
                  <CardContent className="px-0 py-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{t.descricao || 'Link genérico'}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.ativo ? 'Ativo · ' : 'Inativo · '}{t.ultimo_uso ? `Último uso: ${formatarDataHoraSaoPaulo(t.ultimo_uso)}` : 'Nunca usado'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch aria-label={`${t.ativo ? 'Desativar' : 'Ativar'} link ${t.descricao || 'genérico'}`} checked={t.ativo} disabled={toggleAtivo.isPending || deletarToken.isPending} onCheckedChange={(v) => toggleAtivo.mutate({ id: t.id, ativo: v })} />
                        {profile?.roles?.includes('admin') && (
                          <Button aria-label={`Excluir link ${t.descricao || 'genérico'}`} size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={toggleAtivo.isPending || deletarToken.isPending} onClick={() => deletarToken.mutate(t.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input aria-label={`Link do portal externo: ${t.descricao || 'genérico'}`} value={url} readOnly className="text-xs font-mono" />
                      <Button aria-label="Copiar link da guia" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => void copiarLink(url)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </section>
              );
            })
          }
        </div>
      </fieldset>
  </div>;
}
