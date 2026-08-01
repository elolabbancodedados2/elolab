import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth, AppRole } from '@/contexts/SupabaseAuthContext';
import { Navigate } from 'react-router-dom';
import {
  Shield, Users, CreditCard, Activity, Search, Edit, TrendingUp, TrendingDown,
  UserCheck, UserX, Loader2, Crown, Clock, Ban, CheckCircle2,
  BarChart3, Building2, RefreshCw, ShieldAlert, ScrollText, Lock, Wrench,
} from 'lucide-react';
import { FerramentasDeConta } from '@/components/admin/FerramentasDeConta';
import { InterruptorManutencao } from '@/components/admin/InterruptorManutencao';
import { chamarAdminContas } from '@/lib/adminContas';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { parseDateOnly } from '@/lib/dateOnly';

const SUPER_ADMIN_EMAIL = import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'contato@elolab.com.br';

const ACAO_LABELS: Record<string, string> = {
  bloquear: 'bloqueou',
  desbloquear: 'desbloqueou',
  trocar_senha: 'trocou a senha',
  enviar_reset: 'enviou link de senha',
  confirmar_email: 'confirmou o e-mail',
  apagar: 'apagou a conta',
  previa: 'consultou',
  desconhecida: 'pedido inválido',
};

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  medico: 'Médico',
  recepcao: 'Recepção',
  enfermagem: 'Enfermagem',
  financeiro: 'Financeiro',
};

const ROLE_COLORS: Record<AppRole, string> = {
  admin: 'bg-destructive/10 text-destructive',
  medico: 'bg-info/10 text-info',
  recepcao: 'bg-success/10 text-success',
  enfermagem: 'bg-accent/20 text-accent-foreground',
  financeiro: 'bg-warning/10 text-warning',
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  ativa: { label: 'Ativa', color: 'bg-success/10 text-success', icon: CheckCircle2 },
  trial: { label: 'Trial', color: 'bg-info/10 text-info', icon: Clock },
  expirada: { label: 'Expirada', color: 'bg-warning/10 text-warning', icon: Ban },
  cancelada: { label: 'Cancelada', color: 'bg-destructive/10 text-destructive', icon: Ban },
};

