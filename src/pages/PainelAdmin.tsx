import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth, AppRole } from '@/contexts/SupabaseAuthContext';
import { Navigate } from 'react-router-dom';
import {
  Shield, Users, CreditCard, Activity, Search, Edit, Trash2, TrendingUp, TrendingDown,
  UserCheck, UserX, Loader2, Crown, Clock, Ban, CheckCircle2,
  BarChart3, Building2, RefreshCw,
} from 'lucide-react';
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { parseDateOnly } from '@/lib/dateOnly';

const SUPER_ADMIN_EMAIL = import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'contato@elolab.com.br';

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
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  // Computed data
  const usuarios = useMemo(() => {
    return profiles.map(p => ({
      ...p,
      roles: userRoles.filter(r => r.user_id === p.id).map(r => r.role),
      subscription: subscriptions.find((s: any) => s.user_id === p.id),
    }));
  }, [profiles, userRoles, subscriptions]);

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

      await supabase.from('user_roles').delete().eq('user_id', editUser.id);
      await supabase.from('user_roles').insert({ user_id: editUser.id, role: editFormData.role });

      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      setEditUser(null);
      toast.success('Usuário atualizado.');
    } catch {
      toast.error('Erro ao salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setIsSaving(true);
    try {
      await supabase.from('user_roles').delete().eq('user_id', deleteUser.id);
      await supabase.from('profiles').update({ ativo: false }).eq('id', deleteUser.id);
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-roles'] });
      setDeleteUser(null);
      toast.success('Usuário desativado.');
    } catch {
      toast.error('Erro ao desativar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAtivo = async (u: any) => {
    await supabase.from('profiles').update({ ativo: !u.ativo }).eq('id', u.id);
    queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
    toast.success(u.ativo ? 'Desativado.' : 'Ativado.');
  };

  const handleCancelSub = async (subId: string) => {
    await supabase.from('assinaturas_plano').update({ status: 'cancelada', data_cancelamento: new Date().toISOString() }).eq('id', subId);
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
                      <TableHead>Status</TableHead>
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
                          <TableRow key={u.id} className={cn(!u.ativo && 'opacity-50')}>
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
                              <Switch
                                checked={u.ativo ?? true}
                                onCheckedChange={() => handleToggleAtivo(u)}
                                disabled={u.email === SUPER_ADMIN_EMAIL}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(u)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteUser(u)}
                                  disabled={u.email === SUPER_ADMIN_EMAIL}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
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
      </Tabs>

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

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteUser} onOpenChange={open => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja desativar "{deleteUser?.nome}"? O acesso ao sistema será revogado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
