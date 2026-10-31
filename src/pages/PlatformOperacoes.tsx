import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, Flag, Lock, Plus, RefreshCw, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';

type OperationalChange = {
  field: 'somente_leitura' | 'bloqueio_emergencial';
  value: boolean;
  title: string;
  description: string;
};

export default function PlatformOperacoes() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const changeLock = useRef(false);
  const createFlagLock = useRef(false);
  const [nome, setNome] = useState('');
  const [chave, setChave] = useState('');
  const [pendingChange, setPendingChange] = useState<OperationalChange | null>(null);
  const [savingChange, setSavingChange] = useState(false);
  const [creatingFlag, setCreatingFlag] = useState(false);

  const estado = useQuery({
    queryKey: ['platform-operational-state'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('platform_operational_state')
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
  });

  const flags = useQuery({
    queryKey: ['platform-flags'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('platform_feature_flags')
        .select('*')
        .order('nome');
      if (error) throw error;
      return data || [];
    },
  });
  const refreshing = estado.isFetching || flags.isFetching;

  const confirmarMudanca = async () => {
    if (changeLock.current || !pendingChange) return;
    changeLock.current = true;
    setSavingChange(true);
    try {
      const { data, error } = await (supabase as any)
        .from('platform_operational_state')
        .update({
          [pendingChange.field]: pendingChange.value,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', true)
        .eq(pendingChange.field, !pendingChange.value)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        await Promise.all([
          estado.refetch(),
          queryClient.invalidateQueries({ queryKey: ['estado-operacional'] }),
        ]);
        throw new Error('O estado mudou desde a confirmação. Confira o valor atual antes de tentar novamente.');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-operational-state'] }),
        queryClient.invalidateQueries({ queryKey: ['estado-operacional'] }),
      ]);
      toast.success(pendingChange.value ? 'Modo operacional ativado.' : 'Modo operacional desativado.');
      setPendingChange(null);
    } catch (error) {
      toast.error('Não foi possível alterar o modo operacional.', { description: mensagemDeErro(error) });
    } finally {
      changeLock.current = false;
      setSavingChange(false);
    }
  };

  const criar = async () => {
    if (createFlagLock.current) return;
    const nomeLimpo = nome.trim();
    const chaveLimpa = chave.trim();
    if (!nomeLimpo || !/^[a-z0-9_]+$/.test(chaveLimpa)) {
      toast.error('Informe um nome e uma chave válida usando letras minúsculas, números e _ .');
      return;
    }

    createFlagLock.current = true;
    setCreatingFlag(true);
    try {
      const { error } = await (supabase as any)
        .from('platform_feature_flags')
        .insert({ nome: nomeLimpo, chave: chaveLimpa, updated_by: user?.id });
      if (error) throw error;

      setNome('');
      setChave('');
      await queryClient.invalidateQueries({ queryKey: ['platform-flags'] });
      toast.success('Flag cadastrada. Ela ainda precisa ser conectada ao módulo correspondente no código.');
    } catch (error) {
      toast.error('Não foi possível criar a flag.', { description: mensagemDeErro(error) });
    } finally {
      createFlagLock.current = false;
      setCreatingFlag(false);
    }
  };

  const solicitarMudanca = (change: OperationalChange) => {
    if (change.value) {
      setPendingChange(change);
      return;
    }
    setPendingChange(change);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controle Operacional"
        icon={<Settings2 />}
        description={estado.data
          ? `Somente leitura ${estado.data.somente_leitura ? 'ativado' : 'desativado'} · bloqueio emergencial ${estado.data.bloqueio_emergencial ? 'ativado' : 'desativado'}${flags.data ? ` · ${flags.data.length} feature flags cadastradas` : ''}. Mudanças de impacto exigem confirmação e ficam registradas na auditoria.`
          : 'Controles globais da plataforma. Mudanças de impacto exigem confirmação e ficam registradas na auditoria.'}
        actions={<>
          <Button asChild variant="outline" className="rounded-full gap-2"><Link to="/admin/incidentes"><AlertTriangle className="h-4 w-4" />Incidentes</Link></Button>
          <Button asChild variant="outline" className="rounded-full gap-2"><Link to="/admin/saude"><Activity className="h-4 w-4" />Saúde da plataforma</Link></Button>
          <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Atualizar" onClick={() => { void estado.refetch(); void flags.refetch(); }} disabled={refreshing}>
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
        </>}
      />

      {estado.isError && (
        <Card className="rounded-2xl border-destructive/30 shadow-xs">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-destructive">Não foi possível carregar o estado operacional. Os controles estão desativados.</p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => void estado.refetch()} disabled={estado.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${estado.isFetching ? 'animate-spin' : ''}`} />Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}
      {estado.isLoading && <p className="text-sm text-muted-foreground">Consultando os controles globais; os switches ficam desativados até a resposta chegar.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className={cn('rounded-2xl border-border/60 shadow-xs', estado.data?.somente_leitura && 'border-warning/50 bg-warning/5')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-warning/10 text-warning"><Lock className="h-4 w-4" /></span>
              Modo somente leitura
              {estado.data?.somente_leitura && <Badge variant="outline" className="rounded-full border-warning/40 text-warning">Ativo</Badge>}
            </CardTitle>
            <CardDescription>Suspende gravações clínicas e financeiras em todas as clínicas.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="platform-read-only">Ativar modo somente leitura</Label>
            <Switch
              id="platform-read-only"
              checked={!!estado.data?.somente_leitura}
              disabled={!estado.data || savingChange}
              onCheckedChange={value => solicitarMudanca({
                field: 'somente_leitura',
                value,
                title: value ? 'Ativar modo somente leitura?' : 'Desativar modo somente leitura?',
                description: value
                  ? 'Todas as clínicas deixarão de poder gravar alterações clínicas e financeiras até que esse modo seja desativado.'
                  : 'As clínicas voltarão a poder gravar alterações clínicas e financeiras.',
              })}
            />
          </CardContent>
        </Card>

        <Card className={cn('rounded-2xl border-destructive/30 shadow-xs', estado.data?.bloqueio_emergencial && 'border-destructive/60 bg-destructive/5')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="h-4 w-4" /></span>
              Bloqueio emergencial
              {estado.data?.bloqueio_emergencial && <Badge variant="destructive" className="rounded-full">Ativo</Badge>}
            </CardTitle>
            <CardDescription>Bloqueia o acesso de todas as clínicas à plataforma.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Label htmlFor="platform-emergency-lock">Bloquear todas as clínicas</Label>
            <Switch
              id="platform-emergency-lock"
              checked={!!estado.data?.bloqueio_emergencial}
              disabled={!estado.data || savingChange}
              onCheckedChange={value => solicitarMudanca({
                field: 'bloqueio_emergencial',
                value,
                title: value ? 'Bloquear o acesso de todas as clínicas?' : 'Liberar o acesso de todas as clínicas?',
                description: value
                  ? 'Todos os usuários das clínicas perderão acesso ao EloLab. Use somente durante um incidente que exija bloqueio global.'
                  : 'Os usuários das clínicas poderão voltar a acessar o EloLab.',
              })}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle>Nova feature flag</CardTitle>
          <CardDescription>As chaves aceitam letras minúsculas, números e sublinhado. O cadastro não altera o app até um módulo consumir essa chave.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input className="h-10 w-full rounded-full sm:max-w-xs" aria-label="Nome do recurso" value={nome} disabled={creatingFlag} onChange={event => setNome(event.target.value)} placeholder="Nome do recurso" />
          <Input className="h-10 w-full rounded-full font-mono text-sm sm:max-w-xs" aria-label="Chave do recurso" value={chave} disabled={creatingFlag} onChange={event => setChave(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="chave_do_recurso" />
          <Button className="h-10 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={() => void criar()} disabled={!nome.trim() || !chave.trim() || creatingFlag}>{creatingFlag ? 'Salvando…' : <><Plus className="mr-2 h-4 w-4" />Cadastrar flag</>}</Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">Catálogo de feature flags{flags.data && <Badge variant="outline" className="rounded-full border-border text-primary">{flags.data.length}</Badge>}</CardTitle>
          <CardDescription>Estas chaves ainda não são consumidas por telas ou permissões do app. O estado é apenas informativo e não libera nem oculta funcionalidades.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {flags.isError && <p className="text-sm text-destructive">Não foi possível carregar as flags. <Button variant="link" className="h-auto p-0" onClick={() => void flags.refetch()}>Tentar novamente</Button></p>}
          {flags.isLoading && <p className="text-sm text-muted-foreground">Carregando recursos…</p>}
          {flags.data?.map((flag: any) => (
              <div key={flag.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
                <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><b>{flag.nome}</b><span className="text-xs text-muted-foreground">Sem consumidor no app</span></div>
                <p className="break-all text-xs text-muted-foreground">{flag.chave} · {flag.percentual}% · {flag.destino}</p>
              </div>
              <Badge variant="outline" className={cn('rounded-full', flag.ativo && 'border-border bg-secondary text-primary')}>{flag.ativo ? 'Ativa no cadastro' : 'Inativa no cadastro'}</Badge>
            </div>
          ))}
          {!flags.isLoading && !flags.isError && flags.data?.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><Flag className="h-6 w-6" /></span>
              <p className="text-sm text-muted-foreground">Nenhum recurso controlado ainda.</p>
              <p className="text-xs text-muted-foreground">Cadastre a primeira chave no formulário acima.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingChange} onOpenChange={open => { if (!open && !savingChange) setPendingChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingChange?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingChange?.description} Confirme somente se essa mudança foi planejada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingChange}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={event => { event.preventDefault(); void confirmarMudanca(); }} disabled={savingChange}>
              {savingChange ? 'Salvando…' : 'Confirmar mudança'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
