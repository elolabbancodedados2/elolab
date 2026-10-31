import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Copy, Mail, RefreshCw, CheckCircle2, Clock, XCircle, Loader2, Ban, AlertTriangle, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { mensagemDeErro, detalheTecnico } from '@/lib/erros';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { cn } from '@/lib/utils';

type InviteStatus = 'aceito' | 'expirado' | 'pendente';

interface Invite {
  id: string;
  source: 'convites_funcionario' | 'employee_invitations';
  email: string;
  nome: string | null;
  roles: string[];
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  status: InviteStatus;
  /** Só em employee_invitations. O reenvio precisa dele. */
  funcionario_id?: string | null;
  clinica_id?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  medico: 'Médico',
  recepcao: 'Recepção',
  enfermagem: 'Enfermagem',
  financeiro: 'Financeiro',
};

function computeStatus(row: { accepted_at: string | null; expires_at: string }): InviteStatus {
  if (row.accepted_at) return 'aceito';
  if (new Date(row.expires_at) < new Date()) return 'expirado';
  return 'pendente';
}

function buildInviteUrl(token: string) {
  return `${window.location.origin}/aceitar-convite?token=${encodeURIComponent(token)}`;
}

function StatusBadge({ status }: { status: InviteStatus }) {
  if (status === 'aceito')
    return (
      <Badge className="gap-1 rounded-full border-success/30 bg-success/10 text-success-foreground hover:bg-success/10">
        <CheckCircle2 className="h-3 w-3" /> Aceito
      </Badge>
    );
  if (status === 'expirado')
    return (
      <Badge variant="destructive" className="gap-1 rounded-full">
        <XCircle className="h-3 w-3" /> Expirado
      </Badge>
    );
  return (
    <Badge className="gap-1 rounded-full border-warning/30 bg-warning/10 text-warning-foreground hover:bg-warning/10">
      <Clock className="h-3 w-3" /> Pendente
    </Badge>
  );
}

