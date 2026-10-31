import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Star, Play, Trash2, Loader2, Pause, Mail, Clock as ClockIcon, SlidersHorizontal, AlertTriangle, RefreshCw, Plus, CalendarClock, PauseCircle } from 'lucide-react';
import { useState, type ElementType } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { ListSkeleton } from '@/components/ui/loading-skeleton';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { PageHeader } from '@/components/PageHeader';
import { DeleteConfirmDialog } from '@/components/ConfirmDialog';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { cn } from '@/lib/utils';

const FORMATADOR_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function formatarDataHoraSaoPaulo(value?: string | null): string {
  if (!value) return '—';
  const instante = new Date(value);
  return Number.isFinite(instante.getTime()) ? FORMATADOR_DATA_HORA.format(instante) : '—';
}

type FiltroRelatorio = 'todos' | 'agendados' | 'favoritos' | 'pausados';

const INDICADORES: { key: FiltroRelatorio; label: string; legenda: string; icon: ElementType; cor: string }[] = [
  { key: 'todos', label: 'Salvos', legenda: 'todos os relatórios', icon: Star, cor: '' },
  { key: 'agendados', label: 'Agendados', legenda: 'envio automático ativo', icon: CalendarClock, cor: 'bg-primary/10 text-primary' },
  { key: 'favoritos', label: 'Favoritos', legenda: 'sem agendamento', icon: SlidersHorizontal, cor: 'bg-info/10 text-info' },
  { key: 'pausados', label: 'Pausados', legenda: 'agendamento suspenso', icon: PauseCircle, cor: 'bg-warning/10 text-warning' },
];

