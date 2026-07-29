import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Pencil, Trash2, Users, Mail, Phone, Loader2, Send, CheckCircle, Stethoscope, Briefcase, Settings2, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppRole, useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConvidarFuncionarioDialog } from '@/components/ConvidarFuncionarioDialog';

interface FuncionarioWithRoles {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  cargo: string | null;
  departamento: string | null;
  ativo: boolean | null;
  user_id: string | null;
  roles: AppRole[];
  hasInvitation?: boolean;
}

interface RoleCustomization {
  label: string;
  description: string;
  color: string;
  modules: string[];
}

type RoleCustomizations = Record<string, RoleCustomization>;

const DEFAULT_ROLE_CONFIG: { role: AppRole; label: string; description: string; color: string; modules: string[] }[] = [
  { role: 'admin', label: 'Administrador', description: 'Acesso total ao sistema', color: 'bg-primary/10 text-primary', modules: ['Todas as funcionalidades'] },
  { role: 'medico', label: 'Médico', description: 'Prontuários, prescrições e atestados', color: 'bg-info/10 text-info', modules: ['Prontuários', 'Prescrições', 'Atestados', 'Exames', 'Encaminhamentos'] },
  { role: 'recepcao', label: 'Recepção', description: 'Pacientes, agenda e fila', color: 'bg-accent text-accent-foreground', modules: ['Pacientes', 'Agenda', 'Fila', 'Lista de Espera'] },
  { role: 'enfermagem', label: 'Enfermagem', description: 'Triagem, sinais vitais e estoque', color: 'bg-success/10 text-success', modules: ['Triagem', 'Sinais Vitais', 'Estoque', 'Coletas'] },
  { role: 'financeiro', label: 'Financeiro', description: 'Contas, lançamentos e relatórios', color: 'bg-warning/10 text-warning', modules: ['Contas a Pagar', 'Contas a Receber', 'Caixa', 'Relatórios Financeiros'] },
];

const ALL_MODULES = [
  'Prontuários', 'Prescrições', 'Atestados', 'Exames', 'Encaminhamentos',
  'Pacientes', 'Agenda', 'Fila', 'Lista de Espera',
  'Triagem', 'Sinais Vitais', 'Estoque', 'Coletas',
  'Contas a Pagar', 'Contas a Receber', 'Caixa', 'Relatórios Financeiros',
  'Laboratório', 'Laudos', 'Convênios', 'Chat Interno', 'Tarefas',
  'Configurações', 'Funcionários', 'Salas', 'Analytics',
];

const TIPO_FUNCIONARIO_CONFIG: { value: string; label: string; registroLabel?: string; registroTipo?: string }[] = [
  { value: 'medico', label: 'Médico(a)', registroLabel: 'CRM', registroTipo: 'CRM' },
  { value: 'enfermeiro', label: 'Enfermeira(o)', registroLabel: 'COREN', registroTipo: 'COREN' },
  { value: 'tecnico_enfermagem', label: 'Técnico(a) de Enfermagem', registroLabel: 'COREN', registroTipo: 'COREN' },
  { value: 'tecnico_laboratorio', label: 'Técnico(a) de Laboratório', registroLabel: 'CRT', registroTipo: 'CRT' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'gerente', label: 'Gerente / Dono(a)' },
  { value: 'administrativo', label: 'Administrativo' },
];

const UF_OPTIONS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const TURNO_OPTIONS = [
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'noite', label: 'Noite' },
  { value: 'integral', label: 'Integral' },
  { value: 'plantao_12', label: 'Plantão 12h' },
  { value: 'plantao_24', label: 'Plantão 24h' },
];

interface FormDataType {
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
  departamento: string;
  ativo: boolean;
  selectedRoles: AppRole[];
  tipo_funcionario: string;
  registro_profissional: string;
  tipo_registro: string;
  uf_registro: string;
  especialidade: string;
  data_nascimento: string;
  cpf: string;
  carga_horaria: string;
  turno: string;
}

const initialFormData: FormDataType = {
  nome: '', email: '', telefone: '', cargo: '', departamento: '', ativo: true,
  selectedRoles: [],
  tipo_funcionario: 'atendente', registro_profissional: '', tipo_registro: '', uf_registro: 'SP',
  especialidade: '', data_nascimento: '', cpf: '', carga_horaria: '', turno: 'integral',
};