export function ConvitesList() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { profile, isPlatformAdmin } = useSupabaseAuth();
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [linkManual, setLinkManual] = useState('');
  const linkManualInputRef = useRef<HTMLInputElement>(null);
  const resendLockRef = useRef(false);
  const cancelLockRef = useRef(false);
  const [cancelando, setCancelando] = useState<Invite | null>(null);
  const [filtro, setFiltro] = useState<InviteStatus | 'todos'>(() => ['aceito', 'expirado', 'pendente'].includes(location.state?.inviteFilter) ? location.state.inviteFilter : 'todos');

  const invitesQuery = useQuery({
    queryKey: ['convites-list', profile?.clinica_id, isPlatformAdmin],
    enabled: isPlatformAdmin || !!profile?.clinica_id,
    queryFn: async (): Promise<Invite[]> => {
      const clinicId = profile?.clinica_id;
      if (!isPlatformAdmin && !clinicId) return [];
      const scoped = (query: any) => isPlatformAdmin ? query : query.eq('clinica_id', clinicId);
      const [cf, ei] = await Promise.all([
        buscarEmBlocos<any>(() => scoped((supabase as any)
          .from('convites_funcionario')
          .select('id, clinica_id, email, nome, roles, token, created_at, expires_at, accepted_at')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true }))),
        buscarEmBlocos<any>(() => scoped((supabase as any)
          .from('employee_invitations')
          .select('id, clinica_id, email, roles, token, created_at, expires_at, accepted_at, funcionario_id')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true }))),
      ]);

      const merged: Invite[] = [];

      cf.forEach((r: any) => {
        merged.push({
          id: r.id,
          clinica_id: r.clinica_id,
          source: 'convites_funcionario',
          email: r.email,
          nome: r.nome,
          roles: r.roles || [],
          token: r.token,
          created_at: r.created_at,
          expires_at: r.expires_at,
          accepted_at: r.accepted_at,
          status: computeStatus(r),
        });
      });

      // enrich employee_invitations with funcionario name
      const funcIds = [...new Set(ei.map((r: any) => r.funcionario_id).filter(Boolean))] as string[];
      const funcMap: Record<string, string> = {};
      if (funcIds.length) {
        for (let start = 0; start < funcIds.length; start += 500) {
          const { data: funcs, error } = await (supabase as any)
            .from('funcionarios')
            .select('id, nome')
            .in('id', funcIds.slice(start, start + 500));
          if (error) throw error;
          Object.assign(funcMap, Object.fromEntries((funcs || []).map((f: any) => [f.id, f.nome])));
        }
      }

      ei.forEach((r: any) => {
        merged.push({
          id: r.id,
          clinica_id: r.clinica_id,
          source: 'employee_invitations',
          email: r.email,
          nome: funcMap[r.funcionario_id] ?? null,
          roles: r.roles || [],
          token: r.token,
          created_at: r.created_at,
          expires_at: r.expires_at,
          accepted_at: r.accepted_at,
          status: computeStatus(r),
          funcionario_id: r.funcionario_id,
        });
      });

      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return merged;
    },
  });
  const invites = invitesQuery.data ?? [];
  const invitesAtingiramLimite = invites.length >= LIMITE_BUSCA_EM_BLOCOS;
  const { isLoading } = invitesQuery;

  const resendMutation = useMutation({
    mutationFn: async (inv: Invite) => {
      setResendingId(inv.id);

      if (!inv.roles.length) {
        throw new Error(
          'Este convite não tem função definida. Defina a função do funcionário na aba Funcionários e convide de novo.'
        );
      }

      // Caminho único desde a unificação: invite-employee grava em
      // convites_funcionario e o aceite passa por accept-invite, que trata quem
      // já tem conta. Convites antigos em employee_invitations continuam
      // válidos e aceitáveis; o reenvio deles nasce já no sistema novo.
      const { data, error } = await supabase.functions.invoke('invite-employee', {
        body: { email: inv.email, nome: inv.nome || inv.email, roles: inv.roles },
      });

      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data) => {
      if (data?.emailStatus === 'sent') {
        toast.success('Novo convite enviado por e-mail.');
      } else {
        toast.info('Convite criado, mas o e-mail não foi enviado.', {
          description: 'O link está disponível na lista para copiar e compartilhar.',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['convites-list'] });
    },
    onError: (e) =>
      toast.error('Não foi possível reenviar o convite', {
        description: mensagemDeErro(e),
      }),
    onSettled: () => setResendingId(null),
  });

  const cancelMutation = useMutation({
    mutationFn: async (inv: Invite) => {
      // employee_invitations não tem política de DELETE, só de UPDATE, e o
      // status aceita apenas pending/accepted/expired. Expirar invalida o
      // token do mesmo jeito: accept_employee_invitation exige expires_at
      // futuro. Em convites_funcionario dá para apagar de fato.
      if (inv.source === 'employee_invitations') {
        if (!isPlatformAdmin && !profile?.clinica_id) throw new Error('Clínica não identificada.');
        let query = (supabase as any)
          .from('employee_invitations')
          .update({ status: 'expired', expires_at: new Date().toISOString() })
          .eq('id', inv.id);
        if (!isPlatformAdmin && profile?.clinica_id) query = query.eq('clinica_id', profile.clinica_id);
        const { data, error } = await query.select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Convite não encontrado ou sem permissão para cancelar.');
      } else {
        if (!isPlatformAdmin && !profile?.clinica_id) throw new Error('Clínica não identificada.');
        let query = (supabase as any)
          .from('convites_funcionario')
          .delete()
          .eq('id', inv.id);
        if (!isPlatformAdmin && profile?.clinica_id) query = query.eq('clinica_id', profile.clinica_id);
        const { data, error } = await query.select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Convite não encontrado ou sem permissão para cancelar.');
      }
    },
    onSuccess: () => {
      toast.success('Convite cancelado. O link deixou de funcionar.');
      queryClient.invalidateQueries({ queryKey: ['convites-list'] });
      setCancelando(null);
    },
    onError: (e) =>
      toast.error('Não foi possível cancelar o convite', {
        description: mensagemDeErro(e),
      }),
  });

  const copyLink = async (inv: Invite) => {
    const url = buildInviteUrl(inv.token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado para a área de transferência.');
    } catch (e) {
      setLinkManual(url);
      toast.error('Não foi possível copiar automaticamente. O link está aberto para cópia manual.', {
        description: mensagemDeErro(e),
      });
    }
  };

  const pendentes = invites.filter((i) => i.status === 'pendente').length;
  const aceitos = invites.filter((i) => i.status === 'aceito').length;
  const expirados = invites.filter((i) => i.status === 'expirado').length;

  // Convite sem papel não dá acesso a nada: a pessoa aceita, fica vinculada à
  // clínica e não enxerga uma tela sequer. Precisa aparecer na lista, senão o
  // administrador reenvia o mesmo convite inútil.
  const semPapel = invites.filter((i) => i.status !== 'aceito' && i.roles.length === 0);

  const visiveis = filtro === 'todos' ? invites : invites.filter((i) => i.status === filtro);
  const acaoConviteOcupada = resendMutation.isPending || cancelMutation.isPending
    || resendLockRef.current || cancelLockRef.current;
  const reenviarConvite = (inv: Invite) => {
    if (resendLockRef.current || cancelLockRef.current) return;
    resendLockRef.current = true;
    resendMutation.mutate(inv, { onSettled: () => { resendLockRef.current = false; } });
  };
  const confirmarCancelamento = () => {
    if (!cancelando || resendLockRef.current || cancelLockRef.current) return;
    cancelLockRef.current = true;
    cancelMutation.mutate(cancelando, { onSettled: () => { cancelLockRef.current = false; } });
  };

  const INDICADORES: Array<{ chave: InviteStatus | 'todos'; label: string; value: number; icon: typeof Mail; color: string; surface: string; escuro: boolean; caption: string }> = [
    { chave: 'pendente', label: 'Pendentes', value: pendentes, icon: Clock, color: 'text-foreground', surface: 'bg-secondary', escuro: false, caption: 'aguardando aceite' },
    { chave: 'aceito', label: 'Aceitos', value: aceitos, icon: CheckCircle2, color: 'text-success', surface: 'bg-success/10', escuro: false, caption: 'acesso liberado' },
    // Vermelho só quando há convite vencido; zero expirados não é problema.
    { chave: 'expirado', label: 'Expirados', value: expirados, icon: XCircle, color: expirados > 0 ? 'text-destructive' : 'text-muted-foreground', surface: expirados > 0 ? 'bg-destructive/10' : 'bg-secondary', escuro: false, caption: 'link vencido' },
    { chave: 'todos', label: 'Total', value: invites.length, icon: Mail, color: 'text-primary', surface: 'bg-primary/10', escuro: false, caption: 'todos os convites' },
  ];
  const descricaoHeader = invites.length === 0
    ? 'Acompanhe o acesso da equipe e mantenha os convites sob controle.'
    : `${invites.length} convite(s) · ${pendentes} pendente(s) · ${aceitos} aceito(s)`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Convites"
        description={descricaoHeader}
        icon={<Mail />}
        actions={(
          <>
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => void invitesQuery.refetch()} aria-label="Atualizar convites" title="Atualizar convites">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button asChild className="shrink-0 gap-2">
              <Link to="/equipe/convites/novo" state={{ inviteReturn: location.pathname + location.search, inviteReturnState: { inviteFilter: filtro } }}><Plus className="h-4 w-4" /> Novo convite</Link>
            </Button>
          </>
        )}
      />
      {linkManual && <section aria-labelledby="manual-invite-title" className="space-y-3 rounded-lg border bg-card p-4">
        <h2 id="manual-invite-title" className="font-semibold">Copiar link do convite</h2>
        <p className="text-sm text-muted-foreground">Selecione o link e copie com Ctrl+C ou ⌘C para compartilhar com o funcionário.</p>
        <Input ref={linkManualInputRef} value={linkManual} readOnly aria-label="Link de aceitação do convite" onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()} autoFocus />
        <Button variant="outline" onClick={() => setLinkManual('')}>Fechar link</Button>
      </section>}
      <Alert role="note">
        <Mail className="h-4 w-4" />
        <AlertTitle>Como funciona o convite</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            <strong>1.</strong> O funcionário recebe um e-mail com o link de aceitação (válido por 7 dias).
          </p>
          <p>
            <strong>2.</strong> Ele abre o link e define uma senha: mínimo 10 caracteres, com
            maiúscula, minúscula e número. Quem já tem conta informa a senha atual.
          </p>
          <p>
            <strong>3.</strong> O acesso é liberado conforme a função definida no cadastro do
            funcionário. <strong>Convite sem função não dá acesso a nada</strong> — a pessoa entra
            e não vê nenhuma tela.
          </p>
          <p>
            <strong>4.</strong> Convite expirado? Use <em>Reenviar</em> para gerar um link novo.
            Convidou a pessoa errada? Use <em>Cancelar</em> — o link para de funcionar na hora.
          </p>
        </AlertDescription>
      </Alert>

      <section role="group" aria-label="Resumo dos convites" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {INDICADORES.map((ind) => {
          const Icon = ind.icon;
          const ativo = filtro === ind.chave;
          return (
            <button
              key={ind.chave}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltro(ind.chave === 'todos' ? 'todos' : (ativo ? 'todos' : ind.chave))}
              className={cn(
                'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                ind.escuro && 'border-transparent bg-gradient-primary text-white',
                ativo && !ind.escuro && 'border-primary/50 ring-1 ring-primary/30',
                ativo && ind.escuro && 'ring-2 ring-primary/60',
              )}
            >
              <div className="flex items-start justify-between gap-2 p-4">
                <div>
                  <p className={cn('text-xs font-medium', ind.escuro ? 'text-white/80' : 'text-muted-foreground')}>{ind.label}</p>
                  <p className={cn('mt-1 text-2xl font-bold tabular-nums', ind.color)}>{ind.value}</p>
                  <p className={cn('mt-0.5 text-[11px]', ind.escuro ? 'text-white/60' : 'text-muted-foreground')}>{ind.caption}</p>
                </div>
                <span aria-hidden="true" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ind.surface)}>
                  <Icon className={cn('h-4 w-4', ind.color)} />
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {semPapel.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {semPapel.length === 1
              ? '1 convite não vai dar acesso a nada'
              : `${semPapel.length} convites não vão dar acesso a nada`}
          </AlertTitle>
          <AlertDescription>
            Estes convites foram criados sem função definida:{' '}
            <strong>{semPapel.map((i) => i.email).join(', ')}</strong>. Quem aceitar entra no
            sistema e não enxerga nenhuma tela. Cancele, defina a função do funcionário na aba
            Funcionários e convide de novo.
          </AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
              <Mail className="h-4 w-4" />
            </span>
            Convites enviados
            <Badge variant="outline" className="rounded-full border-border text-primary">{visiveis.length} de {invites.length}</Badge>
          </CardTitle>
          <CardDescription>Acompanhe o status de cada convite, reenvie ou cancele.</CardDescription>
          {filtro !== 'todos' && (
            <Button variant="ghost" size="sm" className="h-8 w-fit gap-1.5 rounded-full text-muted-foreground" onClick={() => setFiltro('todos')}>
              <X className="h-3.5 w-3.5" /> Limpar filtro
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {invitesAtingiramLimite && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} convites. Convites mais antigos podem não aparecer.</p>
            </div>
          )}
          {invitesQuery.isError ? (
            <ErrorState
              title="Não foi possível carregar os convites"
              description="Tente atualizar a lista. Nenhum convite foi alterado."
              error={invitesQuery.error}
              onRetry={() => void invitesQuery.refetch()}
            />
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : invites.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Nenhum convite enviado"
              description="Convide funcionários pela aba Funcionários para começar."
            />
          ) : (
            <div role="region" aria-label="Tabela de convites enviados" tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Table aria-label="Convites enviados">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome / E-mail</TableHead>
                    <TableHead>Papéis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enviado</TableHead>
                    <TableHead>Expira</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((inv) => (
                    <TableRow key={`${inv.source}-${inv.id}`}>
                      <TableCell>
                        <div className="font-medium">{inv.nome || '—'}</div>
                        <div className="text-xs text-muted-foreground">{inv.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {inv.roles.length === 0 ? (
                            <Badge variant="destructive" className="rounded-full text-xs gap-1">
                              <AlertTriangle className="h-3 w-3" /> Sem função
                            </Badge>
                          ) : (
                            inv.roles.map((r) => (
                              <Badge key={r} variant="outline" className="rounded-full text-xs">
                                {ROLE_LABELS[r] || r}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.status === 'aceito'
                          ? '—'
                          : formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {inv.status === 'pendente' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 rounded-full"
                              onClick={() => copyLink(inv)}
                              title="Copiar link do convite"
                              aria-label={'Copiar link do convite para ' + inv.email}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {inv.status !== 'aceito' && (
                            <Button
                              size="sm"
                              className="h-9 gap-1 rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,17,19,0.06)] hover:brightness-110"
                              onClick={() => reenviarConvite(inv)}
                              disabled={acaoConviteOcupada}
                              aria-label={'Reenviar convite para ' + inv.email}
                            >
                              {resendingId === inv.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              <span className="ml-1 hidden 2xl:inline">Reenviar</span>
                            </Button>
                          )}
                          {inv.status !== 'aceito' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setCancelando(inv)}
                              disabled={acaoConviteOcupada}
                              title="Cancelar convite"
                              aria-label={'Cancelar convite para ' + inv.email}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {visiveis.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum convite {INDICADORES.find((i) => i.chave === filtro)?.label.toLowerCase()}.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!cancelando}
        onOpenChange={(aberto) => !aberto && setCancelando(null)}
        title="Cancelar este convite?"
        description={
          cancelando
            ? `O link enviado para ${cancelando.email} deixa de funcionar imediatamente. ` +
              'Se a pessoa ainda precisar de acesso, será necessário convidá-la de novo.'
            : ''
        }
        confirmLabel="Cancelar convite"
        cancelLabel="Voltar"
        variant="destructive"
        isLoading={cancelMutation.isPending}
        onConfirm={confirmarCancelamento}
      />


    </div>
  );
}
