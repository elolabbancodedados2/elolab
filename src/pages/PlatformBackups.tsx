import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, CheckCircle2, DatabaseBackup, FileJson, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type BackupFile = { name: string; created_at: string; updated_at: string; size_bytes: number };
type BackupLog = { id: string; tipo: string; nome: string; status: string; registros_processados: number | null; registros_sucesso: number | null; registros_erro: number | null; erro_mensagem: string | null; duracao_ms: number | null; created_at: string };
type BackupOverview = { generated_at: string; retention_days: number; backup_schedule: string; verification_schedule: string; files: BackupFile[]; logs: BackupLog[] };

function tamanho(bytes: number) {
  if (!bytes) return 'Tamanho não informado';
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export default function PlatformBackups() {
  const queryClient = useQueryClient();
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
    const toastId = toast.loading('Verificando o backup mais recente…');
    const { data, error } = await supabase.functions.invoke('backup-verificar');
    toast.dismiss(toastId);
    if (error || !data?.ok) {
      toast.error('A verificação encontrou um problema', { description: mensagemDeErro(error || data?.erro) });
    } else {
      toast.success('Backup íntegro e verificável');
    }
    overview.refetch();
  };

  const arquivos = overview.data?.files || [];
  const restores = useQuery({ queryKey:['platform-restores'], queryFn: async()=>{ const {data,error}=await (supabase as any).from('platform_restore_requests').select('*').order('requested_at',{ascending:false}).limit(30); if(error) throw error; return data as Array<{id:string;backup_name:string;reason:string;scope:string;status:string;requested_at:string}>; } });
  const solicitar = async (name:string) => { const reason=window.prompt('Justifique a restauração (mínimo de 20 caracteres):'); if(!reason)return; const{error}=await(supabase as any).rpc('platform_request_restore',{p_backup_name:name,p_reason:reason,p_scope:'full',p_scope_ref:null}); if(error)return toast.error('Solicitação recusada',{description:error.message});toast.success('Solicitação criada; outro administrador deve aprovar');queryClient.invalidateQueries({queryKey:['platform-restores']}); };
  const decidir = async(id:string,approve:boolean)=>{const{error}=await(supabase as any).rpc('platform_decide_restore',{p_id:id,p_approve:approve});if(error)return toast.error('Decisão recusada',{description:error.message});toast.success(approve?'Restauração aprovada para execução operacional':'Solicitação rejeitada');queryClient.invalidateQueries({queryKey:['platform-restores']});};
  const logs = overview.data?.logs || [];
  const ultimoBackup = logs.find((log) => log.tipo === 'backup');
  const ultimaVerificacao = logs.find((log) => log.tipo === 'backup-verificar');
  const backupRecente = ultimoBackup && Date.now() - new Date(ultimoBackup.created_at).getTime() < 36 * 3_600_000;
  const verificacaoOk = ultimaVerificacao?.status === 'sucesso';
  const pronto = Boolean(arquivos.length && backupRecente && verificacaoOk);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><DatabaseBackup /> Backups e Recuperação</h1><p className="text-muted-foreground">Integridade, retenção e prontidão para recuperação de desastre.</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => overview.refetch()}><RefreshCw className={`mr-2 h-4 w-4 ${overview.isFetching ? 'animate-spin' : ''}`} />Atualizar</Button>
          <Button onClick={verificar}><CheckCircle2 className="mr-2 h-4 w-4" />Verificar agora</Button>
        </div>
      </div>

      <Card className={pronto ? 'border-success/40' : 'border-destructive/40'}>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          {pronto ? <CheckCircle2 className="h-10 w-10 text-success" /> : <ShieldAlert className="h-10 w-10 text-destructive" />}
          <div className="flex-1"><p className="font-semibold">{pronto ? 'Recuperação protegida' : 'Atenção necessária'}</p><p className="text-sm text-muted-foreground">{pronto ? 'Há backup recente, arquivo privado e verificação aprovada.' : 'Confira a execução e a verificação mais recentes abaixo.'}</p></div>
          <Badge variant={pronto ? 'outline' : 'destructive'}>{pronto ? 'Saudável' : 'Risco'}</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Arquivos retidos</p><p className="text-2xl font-bold">{arquivos.length}</p><p className="text-xs text-muted-foreground">por {overview.data?.retention_days || 90} dias</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Backup automático</p><p className="font-semibold">{overview.data?.backup_schedule || '03:00 diariamente'}</p><p className="text-xs text-muted-foreground">{ultimoBackup ? new Date(ultimoBackup.created_at).toLocaleString('pt-BR') : 'Nunca executado'}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Verificação automática</p><p className="font-semibold">{overview.data?.verification_schedule || '03:30 diariamente'}</p><p className="text-xs text-muted-foreground">{ultimaVerificacao ? new Date(ultimaVerificacao.created_at).toLocaleString('pt-BR') : 'Nunca executada'}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Arquivos privados recentes</CardTitle><CardDescription>Somente metadados operacionais; o conteúdo clínico nunca é exposto ao navegador.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {arquivos.slice(0, 15).map((arquivo) => <div key={arquivo.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="flex items-center gap-2 text-sm font-medium"><FileJson className="h-4 w-4" />{arquivo.name}</p><p className="text-xs text-muted-foreground">{new Date(arquivo.created_at).toLocaleString('pt-BR')}</p></div><div className="flex gap-2"><Badge variant="secondary">{tamanho(Number(arquivo.size_bytes))}</Badge><Button size="sm" variant="outline" onClick={()=>solicitar(arquivo.name)}><ArchiveRestore className="mr-1 h-3 w-3"/>Solicitar restauração</Button></div></div>)}
          {!arquivos.length && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum arquivo de backup encontrado.</p>}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Restaurações controladas</CardTitle><CardDescription>Exigem justificativa e aprovação por um segundo administrador. A execução ocorre somente no ambiente operacional protegido.</CardDescription></CardHeader><CardContent className="space-y-2">{(restores.data||[]).map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="text-sm font-medium">{r.backup_name}</p><p className="text-xs text-muted-foreground">{r.reason} · {new Date(r.requested_at).toLocaleString('pt-BR')}</p></div><div className="flex gap-2"><Badge variant={r.status==='rejected'?'destructive':'outline'}>{r.status}</Badge>{r.status==='requested'&&<><Button size="sm" variant="outline" onClick={()=>decidir(r.id,false)}>Rejeitar</Button><Button size="sm" onClick={()=>decidir(r.id,true)}>Aprovar</Button></>}</div></div>)}{!restores.data?.length&&<p className="py-4 text-center text-sm text-muted-foreground">Nenhuma restauração solicitada.</p>}</CardContent></Card>

      <Card>
        <CardHeader><CardTitle>Histórico operacional</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {logs.slice(0, 30).map((log) => <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="flex items-center gap-2 text-sm font-medium"><ArchiveRestore className="h-4 w-4" />{log.nome}</p><p className="text-xs text-muted-foreground">{log.erro_mensagem || `${log.registros_sucesso || log.registros_processados || 0} registros processados`} · {new Date(log.created_at).toLocaleString('pt-BR')}{log.duracao_ms ? ` · ${(log.duracao_ms / 1000).toFixed(1)}s` : ''}</p></div><Badge variant={log.status === 'erro' ? 'destructive' : 'outline'}>{log.status}</Badge></div>)}
          {!logs.length && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma execução registrada.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
