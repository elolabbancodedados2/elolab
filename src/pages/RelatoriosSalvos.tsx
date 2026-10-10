import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Star, Play, Trash2, Loader2, Pause, Mail, Clock as ClockIcon, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { ListSkeleton } from '@/components/ui/loading-skeleton';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';

const FORMATADOR_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function formatarDataHoraSaoPaulo(value?: string | null): string {
  if (!value) return '—';
  const instante = new Date(value);
  return Number.isFinite(instante.getTime()) ? FORMATADOR_DATA_HORA.format(instante) : '—';
}

export default function RelatoriosSalvos() {
  const { user, profile } = useSupabaseAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const itemsQuery = useQuery({
    queryKey: ['relatorios-salvos', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      return buscarEmBlocos<any>(() => (supabase as any)
        .from('relatorios_salvos')
        .select('*')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true }));
    },
    enabled: !!user && !!profile?.clinica_id,
  });
  const items = itemsQuery.data ?? [];
  const { isLoading } = itemsQuery;

  const runNow = async (id: string) => {
    setBusyId(id);
    try {
      const { data, error } = await supabase.functions.invoke('scheduled-reports-runner', { body: { id } });
      if (error) throw error;
      const resultado = data?.out?.find((item: any) => item.id === id);
      if (!resultado) throw new Error('O servidor não confirmou a execução deste relatório.');
      if (resultado.skipped === 'sem_permissao_para_fonte') {
        toast.error('Relatório não executado', { description: 'O responsável pelo relatório não tem acesso à fonte de dados selecionada.' });
      } else if (resultado.skipped) {
        toast.error('Relatório não executado', { description: 'A fonte de dados salva não é válida para este relatório.' });
      } else if (resultado.delivery === 'not_configured' || !resultado.sent_to) {
        toast.error('Relatório não enviado', { description: 'Confira os destinatários e a configuração de envio de e-mail da clínica.' });
      } else {
        toast.success(`Relatório enviado para ${resultado.sent_to} destinatário(s).`);
      }
      await qc.invalidateQueries({ queryKey: ['relatorios-salvos'] });
    } catch (e: any) { toast.error(e.message || 'Falha ao executar'); }
    finally { setBusyId(null); }
  };

  const toggleAtivo = async (it: any) => {
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    const { data, error } = await (supabase as any)
      .from('relatorios_salvos').update({ ativo: !it.ativo }).eq('id', it.id).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
    if (error) { toast.error('Não foi possível alterar o agendamento do relatório.', { description: mensagemDeErro(error) }); return; }
    if (!data) { toast.error('Relatório não encontrado ou sem permissão para alterar.'); return; }
    await qc.invalidateQueries({ queryKey: ['relatorios-salvos'] });
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este relatório?')) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    const { data, error } = await (supabase as any).from('relatorios_salvos').delete().eq('id', id).eq('clinica_id', profile.clinica_id).select('id');
    if (error) { toast.error('Não foi possível excluir o relatório.', { description: mensagemDeErro(error) }); return; }
    if (!data?.length) { toast.error('Relatório não encontrado ou sem permissão para excluir.'); return; }
    toast.success('Excluído');
    await qc.invalidateQueries({ queryKey: ['relatorios-salvos'] });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" /> Relatórios salvos e agendados
          </CardTitle>
          <CardDescription>
            Reaproveite filtros favoritos e receba relatórios por e-mail automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itemsQuery.isError ? (
            <ErrorState compact title="Não foi possível carregar os relatórios salvos" error={itemsQuery.error} onRetry={() => void itemsQuery.refetch()} />
          ) : !profile?.clinica_id ? (
            <ErrorState compact title="Clínica não identificada" description="Os relatórios salvos não podem ser exibidos sem identificar a clínica atual." />
          ) : isLoading ? (
            <ListSkeleton items={3} />
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum relatório salvo. Vá em <b>Relatórios → Customizado</b> e clique em <b>Salvar / Agendar</b>.
            </div>
          ) : (
            <div className="space-y-3">
              {items.length >= LIMITE_BUSCA_EM_BLOCOS && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} relatórios salvos. Itens mais antigos podem não aparecer.</p>
                </div>
              )}
              {items.map((it: any) => (
                <div key={it.id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3 hover:bg-muted/40">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{it.nome}</h3>
                      <Badge variant="outline">{it.dataset}</Badge>
                      <Badge variant="secondary">{it.frequencia && it.destinatarios?.length ? 'CSV por e-mail' : 'Favorito'}</Badge>
                      {it.frequencia && !it.ativo && <Badge variant="secondary">Pausado</Badge>}
                      {it.frequencia && <Badge className="bg-primary/10 text-primary">{it.frequencia}</Badge>}
                    </div>
                    {it.descricao && <p className="text-sm text-muted-foreground mt-1">{it.descricao}</p>}
                    <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-3">
                      {it.destinatarios?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {it.destinatarios.length} destinatário(s)
                        </span>
                      )}
                      {it.proxima_execucao && (
                        <span className="flex items-center gap-1">
                          <ClockIcon className="h-3 w-3" /> Próxima: {formatarDataHoraSaoPaulo(it.proxima_execucao)}
                        </span>
                      )}
                      {it.ultima_execucao && (
                        <span>Última: {formatarDataHoraSaoPaulo(it.ultima_execucao)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate('/relatorios', { state: { relatorioSalvo: { id: it.id, dataset: it.dataset, config: it.config } } })}
                      aria-label={`Abrir filtros do relatório ${it.nome}`}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      <span className="ml-1">Abrir filtros</span>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => runNow(it.id)} disabled={busyId !== null || !it.destinatarios?.length} title={!it.destinatarios?.length ? 'Adicione destinatários e salve o relatório para enviar' : 'Executar e enviar o CSV agora sem alterar a pausa do agendamento'}>
                      {busyId === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      <span className="ml-1">Executar envio</span>
                    </Button>
                    {it.frequencia && <Button size="sm" variant="outline" aria-label={`${it.ativo ? 'Pausar' : 'Ativar'} agendamento de ${it.nome}`} title={it.ativo ? 'Pausar agendamento automático' : 'Ativar agendamento automático'} onClick={() => toggleAtivo(it)} disabled={busyId !== null}>
                      {it.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>}
                    <Button size="sm" variant="outline" aria-label="Excluir relatório salvo" onClick={() => remove(it.id)} disabled={busyId !== null}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