export default function RelatoriosSalvos() {
  const { user, profile } = useSupabaseAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; nome: string } | null>(null);

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
  const [filtro, setFiltro] = useState<FiltroRelatorio>('todos');
  const contagens: Record<FiltroRelatorio, number> = {
    todos: items.length,
    agendados: items.filter((it: any) => it.frequencia && it.ativo).length,
    favoritos: items.filter((it: any) => !it.frequencia).length,
    pausados: items.filter((it: any) => it.frequencia && !it.ativo).length,
  };
  const visiveis = items.filter((it: any) => (
    filtro === 'todos'
    || (filtro === 'agendados' && it.frequencia && it.ativo)
    || (filtro === 'favoritos' && !it.frequencia)
    || (filtro === 'pausados' && it.frequencia && !it.ativo)
  ));

  const runNow = async (id: string) => {
    setBusyId(id);
    try {
      const { data, error } = await supabase.functions.invoke('scheduled-reports-runner', { body: { id } });
      if (error) throw error;
      const resultado = data?.out?.find((item: any) => item.id === id);
      if (!resultado) throw new Error('O servidor não confirmou a execução deste relatório.');
      if (resultado.skipped === 'sem_permissao_para_fonte') {
        toast.error('Relatório não executado', { description: 'O responsável pelo relatório não tem acesso à fonte de dados selecionada.' });
      } else if (resultado.skipped === 'em_execucao') {
        toast.error('Relatório já está em processamento', { description: 'Aguarde a conclusão da execução atual antes de tentar novamente.' });
      } else if (resultado.skipped) {
        toast.error('Relatório não executado', { description: 'A fonte de dados salva não é válida para este relatório.' });
      } else if (resultado.delivery === 'recipients_invalid') {
        toast.error('Relatório não enviado', { description: 'Um ou mais destinatários foram desativados ou perderam acesso à fonte. Edite a lista antes da próxima execução.' });
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
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    const { data, error } = await (supabase as any).from('relatorios_salvos').delete().eq('id', id).eq('clinica_id', profile.clinica_id).select('id');
    if (error) { toast.error('Não foi possível excluir o relatório.', { description: mensagemDeErro(error) }); return; }
    if (!data?.length) { toast.error('Relatório não encontrado ou sem permissão para excluir.'); return; }
    toast.success('Excluído');
    await qc.invalidateQueries({ queryKey: ['relatorios-salvos'] });
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={'Relat\u00f3rios salvos e agendados'}
        description={items.length > 0
          ? `${items.length} relatório(s) · ${contagens.agendados} agendado(s) · ${contagens.pausados} pausado(s)`
          : 'Reaproveite filtros favoritos e receba relatórios por e-mail automaticamente.'}
        icon={<Star />}
        actions={<>
          <Button
            aria-label="Atualizar relatórios salvos"
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => void itemsQuery.refetch()}
            disabled={itemsQuery.isFetching}
          >
            <RefreshCw className={cn('h-4 w-4', itemsQuery.isFetching && 'animate-spin')} />
          </Button>
          <Button className="gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={() => navigate('/relatorios')}>
            <Plus className="h-4 w-4" /> Novo relatório
          </Button>
        </>}
      />
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {INDICADORES.map(({ key, label, legenda, icon: Icon, cor }) => {
            const destaque = key === 'todos';
            return (
              <button
                key={key}
                type="button"
                aria-pressed={filtro === key}
                onClick={() => setFiltro(key)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  destaque ? 'border-transparent bg-gradient-primary text-white' : 'border-border/60 bg-card',
                  filtro === key && !destaque && 'border-primary ring-1 ring-primary',
                  filtro === key && destaque && 'ring-2 ring-primary/40 ring-offset-2',
                )}
              >
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', destaque ? 'bg-white/20 text-white' : cor)}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-2xl font-bold tabular-nums">{contagens[key]}</span>
                  <span className={cn('block text-[11px]', destaque ? 'text-white/80' : 'text-muted-foreground')}>{label} · {legenda}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardContent className="p-4 sm:p-5">
          {itemsQuery.isError ? (
            <ErrorState compact title="Não foi possível carregar os relatórios salvos" error={itemsQuery.error} onRetry={() => void itemsQuery.refetch()} />
          ) : !profile?.clinica_id ? (
            <ErrorState compact title="Clínica não identificada" description="Os relatórios salvos não podem ser exibidos sem identificar a clínica atual." />
          ) : isLoading ? (
            <ListSkeleton items={3} />
          ) : items.length === 0 ? (
            <ActionableEmptyState
              icon={Star}
              title="Nenhum relatório salvo ainda"
              description="Monte um relatório personalizado para guardar seus filtros como favorito ou programar o envio por e-mail."
              actionLabel="Criar relatório"
              onAction={() => navigate('/relatorios')}
            />
          ) : (
            <div className="space-y-3">
              {items.length >= LIMITE_BUSCA_EM_BLOCOS && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} relatórios salvos. Itens mais antigos podem não aparecer.</p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                {filtro !== 'todos' ? (
                  <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={() => setFiltro('todos')}>Limpar filtros</Button>
                ) : <span />}
                <span className="tabular-nums">{visiveis.length} de {items.length}</span>
              </div>
              {visiveis.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum relatório neste filtro.</p>
              )}
              {visiveis.map((it: any) => (
                <div key={it.id} className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md md:flex-row md:items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{it.nome}</h3>
                      <Badge variant="outline" className="rounded-full border-border text-primary">{it.dataset}</Badge>
                      <Badge variant="secondary" className="rounded-full">{it.frequencia && it.destinatarios?.length ? 'CSV por e-mail' : 'Favorito'}</Badge>
                      {it.frequencia && !it.ativo && <Badge className="rounded-full border-transparent bg-warning/10 text-warning hover:bg-warning/10">Pausado</Badge>}
                      {it.frequencia && <Badge className="rounded-full border-transparent bg-primary/10 text-primary hover:bg-primary/10">{it.frequencia}</Badge>}
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
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-full"
                      onClick={() => navigate('/relatorios', { state: { relatorioSalvo: {
                        id: it.id, user_id: it.user_id, updated_at: it.updated_at, dataset: it.dataset, config: it.config,
                        nome: it.nome, descricao: it.descricao, frequencia: it.frequencia, dia_semana: it.dia_semana,
                        dia_mes: it.dia_mes, hora: it.hora, destinatarios: it.destinatarios, formato: it.formato, ativo: it.ativo,
                      } } })}
                      aria-label={`Abrir filtros do relatório ${it.nome}`}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      <span className="ml-1">Abrir filtros</span>
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 rounded-full" onClick={() => runNow(it.id)} disabled={busyId !== null || !it.destinatarios?.length} title={!it.destinatarios?.length ? 'Adicione destinatários e salve o relatório para enviar' : 'Executar e enviar o CSV agora sem alterar a pausa do agendamento'}>
                      {busyId === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      <span className="ml-1">Executar envio</span>
                    </Button>
                    {it.frequencia && <Button size="sm" variant="outline" className="h-9 w-9 rounded-full p-0" aria-label={`${it.ativo ? 'Pausar' : 'Ativar'} agendamento de ${it.nome}`} title={it.ativo ? 'Pausar agendamento automático' : 'Ativar agendamento automático'} onClick={() => toggleAtivo(it)} disabled={busyId !== null}>
                      {it.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>}
                    <Button size="sm" variant="outline" className="h-9 w-9 rounded-full p-0" aria-label="Excluir relatório salvo" onClick={() => setToDelete({ id: it.id, nome: it.nome })} disabled={busyId !== null}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <DeleteConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => { if (!open) setToDelete(null); }}
        itemName={toDelete?.nome ?? ''}
        onConfirm={() => { if (toDelete) remove(toDelete.id); setToDelete(null); }}
      />
    </div>
  );
}
