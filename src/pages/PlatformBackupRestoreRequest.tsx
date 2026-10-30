import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArchiveRestore, ShieldAlert } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type BackupFile = { name: string; created_at: string; updated_at: string; size_bytes: number };
type RestoreLocationState = { backup?: BackupFile };

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

export default function PlatformBackupRestoreRequest() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const state = location.state as RestoreLocationState | null;
  const backup = state?.backup;
  const completed = useRef(false);
  const submitLock = useRef(false);
  const [reason, setReason] = useState('');

  const request = useMutation({
    mutationFn: async () => {
      if (!backup?.name) throw new Error('Selecione novamente um arquivo de backup na lista.');
      if (reason.trim().length < 20 || reason.trim().length > 1000) throw new Error('A justificativa deve ter entre 20 e 1.000 caracteres.');
      const { error } = await (supabase as any).rpc('platform_request_restore', {
        p_backup_name: backup.name,
        p_reason: reason.trim(),
        p_scope: 'full',
        p_scope_ref: null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      completed.current = true;
      toast.success('Solicitação criada; outro administrador precisa aprová-la.');
      await queryClient.invalidateQueries({ queryKey: ['platform-restores'] });
      navigate('/admin/backups');
    },
    onError: error => toast.error('Solicitação recusada', { description: mensagemDeErro(error) }),
  });

  const send = () => {
    if (submitLock.current || !backup?.name || reason.trim().length < 20 || reason.trim().length > 1000) return;
    submitLock.current = true;
    request.mutate(undefined, { onSettled: () => { submitLock.current = false; } });
  };
  const dirty = reason.trim().length > 0;

  if (!backup?.name) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 pb-10">
        <PageHeader title="Solicitar restauração" icon={<ArchiveRestore />} description="Selecione novamente o arquivo pela lista de backups para iniciar uma solicitação rastreável." />
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>O arquivo não está mais selecionado</AlertTitle>
          <AlertDescription>Por segurança, a seleção do backup fica somente na navegação atual. Volte à lista e abra a solicitação novamente.</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="min-h-11 rounded-full"><Link to="/admin/backups"><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos backups</Link></Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 pb-10">
      <UnsavedChangesGuard dirty={dirty} busy={request.isPending} completed={completed} onDiscard={() => setReason('')} />
      <PageHeader
        title="Solicitar restauração"
        icon={<ArchiveRestore />}
        description="Registre o contexto para revisão independente. Esta solicitação não executa a restauração."
        actions={<Button asChild variant="outline" className="min-h-11 rounded-full"><Link to="/admin/backups"><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos backups</Link></Button>}
      />

      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Ação operacional crítica</AlertTitle>
        <AlertDescription>Outro administrador precisa aprovar a solicitação. A aprovação registra autorização; a restauração ainda deve ser executada e verificada pelo procedimento operacional.</AlertDescription>
      </Alert>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle>Arquivo escolhido</CardTitle>
          <CardDescription>O nome do arquivo fica no estado de navegação e não é colocado na URL nem no armazenamento local.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-muted-foreground">Backup</dt><dd className="mt-1 break-all text-sm font-medium">{backup.name}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Criado em</dt><dd className="mt-1 text-sm">{dateTime(backup.created_at)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Tamanho</dt><dd className="mt-1 text-sm">{Number(backup.size_bytes) ? `${(Number(backup.size_bytes) / 1_048_576).toFixed(1)} MB` : 'Não informado'}</dd></div>
          </dl>

          <div className="space-y-2">
            <Label htmlFor="restore-reason">Justificativa (20 a 1.000 caracteres)</Label>
            <Textarea id="restore-reason" value={reason} maxLength={1000} disabled={request.isPending} onChange={event => setReason(event.target.value)} rows={6} placeholder="Descreva o incidente, o impacto e por que este backup deve ser restaurado." aria-describedby="restore-reason-count" />
            <p id="restore-reason-count" className="text-xs text-muted-foreground">{reason.trim().length}/1.000 caracteres · mínimo de 20</p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button asChild variant="outline" className="min-h-11 rounded-full" disabled={request.isPending}><Link to="/admin/backups">Cancelar</Link></Button>
            <Button className="min-h-11 rounded-full" onClick={send} disabled={request.isPending || reason.trim().length < 20 || reason.trim().length > 1000}>
              {request.isPending ? 'Enviando…' : 'Enviar para aprovação'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
