import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Ban, Edit, Shield, UserCheck, UserX, Loader2, Clock, Circle, Search, Users, RefreshCw, LayoutDashboard, X, UserRoundX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth, AppRole } from '@/contexts/SupabaseAuthContext';
import { cn } from '@/lib/utils';
import { chamarAdminContas } from '@/lib/adminContas';

interface Profile {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  avatar: string | null;
  created_at: string | null;
  ultimo_acesso: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}
type PlatformUser = Profile & { roles: AppRole[] };

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  medico: 'Médico',
  recepcao: 'Recepção',
  enfermagem: 'Enfermagem',
  financeiro: 'Financeiro',
};

const ROLE_COLORS: Record<AppRole, string> = {
  admin: 'border-destructive/30 bg-destructive/10 text-destructive',
  medico: 'border-border bg-secondary text-primary',
  recepcao: 'border-success/30 bg-success/10 text-success',
  enfermagem: 'border-info/30 bg-info/10 text-info',
  financeiro: 'border-warning/30 bg-warning/10 text-warning',
};

type FiltroConta = 'todos' | 'online' | 'bloqueados' | 'admins' | 'nunca';
const FILTRO_LABELS: Record<Exclude<FiltroConta, 'todos'>, string> = {
  online: 'ativos recentemente',
  bloqueados: 'com acesso bloqueado',
  admins: 'administradores',
  nunca: 'que nunca acessaram',
};

function getUltimoAcessoInfo(ultimo_acesso: string | null) {
  if (!ultimo_acesso) return { text: 'Nunca acessou', isOnline: false };
  const date = new Date(ultimo_acesso);
  if (Number.isNaN(date.getTime())) return { text: 'Data indisponível', isOnline: false };
  const diffMs = Date.now() - date.getTime();
  const diffMin = diffMs / 60000;
  const isOnline = diffMin >= 0 && diffMin < 15;
  const text = isOnline ? 'Ativo recentemente' : formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
  return { text, isOnline, fullDate: format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) };
}

