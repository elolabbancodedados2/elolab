import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, CheckCircle2, DatabaseBackup, FileJson, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

type BackupFile = { name: string; created_at: string; updated_at: string; size_bytes: number };
type BackupLog = { id: string; tipo: string; nome: string; status: string; registros_processados: number | null; registros_sucesso: number | null; registros_erro: number | null; erro_mensagem: string | null; duracao_ms: number | null; created_at: string };
type BackupOverview = { generated_at: string; retention_days: number; backup_schedule: string; verification_schedule: string; files: BackupFile[]; logs: BackupLog[] };

function tamanho(bytes: number) {
  if (!bytes) return 'Tamanho não informado';
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function dataHora(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

function varianteRestauracao(status: string) {
  if (status === 'failed' || status === 'rejected' || status === 'canceled' || status === 'expired') return 'destructive' as const;
  if (status === 'completed') return 'outline' as const;
  return 'secondary' as const;
}

function statusRestauracao(status: string) {
  const labels: Record<string, string> = {
    requested: 'Aguardando aprovação',
    approved: 'Aprovada, aguardando execução',
    rejected: 'Rejeitada',
    executing: 'Em execução',
    completed: 'Concluída',
    failed: 'Falhou',
    canceled: 'Cancelada',
    expired: 'Expirada',
  };
  return labels[status] || status;
}

export default function PlatformBackups() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [restoreDecision, setRestoreDecision] = useState<{ id: string; name: string; reason: string; approve: boolean } | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [somenteErros, setSomenteErros] = useState(false);
  const restoreLock = useRef(false);
  const verifyLock = useRef(false);
  const overview = useQuery({
    queryKey: ['platform-backup-overview'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_get_backup_overview');
      if (error) throw error;
      return data as BackupOverview;
    },
    refetchInterval: 60_000,
  });

  const verificar = async () => {
    if (verifyLock.current) return;
    verifyLock.current = true;
    setVerificando(true);
    const toastId = toast.loading('Verificando o backup mais recente…');
    try {
      const { data, error } = await supabase.functions.invoke('backup-verificar');
      if (error || !data?.ok) {
        toast.error('A verificação encontrou um problema', { description: mensagemDeErro(error || data?.erro) });
      } else if (data?.avisos?.length) {
        toast.warning('Backup conferido com observações', { description: data.avisos.join('; ') });
      } else {
        toast.success('Conferência estrutural do backup concluída');
      }
    } catch (error) {
      toast.error('Não foi possível verificar o backup', { description: mensagemDeErro(error) });
    } finally {
      toast.dismiss(toastId);
      verifyLock.current = false;
      setVerificando(false);
      void overview.refetch();
    }
  };

  const arquivos = overview.data?.files || [];
  const restores = useQuery({
    queryKey: ['platform-restores'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('platform_restore_requests')
        .select('id,backup_name,reason,scope,status,requested_at,requested_by')
        .order('requested_at', { ascending: false }).limit(30);
      if (error) throw error;
      return data as Array<{ id: string; backup_name: string; reason: string; scope: string; status: string; requested_at: string; requested_by: string }>;
    },
    refetchInterval: 60_000,
  });
  const atualizar = () => {
    void overview.refetch();
    void restores.refetch();
  };
  const solicitar = async () => {
    if (restoreLock.current) return;
    if (!restoreTarget || restoreReason.trim().length < 20 || restoreReason.trim().length > 1000) {
      toast.error('A justificativa deve ter entre 20 e 1.000 caracteres.');
      return;
    }
    restoreLock.current = true;
    setRestoreBusy(true);
    try {
      const { error } = await (supabase as any).rpc('platform_request_restore', {
        p_backup_name: restoreTarget,
        p_reason: restoreReason.trim(),
        p_scope: 'full',
        p_scope_ref: null,
      });
      if (error) throw error;
      toast.success('Solicitação criada; outro administrador precisa aprová-la.');
      setRestoreTarget(null);
      setRestoreReason('');
      await queryClient.invalidateQueries({ queryKey: ['platform-restores'] });
    } catch (error) {
      toast.error('Solicitação recusada', { description: mensagemDeErro(error) });
    } finally {
      restoreLock.current = false;
      setRestoreBusy(false);
    }
  };
  const decidir = async () => {
    if (!restoreDecision || restoreLock.current) return;
    restoreLock.current = true;
    setRestoreBusy(true);
    try {
      const { error } = await (supabase as any).rpc('platform_decide_restore', {
        p_id: restoreDecision.id,
        p_approve: restoreDecision.approve,
      });
      if (error) throw error;
      toast.success(restoreDecision.approve ? 'Solicitação aprovada; a restauração ainda precisa ser executada operacionalmente.' : 'Solicitação rejeitada.');
      setRestoreDecision(null);
      await queryClient.invalidateQueries({ queryKey: ['platform-restores'] });
    } catch (error) {
      toast.error('Decisão recusada', { description: mensagemDeErro(error) });
    } finally {
      restoreLock.current = false;
      setRestoreBusy(false);
    }
  };
  const logs = overview.data?.logs || [];
  const ultimoBackup = logs.find((log) => log.tipo === 'backup');
  const ultimaVerificacao = logs.find((log) => log.tipo === 'backup-verificar');
  const backupTimestamp = ultimoBackup ? new Date(ultimoBackup.created_at).getTime() : Number.NaN;
  const verificationTimestamp = ultimaVerificacao ? new Date(ultimaVerificacao.created_at).getTime() : Number.NaN;
  const backupAge = Date.now() - backupTimestamp;
  const backupRecente = ultimoBackup?.status === 'sucesso' && Number.isFinite(backupTimestamp) && backupAge >= 0 && backupAge < 36 * 3_600_000;
  const verificacaoOk = ultimaVerificacao?.status === 'sucesso' && Number.isFinite(verificationTimestamp) && verificationTimestamp >= backupTimestamp;
  const pronto = Boolean(arquivos.length && backupRecente && verificacaoOk);

  const restauracoesPendentes = (restores.data || []).filter((r) => r.status === 'requested').length;
  const logsComErro = logs.filter((log) => log.status === 'erro').length;
  const logsVisiveis = (somenteErros ? logs.filter((log) => log.status === 'erro') : logs).slice(0, 30);
  const descricao = overview.data
    ? `${arquivos.length} arquivos · último backup ${ultimoBackup ? dataHora(ultimoBackup.created_at) : 'nunca executado'} · ${restauracoesPendentes} restaurações aguardando aprovação`
    : 'Integridade, retenção e prontidão para recuperação de desastre.';

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="Backups e Recuperação"
        icon={<DatabaseBackup />}
        description={descricao}
        actions={
          <>
            <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Atualizar dados" onClick={atualizar} disabled={overview.isFetching || restores.isFetching}><RefreshCw className={cn('h-4 w-4', (overview.isFetching || restores.isFetching) && 'animate-spin')} /></Button>
            <Button className="rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={() => void verificar()} disabled={verificando}><CheckCircle2 className="mr-2 h-4 w-4" />{verificando ? 'Verificando…' : 'Verificar agora'}</Button>
          </>
        }
      />

      {overview.isError && (
        <Card className="rounded-2xl border-destructive/30 shadow-xs">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-destructive">Não foi possível consultar o estado dos backups; a prontidão é desconhecida.</p>
            <Button variant="outline" className="rounded-full" onClick={() => void overview.refetch()} disabled={overview.isFetching}>Tentar novamente</Button>
          </CardContent>
        </Card>
      )}

      {overview.isLoading && <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="flex items-center gap-4 pt-6"><Skeleton className="h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-full max-w-lg" /></div></CardContent></Card>}
      {!overview.isLoading && !overview.isError && <Card className={cn('rounded-2xl shadow-xs', pronto ? 'border-success/40' : 'border-destructive/40')}>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', pronto ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>{pronto ? <CheckCircle2 className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}</span>
          <div className="min-w-0 flex-1"><p className="font-semibold">{pronto ? 'Backup recente conferido' : 'Atenção necessária'}</p><p className="text-sm text-muted-foreground">{pronto ? 'Há um arquivo recente e uma conferência estrutural aprovada depois dele. Isso não substitui um teste real de restauração.' : 'Confira se o backup mais recente foi concluído e verificado depois da execução.'}</p></div>
          <Badge variant={pronto ? 'outline' : 'destructive'} className="rounded-full">{pronto ? 'Conferido' : 'Risco'}</Badge>
        </CardContent>
      </Card>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicadores de backup">
        <Card className="rounded-2xl border-transparent bg-gradient-primary text-white shadow-xs"><CardContent className="space-y-2 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><FileJson className="h-5 w-5" /></span><p className="text-2xl font-bold tabular-nums">{overview.isLoading ? '…' : overview.isError ? '—' : arquivos.length}</p><p className="text-[11px] text-white/75">Arquivos listados · {overview.isError ? 'indisponível' : `até 90 mais recentes · retenção configurada: ${overview.data?.retention_days ?? 90} dias`}</p></CardContent></Card>
        <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="space-y-2 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1080CA]/10 text-[#1080CA]"><DatabaseBackup className="h-5 w-5" /></span><p className="font-semibold">{overview.isLoading ? 'Carregando…' : overview.isError ? 'Indisponível' : overview.data?.backup_schedule || 'Não informado'}</p><p className="text-[11px] text-muted-foreground">Backup automático · {overview.isLoading ? 'Consultando histórico' : overview.isError ? 'indisponível' : ultimoBackup ? dataHora(ultimoBackup.created_at) : 'Nunca executado'}</p></CardContent></Card>
        <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="space-y-2 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1080CA]/10 text-[#1080CA]"><CheckCircle2 className="h-5 w-5" /></span><p className="font-semibold">{overview.isLoading ? 'Carregando…' : overview.isError ? 'Indisponível' : overview.data?.verification_schedule || 'Não informado'}</p><p className="text-[11px] text-muted-foreground">Verificação automática · {overview.isLoading ? 'Consultando histórico' : overview.isError ? 'indisponível' : ultimaVerificacao ? dataHora(ultimaVerificacao.created_at) : 'Nunca executada'}</p></CardContent></Card>
        <Card className={cn('rounded-2xl border-border/60 shadow-xs', restauracoesPendentes > 0 && 'border-warning/40')}><CardContent className="space-y-2 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning"><ArchiveRestore className="h-5 w-5" /></span><p className="text-2xl font-bold tabular-nums">{restores.isLoading ? '…' : restores.isError ? '—' : restauracoesPendentes}</p><p className="text-[11px] text-muted-foreground">Restaurações aguardando aprovação</p></CardContent></Card>
      </section>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader><CardTitle>Arquivos privados recentes</CardTitle><CardDescription>Somente metadados operacionais; o conteúdo clínico nunca é exposto ao navegador.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {overview.isLoading ? <Skeleton className="h-24 w-full rounded-xl" /> : arquivos.slice(0, 15).map((arquivo) => <div key={arquivo.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-3"><div className="min-w-0"><p className="flex items-center gap-2 break-all text-sm font-medium"><FileJson className="h-4 w-4 shrink-0 text-[#1080CA]" />{arquivo.name}</p><p className="text-xs text-muted-foreground">{dataHora(arquivo.created_at)}</p></div><div className="flex flex-wrap gap-2"><Badge variant="secondary" className="rounded-full">{tamanho(Number(arquivo.size_bytes))}</Badge><Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled={restoreBusy} onClick={()=>{setRestoreTarget(arquivo.name);setRestoreReason('')}}>Solicitar restauração</Button></div></div>)}
          {!overview.isLoading && !overview.isError && !arquivos.length && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><DatabaseBackup className="h-6 w-6" /></span>
              <p className="font-medium text-foreground">Nenhum arquivo de backup encontrado.</p>
              <p className="text-sm text-muted-foreground">Confira o agendamento do backup automático e use “Verificar agora” após a próxima execução.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><CardTitle>Restaurações controladas</CardTitle><CardDescription>Exigem justificativa e aprovação por um segundo administrador. A aprovação registra a autorização; a restauração ainda precisa ser executada operacionalmente.</CardDescription></CardHeader><CardContent className="space-y-2">{restores.isError&&<div className="flex items-center justify-between gap-2 text-sm text-destructive"><span>Não foi possível carregar as solicitações.</span><Button variant="link" className="h-auto p-0" onClick={()=>void restores.refetch()}>Tentar novamente</Button></div>}{restores.isLoading&&<p className="py-4 text-center text-sm text-muted-foreground">Carregando solicitações…</p>}{(restores.data||[]).map(r=><div key={r.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-3', r.status==='requested'&&'border-[#1080CA]/30 bg-[#F3F8FC]')}><div className="min-w-0"><p className="break-all text-sm font-medium">{r.backup_name}</p><p className="text-xs text-muted-foreground">{r.reason} · {dataHora(r.requested_at)}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant={varianteRestauracao(r.status)} className="rounded-full">{statusRestauracao(r.status)}</Badge>{r.status==='requested'&&r.requested_by===user?.id&&<span className="text-xs text-muted-foreground">Aguardando outro administrador</span>}{r.status==='requested'&&r.requested_by!==user?.id&&<><Button size="sm" variant="ghost" className="h-9 rounded-full text-xs text-destructive hover:text-destructive" disabled={restoreBusy} onClick={()=>setRestoreDecision({id:r.id,name:r.backup_name,reason:r.reason,approve:false})}>Rejeitar</Button><Button size="sm" className="h-9 rounded-full bg-gradient-primary text-xs text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" disabled={restoreBusy} onClick={()=>setRestoreDecision({id:r.id,name:r.backup_name,reason:r.reason,approve:true})}>Aprovar</Button></>}</div></div>)}{restores.data?.length===30&&<p role="status" className="text-xs text-muted-foreground">Mostrando as 30 solicitações mais recentes.</p>}{!restores.isLoading&&!restores.isError&&!restores.data?.length&&<p className="py-4 text-center text-sm text-muted-foreground">Nenhuma restauração solicitada.</p>}</CardContent></Card>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Histórico operacional</CardTitle>
          <div className="flex items-center gap-2">
            {[['Todos', false], [`Com erro (${logsComErro})`, true]].map(([label, value]) => (
              <button key={String(value)} type="button" aria-pressed={somenteErros === value} onClick={() => setSomenteErros(value as boolean)} className={cn('h-8 rounded-full border px-3 text-xs font-medium transition-colors', somenteErros === value ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-[#DCE6F2] bg-card hover:border-[#9CC7EC]')}>{label}</button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.isLoading ? <Skeleton className="h-32 w-full rounded-xl" /> : logsVisiveis.map((log) => <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-3"><div className="min-w-0"><p className="flex items-center gap-2 text-sm font-medium"><ArchiveRestore className="h-4 w-4 shrink-0 text-[#1080CA]" />{log.nome}</p><p className="break-words text-xs text-muted-foreground">{log.erro_mensagem || `${log.registros_sucesso || log.registros_processados || 0} registros processados`} · {dataHora(log.created_at)}{log.duracao_ms ? ` · ${(log.duracao_ms / 1000).toFixed(1)}s` : ''}</p></div><Badge variant={log.status === 'erro' ? 'destructive' : 'outline'} className="rounded-full">{log.status}</Badge></div>)}
          {!overview.isLoading && !overview.isError && !logs.length && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma execução registrada.</p>}
          {!overview.isLoading && somenteErros && logs.length > 0 && !logsComErro && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma execução com erro entre as registradas.</p>}
        </CardContent>
      </Card>

      {overview.data?.generated_at && <p className="text-right text-xs text-muted-foreground">Estado consultado em {dataHora(overview.data.generated_at)}</p>}

      <Dialog open={!!restoreTarget} onOpenChange={open => { if (!open && !restoreBusy) setRestoreTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar restauração</DialogTitle>
            <DialogDescription>Backup: {restoreTarget}. A solicitação será analisada por outro administrador; ela não executa a restauração agora.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="restore-reason">Justificativa (20 a 1.000 caracteres)</Label>
            <Textarea id="restore-reason" value={restoreReason} maxLength={1000} disabled={restoreBusy} onChange={event => setRestoreReason(event.target.value)} rows={4} placeholder="Descreva o incidente e por que este backup deve ser restaurado." />
            <p className="text-xs text-muted-foreground">{restoreReason.trim().length}/1.000 caracteres</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setRestoreTarget(null)} disabled={restoreBusy}>Cancelar</Button>
            <Button className="rounded-full bg-gradient-primary text-white hover:brightness-110" onClick={() => void solicitar()} disabled={restoreBusy || restoreReason.trim().length < 20 || restoreReason.trim().length > 1000}>{restoreBusy ? 'Enviando…' : 'Enviar para aprovação'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!restoreDecision} onOpenChange={open => { if (!open && !restoreBusy) setRestoreDecision(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{restoreDecision?.approve ? 'Aprovar restauração?' : 'Rejeitar restauração?'}</AlertDialogTitle>
            <AlertDialogDescription>
              Backup: {restoreDecision?.name}. Justificativa: {restoreDecision?.reason}
              {restoreDecision?.approve && ' A aprovação registra a autorização, mas não inicia a restauração.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreBusy}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={event => { event.preventDefault(); void decidir(); }} disabled={restoreBusy} className={restoreDecision?.approve ? undefined : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}>
              {restoreBusy ? 'Salvando…' : restoreDecision?.approve ? 'Confirmar aprovação' : 'Confirmar rejeição'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
