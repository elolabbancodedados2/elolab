import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Ban, Edit, Shield, UserCheck, UserX, Loader2, Clock, Circle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
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
  admin: 'bg-red-100 text-red-800',
  medico: 'bg-blue-100 text-blue-800',
  recepcao: 'bg-green-100 text-green-800',
  enfermagem: 'bg-purple-100 text-purple-800',
  financeiro: 'bg-yellow-100 text-yellow-800',
};

export default function Usuarios() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [formData, setFormData] = useState<Partial<Profile & { roles: AppRole[] }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const queryClient = useQueryClient();
  const { user: currentUser } = useSupabaseAuth();

  const { data: profiles = [], isLoading: loadingProfiles, error: profilesError, refetch: refetchProfiles } = useSupabaseQuery<Profile>('profiles', {
    select: 'id,nome,email,telefone,avatar,created_at,ultimo_acesso',
    orderBy: { column: 'nome', ascending: true },
  });

  const { data: userRoles = [], isLoading: loadingRoles, error: rolesError, refetch: refetchRoles } = useSupabaseQuery<UserRole>('user_roles', {
    select: 'id,user_id,role',
  });

  const { data: situacoes = [], isLoading: loadingSituacoes, error: situacoesError, refetch: refetchSituacoes } = useQuery({
    queryKey: ['admin-situacao-contas'],
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

  const getUltimoAcessoInfo = (ultimo_acesso: string | null) => {
    if (!ultimo_acesso) return { text: 'Nunca acessou', isOnline: false };
    const date = new Date(ultimo_acesso);
    if (Number.isNaN(date.getTime())) return { text: 'Data indisponível', isOnline: false };
    const diffMs = Date.now() - date.getTime();
    const diffMin = diffMs / 60000;
    const isOnline = diffMin >= 0 && diffMin < 15;
    const text = isOnline ? 'Ativo recentemente' : formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    return { text, isOnline, fullDate: format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) };
  };

  const visibleUsers = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (!term) return usuarios;
    const phoneTerm = term.replace(/\D/g, '');
    return usuarios.filter((user) =>
      user.nome?.toLocaleLowerCase('pt-BR').includes(term) ||
      user.email?.toLocaleLowerCase('pt-BR').includes(term) ||
      (phoneTerm.length > 0 && (user.telefone?.replace(/\D/g, '').includes(phoneTerm) ?? false)) ||
      user.roles.some((role) => ROLE_LABELS[role].toLocaleLowerCase('pt-BR').includes(term))
    );
  }, [usuarios, searchTerm]);

  const handleEdit = (user: PlatformUser) => {
    setSelectedUser(user);
    setFormData({
      nome: user.nome,
      email: user.email,
      telefone: user.telefone || '',
      roles: user.roles.length ? user.roles : ['recepcao'],
    });
    setIsFormOpen(true);
  };

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
    if (!selectedUser || !formData.nome?.trim() || !formData.roles?.length) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

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
      setIsFormOpen(false);
      toast.success('Usuário atualizado com sucesso.');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving user:', error);
      toast.error('Erro ao salvar usuário.', { description: mensagemDeErro(error) });
    } finally {
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (profilesError || rolesError || situacoesError) return <ErrorState error={profilesError || rolesError || situacoesError} onRetry={() => { void refetchProfiles(); void refetchRoles(); void refetchSituacoes(); }} />;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Usuários</h1>
            <p className="text-muted-foreground">Gerencie os usuários do sistema</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Circle className="h-2.5 w-2.5 fill-success text-success" />
              <span>{usuarios.filter(u => getUltimoAcessoInfo(u.ultimo_acesso).isOnline).length} ativos recentemente</span>
            </div>
            <span>•</span>
            <span>{usuarios.length} total</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Lista de Usuários</CardTitle>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input aria-label="Buscar usuários" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar nome, e-mail, telefone ou função" className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
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
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? 'Nenhum usuário corresponde à busca.' : 'Nenhum usuário encontrado'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleUsers.map((usuario) => {
                      const acesso = getUltimoAcessoInfo(usuario.ultimo_acesso);
                      return (
                        <TableRow key={usuario.id} className={situacoes.find(status => status.user_id === usuario.id)?.bloqueado ? 'opacity-50' : ''}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                {usuario.roles.includes('admin') && (
                                  <Shield className="h-4 w-4 text-red-500" />
                                )}
                              </div>
                              <span className="font-medium">{usuario.nome}</span>
                              {usuario.id === currentUser?.id && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Você</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{usuario.email}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {usuario.roles.length > 0 ? (
                                usuario.roles.map(role => (
                                  <Badge key={role} className={cn(ROLE_COLORS[role])}>
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
                                checked={!(situacoes.find(status => status.user_id === usuario.id)?.bloqueado ?? false)}
                                onCheckedChange={() => handleToggleAcesso(usuario)}
                                disabled={usuario.id === currentUser?.id || isSaving}
                              />
                              {situacoes.find(status => status.user_id === usuario.id)?.bloqueado ? (
                                <UserX className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <UserCheck className="h-4 w-4 text-green-600" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button aria-label={`Editar usuário ${usuario.nome}`} variant="ghost" size="icon" onClick={() => handleEdit(usuario)} disabled={usuario.id === currentUser?.id || isSaving}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button aria-label={`Bloquear acesso de ${usuario.nome}`} variant="ghost" size="icon" onClick={() => handleDeleteClick(usuario)} disabled={usuario.id === currentUser?.id || isSaving || situacoes.find(status => status.user_id === usuario.id)?.bloqueado}>
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

        {/* Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={open => {
          if (open || !isSaving) setIsFormOpen(open);
        }}>
          <DialogContent aria-busy={isSaving}>
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
            </DialogHeader>
            <fieldset disabled={isSaving} className="space-y-4 border-0 p-0 py-4">
              <div className="space-y-2">
                <Label>Nome Completo *</Label>
                <Input value={formData.nome || ''} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email || ''} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={formData.telefone || ''} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} placeholder="(00) 00000-0000" />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Funções do usuário</legend>
                <p className="text-xs text-muted-foreground">Selecione todas as áreas de trabalho necessárias. É preciso manter pelo menos uma função.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(ROLE_LABELS).map(([key, label]) => {
                    const role = key as AppRole;
                    const checked = formData.roles?.includes(role) || false;
                    return <label key={role} className="flex min-h-11 items-center gap-3 rounded-md border px-3">
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving || !formData.roles?.length || !formData.nome?.trim()}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
