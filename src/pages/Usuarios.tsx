import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Edit, Trash2, Shield, UserCheck, UserX, Loader2, Clock, Circle } from 'lucide-react';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth, AppRole } from '@/contexts/SupabaseAuthContext';
import { cn } from '@/lib/utils';

interface Profile {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  avatar: string | null;
  ativo: boolean | null;
  created_at: string | null;
  ultimo_acesso: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

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
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [formData, setFormData] = useState<Partial<Profile & { role: AppRole }>>({});
  const [isSaving, setIsSaving] = useState(false);

  const queryClient = useQueryClient();
  const { user: currentUser } = useSupabaseAuth();

  const { data: profiles = [], isLoading: loadingProfiles } = useSupabaseQuery<Profile>('profiles', {
    orderBy: { column: 'nome', ascending: true },
  });

  const { data: userRoles = [], isLoading: loadingRoles } = useSupabaseQuery<UserRole>('user_roles', {});

  const isLoading = loadingProfiles || loadingRoles;

  // Update ultimo_acesso on mount for current user
  useEffect(() => {
    if (currentUser?.id) {
      supabase
        .from('profiles')
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq('id', currentUser.id)
        .then(() => {});
    }
  }, [currentUser?.id]);

  const usuarios = useMemo(() => {
    return profiles.map(profile => {
      const roles = userRoles.filter(r => r.user_id === profile.id);
      return { ...profile, roles: roles.map(r => r.role) };
    });
  }, [profiles, userRoles]);

  const getUltimoAcessoInfo = (ultimo_acesso: string | null) => {
    if (!ultimo_acesso) return { text: 'Nunca acessou', isOnline: false };
    const date = new Date(ultimo_acesso);
    const diffMs = Date.now() - date.getTime();
    const diffMin = diffMs / 60000;
    const isOnline = diffMin < 15;
    const text = isOnline ? 'Online agora' : formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    return { text, isOnline, fullDate: format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) };
  };

  const handleEdit = (user: typeof usuarios[0]) => {
    setSelectedUser(user);
    setFormData({
      nome: user.nome,
      email: user.email,
      telefone: user.telefone || '',
      ativo: user.ativo ?? true,
      role: user.roles[0] || 'recepcao',
    });
    setIsFormOpen(true);
  };

  const handleDeleteClick = (user: typeof usuarios[0]) => {
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
      const { error: rolesError } = await supabase
        .from('user_roles').delete().eq('user_id', selectedUser.id);
      if (rolesError) throw rolesError;

      const { error } = await supabase.from('profiles').update({ ativo: false }).eq('id', selectedUser.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['user_roles'] });
      toast.success('Usuário desativado com sucesso.');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error deleting user:', error);
      toast.error('Erro ao desativar usuário.', { description: mensagemDeErro(error) });
    } finally {
      setIsSaving(false);
      setIsDeleteOpen(false);
    }
  };

  const handleSave = async () => {
    if (!selectedUser || !formData.nome) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    setIsSaving(true);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ nome: formData.nome, telefone: formData.telefone || null, ativo: formData.ativo })
        .eq('id', selectedUser.id);
      if (profileError) throw profileError;

      if (formData.role) {
        // Apaga e reinsere. O erro do insert já era checado, mas o papel antigo
        // já tinha sido removido — a conta ficava sem nenhum acesso e a pessoa
        // via "Acesso Pendente" sem entender por quê. Guardamos para restaurar.
        const { data: papeisAtuais } = await supabase
          .from('user_roles').select('role').eq('user_id', selectedUser.id);

        const { error: delError } = await supabase
          .from('user_roles').delete().eq('user_id', selectedUser.id);
        if (delError) throw delError;

        const { error: roleError } = await supabase
          .from('user_roles').insert({ user_id: selectedUser.id, role: formData.role });
        if (roleError) {
          if (papeisAtuais?.length) {
            await supabase.from('user_roles')
              .insert(papeisAtuais.map(p => ({ user_id: selectedUser.id, role: p.role })));
          }
          throw roleError;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['user_roles'] });
      setIsFormOpen(false);
      toast.success('Usuário atualizado com sucesso.');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving user:', error);
      toast.error('Erro ao salvar usuário.', { description: mensagemDeErro(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAtivo = async (user: typeof usuarios[0]) => {
    if (user.id === currentUser?.id) {
      toast.error('Você não pode desativar seu próprio usuário.');
      return;
    }
    try {
      const { error } = await supabase.from('profiles').update({ ativo: !user.ativo }).eq('id', user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast.success(user.ativo ? 'Usuário desativado.' : 'Usuário ativado.');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error toggling user status:', error);
      toast.error('Erro ao alterar status do usuário.', { description: mensagemDeErro(error) });
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
              <span>{usuarios.filter(u => getUltimoAcessoInfo(u.ultimo_acesso).isOnline).length} online</span>
            </div>
            <span>•</span>
            <span>{usuarios.length} total</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Usuários</CardTitle>
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
                  {usuarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    usuarios.map((usuario) => {
                      const acesso = getUltimoAcessoInfo(usuario.ultimo_acesso);
                      return (
                        <TableRow key={usuario.id} className={!usuario.ativo ? 'opacity-50' : ''}>
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
                                checked={usuario.ativo ?? true}
                                onCheckedChange={() => handleToggleAtivo(usuario)}
                                disabled={usuario.id === currentUser?.id}
                              />
                              {usuario.ativo ? (
                                <UserCheck className="h-4 w-4 text-green-600" />
                              ) : (
                                <UserX className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(usuario)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(usuario)} disabled={usuario.id === currentUser?.id}>
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

        {/* Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
              <div className="space-y-2">
                <Label>Função</Label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v as AppRole })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formData.ativo ?? true} onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })} />
                <Label>Usuário Ativo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving}>
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
              <AlertDialogTitle>Confirmar desativação</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja desativar o usuário "{selectedUser?.nome}"? O usuário não poderá mais acessar o sistema.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Desativar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