export default function Usuarios({ editing = false }: { editing?: boolean }) {
  const location = useLocation();
  return <UsuariosWorkspace key={location.pathname} editing={editing} />;
}
function UsuariosWorkspace({ editing }: { editing: boolean }) {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const completed = useRef(false);
  const saving = useRef(false);
  const initialized = useRef(false);
  const baseline = useRef('{}');
  const leave = () => navigate('/usuarios', { state: { accountFilters: location.state?.accountFilters } });
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [formData, setFormData] = useState<Partial<Profile & { roles: AppRole[] }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState(location.state?.accountFilters?.search ?? '');
  const [filtro, setFiltro] = useState<FiltroConta>(location.state?.accountFilters?.status ?? 'todos');

  const queryClient = useQueryClient();
  const { user: currentUser } = useSupabaseAuth();

  const { data: profiles = [], isLoading: loadingProfiles, error: profilesError, refetch: refetchProfiles } = useSupabaseQuery<Profile>('profiles', {
    select: 'id,nome,email,telefone,avatar,created_at,ultimo_acesso',
    filters: editing ? [{ column: 'id', operator: 'eq', value: accountId }] : undefined,
    orderBy: { column: 'nome', ascending: true },
  });

  const { data: userRoles = [], isLoading: loadingRoles, error: rolesError, refetch: refetchRoles } = useSupabaseQuery<UserRole>('user_roles', {
    select: 'id,user_id,role',
    filters: editing ? [{ column: 'user_id', operator: 'eq', value: accountId }] : undefined,
  });

  const { data: situacoes = [], isLoading: loadingSituacoes, error: situacoesError, refetch: refetchSituacoes } = useQuery({
    queryKey: ['admin-situacao-contas'],
    enabled: !editing,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('admin_situacao_contas');
      if (error) throw error;
      return (data || []) as { user_id: string; bloqueado: boolean }[];
    },
  });

  const isLoading = loadingProfiles || loadingRoles || loadingSituacoes;

  const usuarios = useMemo(() => {
    return profiles.map(profile => {
      const roles = userRoles.filter(r => r.user_id === profile.id);
      return { ...profile, roles: roles.map(r => r.role) };
    });
  }, [profiles, userRoles]);


  const bloqueadoIds = useMemo(() => new Set(situacoes.filter((status) => status.bloqueado).map((status) => status.user_id)), [situacoes]);
  const contagens = useMemo(() => ({
    todos: usuarios.length,
    online: usuarios.filter((u) => getUltimoAcessoInfo(u.ultimo_acesso).isOnline).length,
    bloqueados: usuarios.filter((u) => bloqueadoIds.has(u.id)).length,
    admins: usuarios.filter((u) => u.roles.includes('admin')).length,
    nunca: usuarios.filter((u) => !u.ultimo_acesso).length,
  }), [usuarios, bloqueadoIds]);

  const visibleUsers = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const porFiltro = usuarios.filter((user) => {
      if (filtro === 'online') return getUltimoAcessoInfo(user.ultimo_acesso).isOnline;
      if (filtro === 'bloqueados') return bloqueadoIds.has(user.id);
      if (filtro === 'admins') return user.roles.includes('admin');
      if (filtro === 'nunca') return !user.ultimo_acesso;
      return true;
    });
    if (!term) return porFiltro;
    const phoneTerm = term.replace(/\D/g, '');
    return porFiltro.filter((user) =>
      user.nome?.toLocaleLowerCase('pt-BR').includes(term) ||
      user.email?.toLocaleLowerCase('pt-BR').includes(term) ||
      (phoneTerm.length > 0 && (user.telefone?.replace(/\D/g, '').includes(phoneTerm) ?? false)) ||
      user.roles.some((role) => ROLE_LABELS[role].toLocaleLowerCase('pt-BR').includes(term))
    );
  }, [usuarios, searchTerm, filtro, bloqueadoIds]);

  const temFiltro = searchTerm.trim() !== '' || filtro !== 'todos';
  const limparFiltros = () => { setSearchTerm(''); setFiltro('todos'); };
  const refetchAll = () => { void refetchProfiles(); void refetchRoles(); void refetchSituacoes(); };

  const handleEdit = (user: PlatformUser) => navigate(`/usuarios/${user.id}/editar`, { state: { accountFilters: { search: searchTerm, status: filtro } } });
  useEffect(() => {
    if (!editing || initialized.current || isLoading || profilesError || rolesError) return;
    const account = usuarios.find(item => item.id === accountId);
    if (!account) return;
    const initial = { nome: account.nome, email: account.email, telefone: account.telefone || '', roles: account.roles };
    initialized.current = true;
    baseline.current = JSON.stringify(initial);
    setSelectedUser(account);
    setFormData(initial);
  }, [editing, accountId, isLoading, profilesError, rolesError, usuarios]);

  const handleDeleteClick = (user: PlatformUser) => {
    setSelectedUser(user);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    if (selectedUser.id === currentUser?.id) {
      toast.error('Você não pode excluir seu próprio usuário.');
      setIsDeleteOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      await chamarAdminContas({ acao: 'bloquear', alvo_id: selectedUser.id });
      queryClient.invalidateQueries({ queryKey: ['admin-situacao-contas'] });
      queryClient.invalidateQueries({ queryKey: ['admin-auditoria'] });
      toast.success('Acesso bloqueado e sessões encerradas.');
    } catch (error) {
      toast.error('Erro ao bloquear acesso.', { description: mensagemDeErro(error) });
    } finally {
      setIsSaving(false);
      setIsDeleteOpen(false);
    }
  };

  const handleSave = async () => {
    if (saving.current || selectedUser?.id === currentUser?.id) return;
    if (!selectedUser || !formData.nome?.trim() || !formData.roles?.length) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    saving.current = true;
    setIsSaving(true);
    try {
      const { error } = await (supabase as any).rpc('platform_update_clinic_user', {
        p_user_id: selectedUser.id,
        p_nome: formData.nome.trim(),
        p_telefone: formData.telefone || null,
        p_roles: formData.roles,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['user_roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      completed.current = true;
      leave();
      toast.success('Usuário atualizado com sucesso.');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving user:', error);
      toast.error('Erro ao salvar usuário.', { description: mensagemDeErro(error) });
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  const handleToggleAcesso = async (user: typeof usuarios[0]) => {
    if (user.id === currentUser?.id) {
      toast.error('Você não pode desativar seu próprio usuário.');
      return;
    }
    const bloqueado = situacoes.find((status) => status.user_id === user.id)?.bloqueado ?? false;
    setIsSaving(true);
    try {
      await chamarAdminContas({ acao: bloqueado ? 'desbloquear' : 'bloquear', alvo_id: user.id });
      queryClient.invalidateQueries({ queryKey: ['admin-situacao-contas'] });
      queryClient.invalidateQueries({ queryKey: ['admin-auditoria'] });
      toast.success(bloqueado ? 'Acesso liberado.' : 'Acesso bloqueado e sessões encerradas.');
    } catch (error) {
      toast.error('Erro ao alterar acesso.', { description: mensagemDeErro(error) });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && (!editing || !selectedUser)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if ((profilesError || rolesError || situacoesError) && (!editing || !selectedUser)) return <ErrorState error={profilesError || rolesError || situacoesError} onRetry={refetchAll} />;

  if (editing && (!usuarios.some(item => item.id === accountId) || accountId === currentUser?.id)) return <div className="space-y-4"><Button variant="outline" onClick={leave}>Voltar aos usuários</Button><ErrorState title={accountId === currentUser?.id ? 'Esta tela não permite editar sua própria conta' : 'Usuário não encontrado'} description="Volte à lista para selecionar uma conta disponível." /></div>;

  return (
    <TooltipProvider>
      <div className="space-y-6 pb-24 lg:pb-8">
        {editing && <UnsavedChangesGuard dirty={JSON.stringify(formData) !== baseline.current} busy={isSaving} completed={completed} />}
        {!editing && <>
        <PageHeader
          title="Usuários"
          description={`${contagens.todos} conta${contagens.todos === 1 ? '' : 's'} · ${contagens.online} ativa${contagens.online === 1 ? '' : 's'} recentemente · ${contagens.bloqueados} bloqueada${contagens.bloqueados === 1 ? '' : 's'}`}
          icon={<Users />}
          actions={
            <>
              <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
                <Link to="/painel-admin"><LayoutDashboard aria-hidden="true" className="h-4 w-4" /> Visão geral</Link>
              </Button>
              <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={refetchAll} aria-label="Atualizar usuários" title="Atualizar usuários">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </>
          }
        />

        <section role="group" aria-label="Situação das contas" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {([
            { key: 'todos' as FiltroConta, icon: Users, label: 'Contas', caption: 'cadastradas na plataforma', color: 'text-foreground', surface: 'bg-secondary', destaque: false },
            { key: 'online' as FiltroConta, icon: Circle, label: 'Ativas agora', caption: 'acesso nos últimos 15 min', color: 'text-success', surface: 'bg-success/10', destaque: false },
            { key: 'bloqueados' as FiltroConta, icon: UserX, label: 'Bloqueadas', caption: 'login impedido', color: 'text-destructive', surface: 'bg-destructive/10', destaque: false },
            { key: 'admins' as FiltroConta, icon: Shield, label: 'Administradores', caption: 'com função de admin', color: 'text-primary', surface: 'bg-primary/10', destaque: false },
            { key: 'nunca' as FiltroConta, icon: UserRoundX, label: 'Nunca acessaram', caption: 'convite sem primeiro login', color: 'text-warning', surface: 'bg-warning/10', destaque: false },
          ]).map((k) => {
            const Icon = k.icon;
            const ativo = filtro === k.key;
            return (
              <button
                key={k.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(ativo ? 'todos' : k.key)}
                className={cn(
                  'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  k.destaque && 'border-transparent bg-gradient-primary text-white',
                  ativo && !k.destaque && 'border-primary/50 ring-1 ring-primary/30',
                  ativo && k.destaque && 'ring-2 ring-primary/60',
                )}
              >
                <div className="flex min-h-[88px] items-center gap-3 p-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', k.surface)}>
                    <Icon aria-hidden="true" className={cn('h-5 w-5', k.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className={cn('truncate text-xs font-semibold', k.destaque ? 'text-white/80' : 'text-foreground')}>{k.label}</h2>
                      <span className={cn('text-2xl font-bold tabular-nums', k.color)}>{contagens[k.key]}</span>
                    </div>
                    <p className={cn('truncate text-[11px]', k.destaque ? 'text-white/70' : 'text-muted-foreground')}>{k.caption}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Lista de Usuários</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                  {visibleUsers.length} de {usuarios.length}{filtro !== 'todos' ? ` · ${FILTRO_LABELS[filtro]}` : ''}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <div className="relative w-full sm:w-80">
                  <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input aria-label="Buscar usuários" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar nome, e-mail, telefone ou função" className="h-10 rounded-full pl-9 focus-visible:ring-primary" />
                </div>
                {temFiltro && (
                  <Button variant="ghost" size="sm" className="h-10 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}>
                    <X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Último Acesso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                            <Users className="h-7 w-7" />
                          </span>
                          <p className="font-medium text-foreground">{temFiltro ? 'Nenhum usuário corresponde à busca.' : 'Nenhum usuário encontrado'}</p>
                          <p className="max-w-sm text-sm text-muted-foreground">
                            {temFiltro ? 'Ajuste a busca ou o indicador selecionado.' : 'As contas criadas pelas clínicas aparecerão aqui.'}
                          </p>
                          {temFiltro && (
                            <Button variant="outline" className="gap-2 rounded-full" onClick={limparFiltros}>
                              <X aria-hidden="true" className="h-4 w-4" /> Limpar filtros
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleUsers.map((usuario) => {
                      const acesso = getUltimoAcessoInfo(usuario.ultimo_acesso);
                      return (
                        <TableRow key={usuario.id} className={bloqueadoIds.has(usuario.id) ? 'opacity-50' : ''}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                {usuario.roles.includes('admin') && (
                                  <Shield aria-label="Administrador" className="h-4 w-4 text-destructive" />
                                )}
                              </div>
                              <span className="font-medium">{usuario.nome}</span>
                              {usuario.id === currentUser?.id && (
                                <Badge variant="outline" className="rounded-full border-border px-1.5 py-0 text-[10px] text-primary">Você</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{usuario.email}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {usuario.roles.length > 0 ? (
                                usuario.roles.map(role => (
                                  <Badge key={role} variant="outline" className={cn('rounded-full', ROLE_COLORS[role])}>
                                    {ROLE_LABELS[role]}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground text-sm">Sem função</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 text-sm">
                                    {acesso.isOnline ? (
                                    <Circle className="h-2 w-2 fill-success text-success animate-pulse" />
                                  ) : (
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  <span className={cn(acesso.isOnline ? 'text-success font-medium' : 'text-muted-foreground')}>
                                    {acesso.text}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {acesso.fullDate || 'Sem registro de acesso'}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={!bloqueadoIds.has(usuario.id)}
                                aria-label={`Acesso de ${usuario.nome}`}
                                onCheckedChange={() => handleToggleAcesso(usuario)}
                                disabled={usuario.id === currentUser?.id || isSaving}
                              />
                              {bloqueadoIds.has(usuario.id) ? (
                                <UserX className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <UserCheck className="h-4 w-4 text-success" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button aria-label={`Editar usuário ${usuario.nome}`} variant="ghost" size="icon" className="rounded-full" onClick={() => handleEdit(usuario)} disabled={usuario.id === currentUser?.id || isSaving}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button aria-label={`Bloquear acesso de ${usuario.nome}`} variant="ghost" size="icon" className="rounded-full" onClick={() => handleDeleteClick(usuario)} disabled={usuario.id === currentUser?.id || isSaving || bloqueadoIds.has(usuario.id)}>
                                <Ban className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        </>}
        {editing && <div className="mx-auto max-w-3xl space-y-5">
          <Button variant="outline" onClick={leave} disabled={isSaving}>Voltar aos usuários</Button>
          <PageHeader title="Editar usuário" description="Atualize os dados de contato e as funções desta conta. O e-mail de autenticação permanece somente para consulta." icon={<Users />} />
          <form onSubmit={event => { event.preventDefault(); void handleSave(); }} aria-busy={isSaving} className="rounded-xl border bg-card p-5 sm:p-6">
            <fieldset disabled={isSaving} className="space-y-4 border-0 p-0 py-4">
              <div className="space-y-2">
                <Label htmlFor="account-name">Nome Completo *</Label>
                <Input id="account-name" required minLength={2} maxLength={150} value={formData.nome || ''} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-email">Email</Label>
                <Input id="account-email" type="email" value={formData.email || ''} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-phone">Telefone</Label>
                <Input id="account-phone" maxLength={30} value={formData.telefone || ''} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} placeholder="(00) 00000-0000" />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Funções do usuário</legend>
                <p className="text-xs text-muted-foreground">Selecione todas as áreas de trabalho necessárias. É preciso manter pelo menos uma função.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(ROLE_LABELS).map(([key, label]) => {
                    const role = key as AppRole;
                    const checked = formData.roles?.includes(role) || false;
                    return <label key={role} className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 hover:border-foreground/25">
                      <Checkbox checked={checked} onCheckedChange={(value) => setFormData((current) => ({
                        ...current,
                        roles: value === true
                          ? [...new Set([...(current.roles || []), role])]
                          : (current.roles || []).filter((item) => item !== role),
                      }))} aria-label={label} />
                      <span className="text-sm">{label}</span>
                    </label>;
                  })}
                </div>
                {!formData.roles?.length && <p role="alert" className="text-xs text-destructive">Selecione ao menos uma função.</p>}
              </fieldset>
            </fieldset>
            <div className="flex flex-wrap justify-end gap-2 border-t pt-5 scroll-mb-24">
              <Button variant="outline" className="rounded-full" type="button" onClick={leave} disabled={isSaving}>Cancelar</Button>
              <Button type="submit" disabled={isSaving || !formData.roles?.length || !formData.nome?.trim()}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </form>
        </div>}

        {/* Delete Dialog */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Confirmar bloqueio de acesso</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja bloquear o acesso de "{selectedUser?.nome}"? As sessões serão encerradas e o login ficará impedido até você liberar novamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Bloquear acesso
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