interface Profile {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  avatar: string | null;
  ativo: boolean | null;
  created_at: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export default function PainelAdmin() {
  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState<any>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [contaEmFerramentas, setContaEmFerramentas] = useState<any>(null);

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  // Queries
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return (data || []) as Profile[];
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ['admin-user-roles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('*');
      return (data || []) as UserRole[];
    },
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('assinaturas_plano')
        .select('*, planos(nome, slug, valor)')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const { data: planos = [] } = useQuery({
    queryKey: ['admin-planos'],
    queryFn: async () => {
      const { data } = await supabase.from('planos').select('*').eq('ativo', true).order('ordem');
      return data || [];
    },
  });

  const { data: auditoria = [], isLoading: carregandoAuditoria } = useQuery({
    queryKey: ['admin-auditoria'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('admin_acoes')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // O bloqueio de verdade mora em auth.users.banned_until, que o PostgREST não
  // expõe. Esta função traz o estado de todas as contas de uma vez, em vez de
  // uma chamada por linha da tabela.
  const { data: situacoes = [] } = useQuery({
    queryKey: ['admin-situacao-contas'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('admin_situacao_contas');
      if (error) throw error;
      return (data || []) as { user_id: string; bloqueado: boolean; ultimo_login: string | null }[];
    },
  });

  // Computed data
  const usuarios = useMemo(() => {
    return profiles.map(p => ({
      ...p,
      bloqueado: situacoes.find(s => s.user_id === p.id)?.bloqueado ?? false,
      roles: userRoles.filter(r => r.user_id === p.id).map(r => r.role),
      subscription: subscriptions.find((s: any) => s.user_id === p.id),
    }));
  }, [profiles, userRoles, subscriptions, situacoes]);

  const filtered = useMemo(() => {
    if (!search) return usuarios;
    const q = search.toLowerCase();
    return usuarios.filter(u =>
      u.nome.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.roles.some(r => ROLE_LABELS[r].toLowerCase().includes(q))
    );
  }, [usuarios, search]);

  // Stats
  const totalUsers = profiles.length;
  const activeUsers = profiles.filter(p => p.ativo !== false).length;
  const totalSubs = subscriptions.length;
  const activeSubs = subscriptions.filter((s: any) => s.status === 'ativa' || s.status === 'trial').length;
  const trialSubs = subscriptions.filter((s: any) => s.status === 'trial').length;
  const revenue = subscriptions
    .filter((s: any) => s.status === 'ativa')
    .reduce((sum: number, s: any) => sum + (s.planos?.valor || 0), 0);
  const expiredSubs = subscriptions.filter((s: any) => s.status === 'expirada').length;
  const cancelledSubs = subscriptions.filter((s: any) => s.status === 'cancelada').length;
  const churnRate = totalSubs > 0 ? ((expiredSubs + cancelledSubs) / totalSubs * 100).toFixed(1) : '0';
  const conversionRate = totalSubs > 0 ? ((activeSubs / totalSubs) * 100).toFixed(1) : '0';
  const pieData = [
    { name: 'Ativas', value: subscriptions.filter((s: any) => s.status === 'ativa').length, color: 'hsl(var(--success))' },
    { name: 'Trial', value: trialSubs, color: 'hsl(var(--info))' },
    { name: 'Expiradas', value: expiredSubs, color: 'hsl(var(--warning))' },
    { name: 'Canceladas', value: cancelledSubs, color: 'hsl(var(--destructive))' },
  ].filter(d => d.value > 0);
  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; mrr: number }> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = { month: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), mrr: 0 };
    }
    subscriptions.forEach((s: any) => {
      if (s.status !== 'ativa' && s.status !== 'trial') return;
      const created = s.data_inicio ? parseDateOnly(s.data_inicio)! : null;
      if (!created) return;
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
      Object.keys(months).forEach(mk => { if (mk >= key) months[mk].mrr += s.planos?.valor || 0; });
    });
    return Object.values(months);
  }, [subscriptions]);

  // Handlers
  const handleEdit = (u: any) => {
    setEditUser(u);
    setEditFormData({
      nome: u.nome,
      telefone: u.telefone || '',
      ativo: u.ativo ?? true,
      role: u.roles[0] || 'recepcao',
    });
  };

  const handleSave = async () => {
    if (!editUser) return;
    setIsSaving(true);
    try {
      await supabase.from('profiles').update({
        nome: editFormData.nome,
        telefone: editFormData.telefone || null,
        ativo: editFormData.ativo,
      }).eq('id', editUser.id);

      // Mesmo cuidado de Funcionarios: sem checar o erro, um insert que falha
      // depois do delete deixa a conta sem nenhum papel, com a tela dizendo que
      // deu certo. Guardamos os papéis para restaurar em caso de falha.
      const { data: papeisAtuais } = await supabase
        .from('user_roles').select('role').eq('user_id', editUser.id);

      const { error: delErr } = await supabase
        .from('user_roles').delete().eq('user_id', editUser.id);
      if (delErr) throw delErr;

      const { error: insErr } = await supabase
        .from('user_roles').insert({ user_id: editUser.id, role: editFormData.role });
      if (insErr) {
        if (papeisAtuais?.length) {
          await supabase.from('user_roles')
            .insert(papeisAtuais.map(p => ({ user_id: editUser.id, role: p.role })));
        }
        throw insErr;
      }

      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      setEditUser(null);
      toast.success('Usuário atualizado.');
    } catch (e) {
      toast.error('Erro ao salvar.', { description: mensagemDeErro(e) });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * A chave gravava `profiles.ativo`, e nada no sistema lê esse campo para
   * negar acesso — nem o contexto de autenticação, nem as rotas, nem uma
   * política de RLS. Quem fosse "desativado" continuava entrando e
   * trabalhando. Pior que ferramenta ausente: uma que parece resolver.
   *
   * Agora bloqueia no Auth, que é onde o login realmente é decidido, e mantém
   * `ativo` em dia para as telas que listam por esse campo.
   */
  const [alterandoAcesso, setAlterandoAcesso] = useState<string | null>(null);

  const handleToggleAcesso = async (u: any) => {
    setAlterandoAcesso(u.id);
    try {
      await chamarAdminContas({
        acao: u.bloqueado ? 'desbloquear' : 'bloquear',
        alvo_id: u.id,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-situacao-contas'] });
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-auditoria'] });
      toast.success(
        u.bloqueado
          ? 'Acesso liberado. A pessoa já consegue entrar.'
          : 'Acesso bloqueado e sessões encerradas.',
      );
    } catch (e) {
      toast.error('Não foi possível alterar o acesso.', { description: mensagemDeErro(e) });
    } finally {
      setAlterandoAcesso(null);
    }
  };

  const handleCancelSub = async (subId: string) => {
    // Cancelamento de assinatura mexe em cobrança: anunciar sucesso sem
    // confirmar deixaria o cliente achando que cancelou algo que segue ativo.
    const { error } = await supabase
      .from('assinaturas_plano')
      .update({ status: 'cancelada', data_cancelamento: new Date().toISOString() })
      .eq('id', subId);
    if (error) { toast.error('Não foi possível cancelar a assinatura.', { description: mensagemDeErro(error) }); return; }
    queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    toast.success('Assinatura cancelada.');
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR');
  };

  // Guard: only super admin
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loadingProfiles) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <Shield className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Painel Administrativo</h1>
            <p className="text-muted-foreground text-sm">
              Acesso exclusivo — Gerenciamento total do sistema
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
            queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
            queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
          }}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Usuários</p>
                <p className="text-2xl font-bold">{totalUsers}</p>
                <p className="text-xs text-muted-foreground">{activeUsers} ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10"><CreditCard className="h-5 w-5 text-success" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Assinaturas Ativas</p>
                <p className="text-2xl font-bold">{activeSubs}</p>
                <p className="text-xs text-muted-foreground">{trialSubs} em trial</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10"><Crown className="h-5 w-5 text-warning" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Receita Recorrente</p>
                <p className="text-2xl font-bold">R$ {revenue.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">/mês</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/20"><BarChart3 className="h-5 w-5 text-accent-foreground" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Planos Disponíveis</p>
                <p className="text-2xl font-bold">{planos.length}</p>
                <p className="text-xs text-muted-foreground">configurados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" />Usuários</TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-2"><CreditCard className="h-4 w-4" />Assinaturas</TabsTrigger>
          <TabsTrigger value="metrics" className="gap-2"><BarChart3 className="h-4 w-4" />Métricas</TabsTrigger>
          <TabsTrigger value="auditoria" className="gap-2"><ScrollText className="h-4 w-4" />Auditoria</TabsTrigger>
          <TabsTrigger value="sistema" className="gap-2"><Wrench className="h-4 w-4" />Sistema</TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou função..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Funções</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Cadastro</TableHead>
                      <TableHead>Acesso</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nenhum usuário encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map(u => {
                        const sub = u.subscription as any;
                        return (
                          <TableRow key={u.id} className={cn(u.bloqueado && 'opacity-50')}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {u.email === SUPER_ADMIN_EMAIL && <Crown className="h-4 w-4 text-warning" />}
                                <span className="font-medium">{u.nome}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{u.email}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {u.roles.length > 0 ? u.roles.map(r => (
                                  <Badge key={r} className={cn('text-xs', ROLE_COLORS[r])}>{ROLE_LABELS[r]}</Badge>
                                )) : <span className="text-muted-foreground text-xs">Sem função</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              {sub ? (
                                <Badge className={cn('text-xs', STATUS_MAP[sub.status]?.color)}>
                                  {sub.planos?.nome || sub.plano_slug}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{formatDate(u.created_at)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={!u.bloqueado}
                                  onCheckedChange={() => handleToggleAcesso(u)}
                                  disabled={
                                    alterandoAcesso !== null
                                    || u.id === user?.id
                                    || u.email === SUPER_ADMIN_EMAIL
                                  }
                                  aria-label={u.bloqueado ? 'Liberar acesso' : 'Bloquear acesso'}
                                />
                                {alterandoAcesso === u.id && (
                                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                )}
                                {u.bloqueado && (
                                  <span className="text-xs text-destructive font-medium">bloqueada</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(u)} title="Editar dados">
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {/* Bloquear, trocar senha e apagar. Havia aqui um segundo
                                    botão de lixeira que só removia as funções e marcava
                                    `ativo = false` — dois caminhos parecidos, um deles sem
                                    efeito sobre o login. Ficou o que funciona. */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setContaEmFerramentas(u)}
                                  disabled={u.id === user?.id}
                                  title={u.id === user?.id
                                    ? 'Não dá para usar as ferramentas na própria conta'
                                    : 'Bloquear, trocar senha, apagar'}
                                >
                                  <ShieldAlert className="h-4 w-4 text-destructive" />
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
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Todas as Assinaturas</CardTitle>
              <CardDescription>Gerencie planos e assinaturas de todos os usuários</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Trial</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Fim</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nenhuma assinatura encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      subscriptions.map((sub: any) => {
                        const owner = profiles.find(p => p.id === sub.user_id);
                        const statusInfo = STATUS_MAP[sub.status] || STATUS_MAP.expirada;
                        const StatusIcon = statusInfo.icon;
                        return (
                          <TableRow key={sub.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{owner?.nome || 'Desconhecido'}</p>
                                <p className="text-xs text-muted-foreground">{owner?.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{sub.planos?.nome || sub.plano_slug}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn('gap-1', statusInfo.color)}>
                                <StatusIcon className="h-3 w-3" />
                                {statusInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {sub.em_trial ? (
                                <div>
                                  <Badge className="bg-info/10 text-info text-xs">Em Trial</Badge>
                                  <p className="text-xs text-muted-foreground mt-1">Até {formatDate(sub.trial_fim)}</p>
                                </div>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="text-sm">{formatDate(sub.data_inicio)}</TableCell>
                            <TableCell className="text-sm">{formatDate(sub.data_fim)}</TableCell>
                            <TableCell className="text-right">
                              {(sub.status === 'ativa' || sub.status === 'trial') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive text-xs"
                                  onClick={() => handleCancelSub(sub.id)}
                                >
                                  Cancelar
                                </Button>
                              )}
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
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/10"><TrendingUp className="h-5 w-5 text-success" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">MRR</p>
                    <p className="text-2xl font-bold text-success">R$ {revenue.toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">Receita Mensal Recorrente</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-info/10"><Users className="h-5 w-5 text-info" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Assinantes Ativos</p>
                    <p className="text-2xl font-bold">{activeSubs}</p>
                    <p className="text-xs text-success">{conversionRate}% conversão</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-warning/10"><TrendingDown className="h-5 w-5 text-warning" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Churn Rate</p>
                    <p className="text-2xl font-bold text-warning">{churnRate}%</p>
                    <p className="text-xs text-muted-foreground">{expiredSubs + cancelledSubs} perdidos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/20"><Clock className="h-5 w-5 text-accent-foreground" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Em Trial</p>
                    <p className="text-2xl font-bold">{trialSubs}</p>
                    <p className="text-xs text-muted-foreground">aguardando conversão</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Evolução MRR (6 meses)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `R$${v}`} />
                    <Tooltip formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'MRR']} />
                    <Area type="monotone" dataKey="mrr" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Distribuição</CardTitle></CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                          {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-3 justify-center mt-2">
                      {pieData.map((d) => (
                        <div key={d.name} className="flex items-center gap-1.5 text-xs">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-muted-foreground">{d.name}: {d.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-center text-muted-foreground py-8">Sem dados</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Auditoria */}
        <TabsContent value="auditoria" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                Ações sobre contas
              </CardTitle>
              <CardDescription>
                Toda vez que alguém bloqueia, troca senha ou apaga uma conta, entra aqui — inclusive
                as tentativas recusadas. O registro não pode ser alterado nem apagado, nem por mim.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {carregandoAuditoria ? (
                <div className="p-6"><Skeleton className="h-32 w-full" /></div>
              ) : auditoria.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">
                  Nada registrado ainda.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Quem fez</TableHead>
                        <TableHead>Ação</TableHead>
                        <TableHead>Conta alvo</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditoria.map((a: any) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(a.criado_em).toLocaleString('pt-BR')}
                          </TableCell>
                          <TableCell className="text-xs">{a.ator_email}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{ACAO_LABELS[a.acao] ?? a.acao}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{a.alvo_email}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                            {a.motivo || '—'}
                          </TableCell>
                          <TableCell>
                            {a.sucesso ? (
                              <Badge className="text-xs bg-success/10 text-success border-success/20">
                                <CheckCircle2 className="h-3 w-3 mr-1" />feito
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs" title={a.erro || ''}>
                                <Ban className="h-3 w-3 mr-1" />recusado
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sistema */}
        <TabsContent value="sistema" className="space-y-4">
          <div className="max-w-xl">
            <InterruptorManutencao />
          </div>
        </TabsContent>
      </Tabs>

      <FerramentasDeConta
        usuario={contaEmFerramentas}
        onFechar={() => setContaEmFerramentas(null)}
        onMudou={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
          queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
          queryClient.invalidateQueries({ queryKey: ['admin-auditoria'] });
        }}
      />

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={editFormData.nome || ''} onChange={e => setEditFormData({ ...editFormData, nome: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={editFormData.telefone || ''} onChange={e => setEditFormData({ ...editFormData, telefone: e.target.value })} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={editFormData.role} onValueChange={v => setEditFormData({ ...editFormData, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editFormData.ativo ?? true} onCheckedChange={c => setEditFormData({ ...editFormData, ativo: c })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