export default function Funcionarios() {
  const { profile } = useSupabaseAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [funcionarioToDelete, setFuncionarioToDelete] = useState<string | null>(null);
  const [editingFunc, setEditingFunc] = useState<FuncionarioWithRoles | null>(null);
  const [formData, setFormData] = useState<FormDataType>({ ...initialFormData });
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [customRoles, setCustomRoles] = useState<RoleCustomizations>({});
  const [editingCustomRoles, setEditingCustomRoles] = useState<RoleCustomizations>({});

  const queryClient = useQueryClient();

  // Load custom role config from configuracoes_clinica
  const { data: savedRoleConfig } = useQuery({
    queryKey: ['role-customization', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return null;
      const { data } = await supabase
        .from('configuracoes_clinica')
        .select('valor')
        .eq('chave', 'role_customization')
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      return data?.valor as unknown as RoleCustomizations | null;
    },
    enabled: !!profile?.clinica_id,
  });

  useEffect(() => {
    if (savedRoleConfig) {
      setCustomRoles(savedRoleConfig);
    }
  }, [savedRoleConfig]);

  // Build effective ROLE_CONFIG by merging defaults with customizations
  const ROLE_CONFIG = DEFAULT_ROLE_CONFIG.map(def => {
    const custom = customRoles[def.role];
    return {
      role: def.role,
      label: custom?.label || def.label,
      description: custom?.description || def.description,
      color: custom?.color || def.color,
      modules: custom?.modules || def.modules,
    };
  });

  const saveCustomizationMutation = useMutation({
    mutationFn: async (customizations: RoleCustomizations) => {
      if (!profile?.id || !profile?.clinica_id) throw new Error('Sem perfil');
      const { data: existing } = await supabase
        .from('configuracoes_clinica')
        .select('id')
        .eq('chave', 'role_customization')
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('configuracoes_clinica')
          .update({ valor: customizations as any })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('configuracoes_clinica')
          .insert({ chave: 'role_customization', valor: customizations as any, user_id: profile.id, clinica_id: profile.clinica_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-customization'] });
      toast.success('Permissões personalizadas salvas!');
      setIsCustomizeOpen(false);
    },
    onError: (e: any) => toast.error('Erro ao salvar: ' + e.message),
  });

  const handleOpenCustomize = () => {
    const initial: RoleCustomizations = {};
    DEFAULT_ROLE_CONFIG.forEach(def => {
      const custom = customRoles[def.role];
      initial[def.role] = {
        label: custom?.label || def.label,
        description: custom?.description || def.description,
        color: custom?.color || def.color,
        modules: custom?.modules || [...def.modules],
      };
    });
    setEditingCustomRoles(initial);
    setIsCustomizeOpen(true);
  };

  const handleSaveCustomization = () => {
    setCustomRoles(editingCustomRoles);
    saveCustomizationMutation.mutate(editingCustomRoles);
  };

  const handleResetCustomization = () => {
    const reset: RoleCustomizations = {};
    DEFAULT_ROLE_CONFIG.forEach(def => {
      reset[def.role] = {
        label: def.label,
        description: def.description,
        color: def.color,
        modules: [...def.modules],
      };
    });
    setEditingCustomRoles(reset);
  };

  const toggleModule = (role: string, mod: string) => {
    setEditingCustomRoles(prev => {
      const current = prev[role];
      if (!current) return prev;
      const modules = current.modules.includes(mod)
        ? current.modules.filter(m => m !== mod)
        : [...current.modules, mod];
      return { ...prev, [role]: { ...current, modules } };
    });
  };



  const { data: funcionarios = [], isLoading } = useQuery({
    queryKey: ['funcionarios-with-roles'],
    queryFn: async () => {
      const { data: funcs, error: funcsError } = await supabase
        .from('funcionarios')
        .select('*')
        .order('nome');
      if (funcsError) throw funcsError;

      const funcionariosWithRoles: FuncionarioWithRoles[] = (funcs || []).map((func: any) => {
        const roles = (func.pending_roles || []) as AppRole[];
        return { ...func, roles };
      });
      return funcionariosWithRoles;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormDataType) => {
      const { data: newFunc, error: funcError } = await supabase
        .from('funcionarios')
        .insert({
          nome: data.nome,
          email: data.email,
          telefone: data.telefone || null,
          cargo: data.cargo || null,
          departamento: data.departamento || null,
          ativo: data.ativo,
          clinica_id: profile?.clinica_id || null,
          tipo_funcionario: data.tipo_funcionario || 'atendente',
          registro_profissional: data.registro_profissional || null,
          tipo_registro: data.tipo_registro || null,
          uf_registro: data.uf_registro || null,
          especialidade: data.especialidade || null,
          data_nascimento: data.data_nascimento || null,
          cpf: data.cpf || null,
          carga_horaria: data.carga_horaria ? parseInt(data.carga_horaria) : null,
          turno: data.turno || 'integral',
          pending_roles: data.selectedRoles,
        } as any)
        .select()
        .single();
      if (funcError) throw funcError;

      // If employee already has an account, sync user_roles too
      if (data.email) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', data.email)
          .maybeSingle();
        if (profiles?.id) {
          // Vincula a conta existente ao funcionário recém-criado e define os
          // papéis. Mesma proteção do fluxo de edição: se a reinserção falhar
          // depois do delete, a pessoa fica sem nenhum acesso.
          const { error: vincErr } = await supabase
            .from('funcionarios').update({ user_id: profiles.id } as any).eq('id', newFunc.id);
          if (vincErr) throw vincErr;

          const { data: papeisAtuais } = await supabase
            .from('user_roles').select('role').eq('user_id', profiles.id);

          const { error: delErr } = await supabase
            .from('user_roles').delete().eq('user_id', profiles.id);
          if (delErr) throw delErr;

          if (data.selectedRoles.length > 0) {
            const { error: insErr } = await supabase
              .from('user_roles')
              .insert(data.selectedRoles.map(role => ({ user_id: profiles.id, role })));
            if (insErr) {
              if (papeisAtuais?.length) {
                await supabase.from('user_roles')
                  .insert(papeisAtuais.map(p => ({ user_id: profiles.id, role: p.role })));
              }
              throw insErr;
            }
          }
        }
      }
      return newFunc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
      toast.success('Funcionário cadastrado com sucesso!');
      setIsDialogOpen(false);
    },
    onError: (error: any) => toast.error('Erro ao cadastrar: ' + error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, userId }: { id: string; data: FormDataType; userId: string | null }) => {
      const { error: funcError } = await supabase
        .from('funcionarios')
        .update({
          nome: data.nome,
          email: data.email,
          telefone: data.telefone || null,
          cargo: data.cargo || null,
          departamento: data.departamento || null,
          ativo: data.ativo,
          tipo_funcionario: data.tipo_funcionario || 'atendente',
          registro_profissional: data.registro_profissional || null,
          tipo_registro: data.tipo_registro || null,
          uf_registro: data.uf_registro || null,
          especialidade: data.especialidade || null,
          data_nascimento: data.data_nascimento || null,
          cpf: data.cpf || null,
          carga_horaria: data.carga_horaria ? parseInt(data.carga_horaria) : null,
          turno: data.turno || 'integral',
          pending_roles: data.selectedRoles,
        } as any)
        .eq('id', id);
      if (funcError) throw funcError;

      // Sync user_roles if employee has an account
      //
      // Apaga tudo e reinsere. Os erros eram ignorados: se o insert falhasse
      // depois do delete, a pessoa ficava SEM NENHUM papel — trancada para fora
      // do sistema — e a tela anunciava sucesso. Num turno, isso é um médico
      // perdendo acesso ao prontuário no meio do atendimento.
      //
      // Guardamos os papéis atuais antes de apagar, para restaurá-los se a
      // reinserção falhar.
      if (userId) {
        const { data: papeisAtuais } = await supabase
          .from('user_roles').select('role').eq('user_id', userId);

        const { error: delErr } = await supabase
          .from('user_roles').delete().eq('user_id', userId);
        if (delErr) throw delErr;

        if (data.selectedRoles.length > 0) {
          const { error: insErr } = await supabase
            .from('user_roles')
            .insert(data.selectedRoles.map(role => ({ user_id: userId, role })));

          if (insErr) {
            // Devolve o que havia antes para não deixar a conta sem acesso
            if (papeisAtuais?.length) {
              await supabase.from('user_roles')
                .insert(papeisAtuais.map(p => ({ user_id: userId, role: p.role })));
            }
            throw insErr;
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
      toast.success('Funcionário atualizado com sucesso!');
      setIsDialogOpen(false);
    },
    onError: (error: any) => toast.error('Erro ao atualizar: ' + error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('funcionarios').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
      toast.success('Funcionário excluído com sucesso!');
      setDeleteDialogOpen(false);
    },
    onError: (error: any) => toast.error('Erro ao excluir: ' + error.message),
  });

  const inviteMutation = useMutation({
    mutationFn: async (func: FuncionarioWithRoles) => {
      if (!func.email) throw new Error('Funcionário não possui e-mail cadastrado');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Você precisa estar autenticado');
      const response = await supabase.functions.invoke('send-employee-invitation', {
        body: { funcionarioId: func.id, email: func.email, nome: func.nome, roles: func.roles },
      });
      if (response.error) throw new Error(response.error.message || 'Erro ao enviar convite');
      if (!response.data?.success) throw new Error(response.data?.error || 'Erro ao enviar convite');
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
      const codigo = data?.inviteCode || data?.token;
      toast.success(codigo ? `Convite enviado! Código: ${codigo}` : 'Convite enviado com sucesso!');
    },
    onError: (error: any) => toast.error('Erro ao enviar convite: ' + error.message),
  });

  const handleSendInvitation = (func: FuncionarioWithRoles) => {
    if (!func.email) { toast.error('Cadastre um e-mail primeiro'); return; }
    inviteMutation.mutate(func);
  };

  const filteredFuncionarios = funcionarios.filter(f =>
    f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenDialog = (func?: FuncionarioWithRoles) => {
    if (func) {
      const raw = func as any;
      setEditingFunc(func);
      setFormData({
        nome: func.nome, email: func.email || '', telefone: func.telefone || '',
        cargo: func.cargo || '', departamento: func.departamento || '',
        ativo: func.ativo ?? true, selectedRoles: func.roles || [],
        tipo_funcionario: raw.tipo_funcionario || 'atendente',
        registro_profissional: raw.registro_profissional || '',
        tipo_registro: raw.tipo_registro || '',
        uf_registro: raw.uf_registro || 'SP',
        especialidade: raw.especialidade || '',
        data_nascimento: raw.data_nascimento || '',
        cpf: raw.cpf || '',
        carga_horaria: raw.carga_horaria ? String(raw.carga_horaria) : '',
        turno: raw.turno || 'integral',
      });
    } else {
      setEditingFunc(null);
      setFormData({ ...initialFormData });
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.nome) { toast.error('Preencha o nome.'); return; }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { toast.error('E-mail inválido.'); return; }
    if (editingFunc) {
      updateMutation.mutate({ id: editingFunc.id, data: formData, userId: editingFunc.user_id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDeleteClick = (id: string) => { setFuncionarioToDelete(id); setDeleteDialogOpen(true); };
  const handleConfirmDelete = () => { if (funcionarioToDelete) deleteMutation.mutate(funcionarioToDelete); };

  const toggleRole = (role: AppRole) => {
    setFormData(prev => ({
      ...prev,
      selectedRoles: prev.selectedRoles.includes(role)
        ? prev.selectedRoles.filter(r => r !== role)
        : [...prev.selectedRoles, role],
    }));
  };

  const handleTipoChange = (tipo: string) => {
    const config = TIPO_FUNCIONARIO_CONFIG.find(t => t.value === tipo);
    setFormData(prev => ({
      ...prev,
      tipo_funcionario: tipo,
      tipo_registro: config?.registroTipo || '',
      cargo: config?.label || prev.cargo,
    }));
  };

  const getInitials = (nome: string) => nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const getRoleColor = (role: AppRole) => ROLE_CONFIG.find(r => r.role === role)?.color || 'bg-muted text-muted-foreground';
  const getRoleLabel = (role: AppRole) => ROLE_CONFIG.find(r => r.role === role)?.label || role;

  const selectedTipoConfig = TIPO_FUNCIONARIO_CONFIG.find(t => t.value === formData.tipo_funcionario);
  const hasRegistro = !!selectedTipoConfig?.registroLabel;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Funcionários</h1>
          <p className="text-muted-foreground">Gerencie a equipe e suas permissões de acesso</p>
        </div>
        <div className="flex gap-2">
          <ConvidarFuncionarioDialog
            trigger={
              <Button variant="outline" className="gap-2">
                <Mail className="h-4 w-4" />Convidar por e-mail
              </Button>
            }
          />
          <Button variant="outline" onClick={handleOpenCustomize} className="gap-2">
            <Settings2 className="h-4 w-4" />Personalizar Permissões
          </Button>
          <Button onClick={() => handleOpenDialog()} className="gap-2">
            <Plus className="h-4 w-4" />Novo Funcionário
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />Equipe ({filteredFuncionarios.length})
            </CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou e-mail..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Tipo / Registro</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead className="hidden md:table-cell">Turno</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFuncionarios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum funcionário encontrado</TableCell>
                  </TableRow>
                ) : (
                  filteredFuncionarios.map((func) => {
                    const raw = func as any;
                    const tipoConfig = TIPO_FUNCIONARIO_CONFIG.find(t => t.value === raw.tipo_funcionario);
                    return (
                      <TableRow key={func.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="bg-primary/10 text-primary">{getInitials(func.nome)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{func.nome}</p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                {func.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{func.email}</span>}
                              </div>
                              {func.cargo && <p className="text-xs text-muted-foreground">{func.cargo}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant="outline" className="text-xs">{tipoConfig?.label || 'Atendente'}</Badge>
                            {raw.registro_profissional && (
                              <p className="text-xs text-muted-foreground font-mono">
                                {raw.tipo_registro}: {raw.registro_profissional}{raw.uf_registro ? `/${raw.uf_registro}` : ''}
                              </p>
                            )}
                            {raw.especialidade && <p className="text-xs text-muted-foreground">{raw.especialidade}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {func.roles.length > 0 ? func.roles.map(role => (
                              <Badge key={role} className={getRoleColor(role)}>{getRoleLabel(role)}</Badge>
                            )) : <span className="text-sm text-muted-foreground">Sem permissões</span>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm">{TURNO_OPTIONS.find(t => t.value === raw.turno)?.label || '—'}</span>
                          {raw.carga_horaria && <span className="text-xs text-muted-foreground block">{raw.carga_horaria}h/sem</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={func.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                            {func.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {!func.user_id && func.email && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" onClick={() => handleSendInvitation(func)} disabled={inviteMutation.isPending}>
                                    {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-primary" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Enviar convite por e-mail</TooltipContent>
                              </Tooltip>
                            )}
                            {func.user_id && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center justify-center w-8 h-8">
                                    <CheckCircle className="h-4 w-4 text-success" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>Conta vinculada</TooltipContent>
                              </Tooltip>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => handleOpenDialog(func)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => handleDeleteClick(func.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

      {/* Dialog de Cadastro/Edição */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFunc ? 'Editar Funcionário' : 'Novo Funcionário'}</DialogTitle>
            <DialogDescription>
              {editingFunc ? 'Atualize os dados e permissões.' : 'Cadastre um novo funcionário com seus dados profissionais.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Tipo de Profissional */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4" />Tipo de Profissional *
              </Label>
              <Select value={formData.tipo_funcionario} onValueChange={handleTipoChange}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {TIPO_FUNCIONARIO_CONFIG.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Dados Pessoais */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold">Dados Pessoais</Label>
              <div className="space-y-2">
                <Label className="text-xs">Nome completo *</Label>
                <Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} placeholder="Nome Sobrenome" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">CPF</Label>
                  <Input value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} placeholder="000.000.000-00" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Data de Nascimento</Label>
                  <Input type="date" value={formData.data_nascimento} onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">E-mail</Label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@clinica.com" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Telefone</Label>
                  <Input value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} placeholder="(11) 99999-9999" />
                </div>
              </div>
            </div>

            {/* Registro Profissional — só aparece para tipos com conselho */}
            {hasRegistro && (
              <>
                <Separator />
                <div className="space-y-4">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Stethoscope className="h-4 w-4" />Registro Profissional ({selectedTipoConfig?.registroLabel})
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Nº do Registro *</Label>
                      <Input value={formData.registro_profissional}
                        onChange={(e) => setFormData({ ...formData, registro_profissional: e.target.value })}
                        placeholder={`Ex: 12345`} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Conselho</Label>
                      <Input value={formData.tipo_registro} readOnly className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">UF</Label>
                      <Select value={formData.uf_registro} onValueChange={v => setFormData({ ...formData, uf_registro: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-48">
                          {UF_OPTIONS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Especialidade</Label>
                    <Input value={formData.especialidade}
                      onChange={(e) => setFormData({ ...formData, especialidade: e.target.value })}
                      placeholder="Ex: Análises Clínicas, Cardiologia" />
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Dados Funcionais */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold">Dados Funcionais</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Cargo</Label>
                  <Input value={formData.cargo} onChange={(e) => setFormData({ ...formData, cargo: e.target.value })} placeholder="Ex: Recepcionista" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Departamento</Label>
                  <Input value={formData.departamento} onChange={(e) => setFormData({ ...formData, departamento: e.target.value })} placeholder="Ex: Atendimento" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Turno</Label>
                  <Select value={formData.turno} onValueChange={v => setFormData({ ...formData, turno: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TURNO_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Carga Horária (h/semana)</Label>
                  <Input type="number" value={formData.carga_horaria} onChange={(e) => setFormData({ ...formData, carga_horaria: e.target.value })} placeholder="40" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Funcionário ativo</Label>
                <Switch checked={formData.ativo} onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })} />
              </div>
            </div>

            <Separator />

            {/* Permissões de Acesso */}
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Permissões de Acesso</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Selecione o que este funcionário pode acessar no sistema.
                  {!editingFunc?.user_id && editingFunc && (
                    <span className="block text-muted-foreground mt-1">
                      💡 As permissões serão salvas e aplicadas automaticamente quando o funcionário criar a conta.
                    </span>
                  )}
                </p>
              </div>
              <div className="grid gap-3">
                {ROLE_CONFIG.map(({ role, label, description, color }) => (
                  <div key={role}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      formData.selectedRoles.includes(role) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => toggleRole(role)}>
                    <Checkbox checked={formData.selectedRoles.includes(role)} onCheckedChange={() => toggleRole(role)} className="mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{label}</span>
                        <Badge className={color} variant="secondary">{role}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingFunc ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Personalizar Permissões */}
      <Dialog open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />Personalizar Permissões de Acesso
            </DialogTitle>
            <DialogDescription>
              Edite os nomes, descrições e módulos de cada nível de permissão da sua clínica.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {DEFAULT_ROLE_CONFIG.map((def) => {
              const custom = editingCustomRoles[def.role];
              if (!custom) return null;
              return (
                <motion.div
                  key={def.role}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border rounded-lg p-4 space-y-4"
                >
                  <div className="flex items-center gap-3">
                    <Badge className={def.color} variant="secondary">{def.role}</Badge>
                    <span className="text-sm text-muted-foreground">Permissão do sistema</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Nome de exibição</Label>
                      <Input
                        value={custom.label}
                        onChange={(e) => setEditingCustomRoles(prev => ({
                          ...prev,
                          [def.role]: { ...prev[def.role], label: e.target.value }
                        }))}
                        placeholder={def.label}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Descrição</Label>
                      <Input
                        value={custom.description}
                        onChange={(e) => setEditingCustomRoles(prev => ({
                          ...prev,
                          [def.role]: { ...prev[def.role], description: e.target.value }
                        }))}
                        placeholder={def.description}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Módulos com acesso</Label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_MODULES.map(mod => (
                        <Badge
                          key={mod}
                          variant={custom.modules.includes(mod) ? 'default' : 'outline'}
                          className="cursor-pointer transition-all hover:scale-105 select-none"
                          onClick={() => toggleModule(def.role, mod)}
                        >
                          {mod}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={handleResetCustomization} className="gap-2 mr-auto">
              <RotateCcw className="h-4 w-4" />Restaurar Padrão
            </Button>
            <Button variant="outline" onClick={() => setIsCustomizeOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveCustomization} disabled={saveCustomizationMutation.isPending} className="gap-2">
              {saveCustomizationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Personalização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
