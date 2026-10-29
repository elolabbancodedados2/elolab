import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Plus, Search, Pencil, Trash2, Users, Mail, Phone, Loader2, Send, CheckCircle, Stethoscope, Briefcase, Settings2, Save, RotateCcw, RefreshCw, X, ShieldCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { PageHeader } from '@/components/PageHeader';
import { SectionFallback } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { validateCPF } from '@/lib/formatters';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { RoleAccessPreview } from '@/components/RoleAccessPreview';
import { shouldWarnAboutLastAdmin } from '@/lib/lastAdminWarning';
import { cn } from '@/lib/utils';

interface FuncionarioWithRoles {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  cargo: string | null;
  departamento: string | null;
  ativo: boolean | null;
  edit_version: number;
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

const TIPO_FUNCIONARIO_CONFIG: { value: string; label: string; registroLabel?: string; registroTipo?: string }[] = [
  { value: 'medico', label: 'Médico(a)', registroLabel: 'CRM', registroTipo: 'CRM' },
  { value: 'enfermeiro', label: 'Enfermeira(o)', registroLabel: 'COREN', registroTipo: 'COREN' },
  { value: 'tecnico_enfermagem', label: 'Técnico(a) de Enfermagem', registroLabel: 'COREN', registroTipo: 'COREN' },
  { value: 'tecnico_laboratorio', label: 'Técnico(a) de Laboratório', registroLabel: 'CRT', registroTipo: 'CRT' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'recepcionista', label: 'Recepcionista' },
  { value: 'financeiro', label: 'Financeiro(a)' },
  { value: 'gerente', label: 'Gerente / Dono(a)' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'outro', label: 'Outro' },
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

type EmployeeTask = 'new' | 'edit' | 'labels';
export default function Funcionarios({ task }: { task?: EmployeeTask }) {
  const location = useLocation();
  return <FuncionariosWorkspace key={location.pathname} task={task} />;
}
function FuncionariosWorkspace({ task }: { task?: EmployeeTask }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { employeeId } = useParams();
  const formPage = task === 'new' || task === 'edit';
  const labelsPage = task === 'labels';
  const taskPage = !!task;
  const initialized = useRef(false);
  const completed = useRef(false);
  const saveLock = useRef(false);
  const baseline = useRef(JSON.stringify(initialFormData));
  const labelsBaseline = useRef('{}');
  const returnTo = typeof location.state?.employeeReturn === 'string' && /^\/equipe(?:\?|$)/.test(location.state.employeeReturn) ? location.state.employeeReturn : '/equipe?aba=funcionarios';
  const leaveTask = () => navigate(returnTo, { state: { employeeFilters: location.state?.employeeFilters } });
  const finishTask = () => { completed.current = true; leaveTask(); };
  const { user, profile } = useSupabaseAuth();
  const [searchTerm, setSearchTerm] = useState(location.state?.employeeFilters?.search ?? '');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'ativo' | 'inativo' | 'sem_permissao'>(location.state?.employeeFilters?.status ?? 'todos');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [funcionarioToDelete, setFuncionarioToDelete] = useState<string | null>(null);
  const [editingFunc, setEditingFunc] = useState<FuncionarioWithRoles | null>(null);
  const [formData, setFormData] = useState<FormDataType>({ ...initialFormData });
  const [customRoles, setCustomRoles] = useState<RoleCustomizations>({});
  const [editingCustomRoles, setEditingCustomRoles] = useState<RoleCustomizations>({});

  const queryClient = useQueryClient();

  // Load custom role config from configuracoes_clinica
  const roleConfigQuery = useQuery({
    queryKey: ['role-customization', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return null;
      const { data, error } = await supabase
        .from('configuracoes_clinica')
        .select('valor')
        .eq('chave', 'role_customization')
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      if (error) throw error;
      return (data?.valor ?? null) as unknown as RoleCustomizations | null;
    },
    enabled: !!profile?.clinica_id,
  });
  const savedRoleConfig = roleConfigQuery.data;

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
      if (roleConfigQuery.isError || roleConfigQuery.isLoading) throw new Error('Carregue a configuração atual antes de salvar.');
      const { data: existing, error: readError } = await supabase
        .from('configuracoes_clinica')
        .select('id')
        .eq('chave', 'role_customization')
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      if (readError) throw readError;

      if (existing) {
        const { data, error } = await supabase
          .from('configuracoes_clinica')
          .update({ valor: customizations as any })
          .eq('id', existing.id).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Configuração não encontrada ou sem permissão para alterar.');
      } else {
        const { error } = await supabase
          .from('configuracoes_clinica')
          .insert({ chave: 'role_customization', valor: customizations as any, user_id: profile.id, clinica_id: profile.clinica_id });
        if (error) throw error;
      }
    },
    onSuccess: (_result, customizations) => {
      setCustomRoles(customizations);
      queryClient.invalidateQueries({ queryKey: ['role-customization'] });
      toast.success('Nomes e descrições dos perfis salvos!');
      finishTask();
    },
    onError: (e: any) => toast.error('Erro ao salvar: ' + e.message),
  });

  const openTask = (path: string) => navigate(path, { state: { employeeReturn: location.pathname + location.search, employeeFilters: { search: searchTerm, status: filterStatus } } });
  const handleOpenCustomize = () => openTask('/equipe/funcionarios/perfis');
  useEffect(() => {
    if (!labelsPage || initialized.current || roleConfigQuery.isPending || roleConfigQuery.isError) return;
    const initial: RoleCustomizations = {};
    DEFAULT_ROLE_CONFIG.forEach(def => {
      const custom = savedRoleConfig?.[def.role];
      initial[def.role] = { label: custom?.label || def.label, description: custom?.description || def.description, color: custom?.color || def.color, modules: custom?.modules || [...def.modules] };
    });
    labelsBaseline.current = JSON.stringify(initial);
    initialized.current = true;
    setEditingCustomRoles(initial);
  }, [labelsPage, savedRoleConfig, roleConfigQuery.isPending, roleConfigQuery.isError]);
  const handleSaveCustomization = async () => {
    if (saveLock.current) return;
    saveLock.current = true;
    try { await saveCustomizationMutation.mutateAsync(editingCustomRoles); } catch { /* Mutation reports errors. */ }
    finally { saveLock.current = false; }
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

  const funcionariosQuery = useQuery({
    queryKey: ['funcionarios-with-roles', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      const { data: funcs, error: funcsError } = await (supabase as any)
        .rpc('listar_funcionarios_equipe_admin');
      if (funcsError) throw funcsError;

      const funcionariosWithRoles: FuncionarioWithRoles[] = (funcs || []).map((func: any) => {
        const roles = (func.pending_roles || []) as AppRole[];
        return { ...func, roles };
      });
      return funcionariosWithRoles;
    },
    enabled: !!user && !!profile?.clinica_id,
  });
  const funcionarios = funcionariosQuery.data ?? [];
  const { isLoading } = funcionariosQuery;

  const createMutation = useMutation({
    mutationFn: async (data: FormDataType) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Recarregue a página e tente novamente.');
      const { data: newFunc, error: funcError } = await supabase
        .from('funcionarios')
        .insert({
          nome: data.nome,
          email: data.email.trim().toLocaleLowerCase('pt-BR'),
          telefone: data.telefone || null,
          cargo: data.cargo || null,
          departamento: data.departamento || null,
          ativo: data.ativo,
          clinica_id: profile.clinica_id,
          tipo_funcionario: data.tipo_funcionario || 'atendente',
          registro_profissional: data.registro_profissional || null,
          tipo_registro: data.tipo_registro || null,
          uf_registro: data.uf_registro || null,
          especialidade: data.especialidade || null,
          data_nascimento: data.data_nascimento || null,
          cpf: data.cpf || null,
          carga_horaria: data.carga_horaria ? parseInt(data.carga_horaria) : null,
          turno: data.turno || 'integral',
        } as any)
        .select('id')
        .single();
      if (funcError) throw funcError;

      try {
        // If employee already has an account, link it and sync its roles atomically.
        let linkedUserId: string | null = null;
        if (data.email) {
          const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', data.email.trim().toLocaleLowerCase('pt-BR'))
            .eq('clinica_id', profile.clinica_id)
            .maybeSingle();
          if (profileError) throw profileError;
          linkedUserId = profiles?.id ?? null;
        }
        const { error: rolesError } = await supabase.rpc('sync_employee_roles' as any, {
          _funcionario_id: newFunc.id,
          _user_id: linkedUserId,
          _roles: data.selectedRoles,
          _ativo: data.ativo,
        } as any);
        if (rolesError) throw rolesError;
      } catch (error) {
        const partialError = new Error(error instanceof Error ? error.message : String(error)) as Error & { funcionarioCriado?: boolean };
        partialError.funcionarioCriado = true;
        throw partialError;
      }
      return newFunc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
      toast.success('Funcionário cadastrado com sucesso!');
      finishTask();
    },
    onError: (error: any) => {
      if (error?.funcionarioCriado) {
        queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
        finishTask();
        toast.warning('Funcionário cadastrado, mas as permissões não foram sincronizadas.', {
          description: 'O registro está na lista. Abra a edição e salve novamente para concluir o vínculo e as permissões.',
        });
      } else toast.error('Erro ao cadastrar: ' + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, userId, expectedVersion }: { id: string; data: FormDataType; userId: string | null; expectedVersion: number }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data: updatedFunc, error: funcError } = await (supabase as any)
        .from('funcionarios')
        .update({
          nome: data.nome,
          email: data.email.trim().toLocaleLowerCase('pt-BR'),
          telefone: data.telefone || null,
          cargo: data.cargo || null,
          departamento: data.departamento || null,
          tipo_funcionario: data.tipo_funcionario || 'atendente',
          registro_profissional: data.registro_profissional || null,
          tipo_registro: data.tipo_registro || null,
          uf_registro: data.uf_registro || null,
          especialidade: data.especialidade || null,
          data_nascimento: data.data_nascimento || null,
          cpf: data.cpf || null,
          carga_horaria: data.carga_horaria ? parseInt(data.carga_horaria) : null,
          turno: data.turno || 'integral',
        })
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .eq('edit_version', expectedVersion)
        .select('id, edit_version')
        .maybeSingle();
      if (funcError) throw funcError;
      if (!updatedFunc) {
        const conflict = new Error('Outra pessoa alterou esta ficha. Seus dados não foram salvos; atualize a lista e reabra a edição.');
        conflict.name = 'EmployeeEditConflictError';
        throw conflict;
      }

      try {
        let linkedUserId = userId;
        if (!linkedUserId && data.email) {
          const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', data.email.trim().toLocaleLowerCase('pt-BR'))
            .eq('clinica_id', profile.clinica_id)
            .maybeSingle();
          if (profileError) throw profileError;
          linkedUserId = profiles?.id ?? null;
        }
        // O RPC troca os papéis numa única transação e preserva o último admin.
        const { error: rolesError } = await supabase.rpc('sync_employee_roles_if_unchanged' as any, {
          _funcionario_id: id,
          _user_id: linkedUserId,
          _roles: data.selectedRoles,
          _ativo: data.ativo,
          _expected_version: updatedFunc.edit_version,
        } as any);
        if (rolesError) throw rolesError;
      } catch (error) {
        const concorrencia = (error as { code?: string } | null)?.code === '40001';
        const partialError = new Error(error instanceof Error ? error.message : String(error)) as Error & { funcionarioAtualizado?: boolean; conflitoConcorrencia?: boolean };
        partialError.funcionarioAtualizado = true;
        partialError.conflitoConcorrencia = concorrencia;
        throw partialError;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
      if (variables.data.ativo) {
        toast.success('Funcionário atualizado com sucesso!');
      } else {
        toast.success('Funcionário inativado e sessões encerradas.', {
          description: 'Uma sessão já aberta pode continuar válida até o token atual expirar.',
        });
      }
      finishTask();
    },
    onError: (error: any) => {
      if (error?.name === 'EmployeeEditConflictError') {
        queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
        toast.error('A ficha mudou desde que você abriu a edição.', { description: 'Seu preenchimento foi preservado. Volte à lista e reabra a ficha para comparar os dados atuais.' });
      } else if (error?.conflitoConcorrencia) {
        queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
        toast.warning('Dados cadastrais salvos; permissões não alteradas.', {
          description: 'Outra pessoa atualizou esta ficha antes da confirmação dos papéis. Reabra a edição para conferir os dados atuais.',
        });
        finishTask();
      } else if (error?.funcionarioAtualizado) {
        queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
        toast.warning('Dados atualizados, mas as permissões não foram sincronizadas.', {
          description: 'Revise o funcionário na lista e salve novamente para concluir o vínculo e as permissões.',
        });
        finishTask();
      } else toast.error('Erro ao atualizar: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { error } = await supabase.rpc('excluir_funcionario_revogando_acesso' as any, {
        p_funcionario_id: id,
      } as any);
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
      if (!func.ativo) throw new Error('Ative o funcionário antes de enviar o convite.');
      if (!func.email) throw new Error('Funcionário não possui e-mail cadastrado');
      if (!func.roles?.length) {
        throw new Error(
          'Defina a função deste funcionário antes de convidar. Sem função, ele entra no sistema e não vê nenhuma tela.'
        );
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Você precisa estar autenticado');

      // Passou a usar invite-employee, o mesmo do botão "Convidar funcionário".
      // Conviviam dois sistemas de convite gravando em tabelas diferentes, com
      // aceites diferentes — e o reenvio pulava de um para o outro, deixando o
      // original pendente. Este caminho também trata quem já tem conta, que era
      // onde o outro travava.
      const response = await supabase.functions.invoke('invite-employee', {
        body: { email: func.email, nome: func.nome, roles: func.roles },
      });
      if (response.error) throw new Error(response.error.message || 'Erro ao enviar convite');
      if (!response.data?.success) throw new Error(response.data?.error || 'Erro ao enviar convite');
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['funcionarios-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['convites-list'] });
      if (data?.emailStatus === 'sent') {
        toast.success('Convite enviado por e-mail.');
      } else {
        toast.info('Convite criado, mas o e-mail não foi enviado.', {
          description: 'Acesse a lista de convites para copiar o link e compartilhar.',
        });
      }
    },
    onError: (error: any) => toast.error('Erro ao enviar convite: ' + error.message),
  });

  const handleSendInvitation = (func: FuncionarioWithRoles) => {
    if (!func.email) { toast.error('Cadastre um e-mail primeiro'); return; }
    inviteMutation.mutate(func);
  };

  const salvandoFuncionario = createMutation.isPending || updateMutation.isPending;
  const normalizedSearch = normalizarTexto(searchTerm.trim());
  const totalAtivos = funcionarios.filter(f => f.ativo).length;
  const totalInativos = funcionarios.filter(f => !f.ativo).length;
  const totalSemPermissao = funcionarios.filter(f => f.ativo && f.roles.length === 0).length;
  const temFiltro = searchTerm.trim() !== '' || filterStatus !== 'todos';
  const limparFiltros = () => { setSearchTerm(''); setFilterStatus('todos'); };
  const filteredFuncionarios = funcionarios.filter(f => {
    const matchSearch = !normalizedSearch || normalizarTexto(`${f.nome} ${f.email || ''}`).includes(normalizedSearch);
    const matchStatus = filterStatus === 'todos'
      || (filterStatus === 'ativo' && f.ativo)
      || (filterStatus === 'inativo' && !f.ativo)
      || (filterStatus === 'sem_permissao' && f.ativo && f.roles.length === 0);
    return matchSearch && matchStatus;
  });

  const currentEmployee = employeeId ? funcionarios.find(employee => employee.id === employeeId) : null;
  useEffect(() => {
    if (!formPage || initialized.current || (employeeId && !currentEmployee)) return;
    const func = currentEmployee;
    const raw = func as any;
    const value: FormDataType = func ? {
      nome: func.nome, email: func.email || '', telefone: func.telefone || '',
      cargo: func.cargo || '', departamento: func.departamento || '',
      ativo: func.ativo ?? true, selectedRoles: func.roles || [],
      tipo_funcionario: raw.tipo_funcionario || 'atendente', registro_profissional: raw.registro_profissional || '',
      tipo_registro: raw.tipo_registro || '', uf_registro: raw.uf_registro || 'SP', especialidade: raw.especialidade || '',
      data_nascimento: raw.data_nascimento || '', cpf: raw.cpf || '', carga_horaria: raw.carga_horaria ? String(raw.carga_horaria) : '', turno: raw.turno || 'integral',
    } : { ...initialFormData };
    baseline.current = JSON.stringify(value);
    initialized.current = true;
    setEditingFunc(func ?? null);
    setFormData(value);
  }, [formPage, employeeId, currentEmployee]);
  const handleOpenDialog = (func?: FuncionarioWithRoles) => openTask(func ? `/equipe/funcionarios/${func.id}/editar` : '/equipe/funcionarios/novo');

  const handleSave = async () => {
    if (saveLock.current) return;
    if (roleConfigQuery.isError || roleConfigQuery.isPending) { toast.error('Carregue as configurações dos perfis antes de salvar.'); return; }
    const normalizedData = {
      ...formData,
      nome: formData.nome.trim(),
      email: formData.email.trim(),
    };
    if (!normalizedData.nome) { toast.error('Preencha o nome.'); return; }
    if (normalizedData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedData.email)) { toast.error('E-mail inválido.'); return; }
    if (normalizedData.cpf.trim() && !validateCPF(normalizedData.cpf)) { toast.error('CPF inválido.'); return; }
    const registroExigido = TIPO_FUNCIONARIO_CONFIG.find(tipo => tipo.value === normalizedData.tipo_funcionario)?.registroLabel;
    if (registroExigido && !normalizedData.registro_profissional.trim()) {
      toast.error(`Informe o número do ${registroExigido}.`);
      return;
    }
    saveLock.current = true;
    try {
      if (editingFunc) await updateMutation.mutateAsync({ id: editingFunc.id, data: normalizedData, userId: editingFunc.user_id, expectedVersion: editingFunc.edit_version });
      else await createMutation.mutateAsync(normalizedData);
    } catch { /* Mutation distinguishes failure from partial persistence. */ }
    finally { saveLock.current = false; }
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
      registro_profissional: '',
      tipo_registro: config?.registroTipo || '',
      cargo: config?.label || prev.cargo,
    }));
  };

  const getInitials = (nome: string) => nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const getRoleColor = (role: AppRole) => ROLE_CONFIG.find(r => r.role === role)?.color || 'bg-muted text-muted-foreground';
  const getRoleLabel = (role: AppRole) => ROLE_CONFIG.find(r => r.role === role)?.label || role;

  const selectedTipoConfig = TIPO_FUNCIONARIO_CONFIG.find(t => t.value === formData.tipo_funcionario);
  const hasRegistro = !!selectedTipoConfig?.registroLabel;

  if (isLoading && !taskPage) {
    return <SectionFallback rows={6} />;
  }
  if (!profile?.clinica_id) {
    return <ErrorState title="Clínica não identificada" description="Não é possível carregar ou alterar funcionários sem identificar a clínica atual." />;
  }

  if (funcionariosQuery.isError && !taskPage) {
    return <ErrorState title="Não foi possível carregar a equipe" error={funcionariosQuery.error} onRetry={() => void funcionariosQuery.refetch()} />;
  }
  if (roleConfigQuery.isError && !taskPage) {
    return <ErrorState title="Não foi possível carregar as configurações de função" description="A tela foi pausada para evitar salvar rótulos com base em uma configuração incompleta." error={roleConfigQuery.error} onRetry={() => void roleConfigQuery.refetch()} />;
  }

  const descricaoHeader = funcionarios.length === 0
    ? 'Gerencie a equipe e suas permissões de acesso'
    : `${funcionarios.length} funcionário(s) · ${totalAtivos} ativo(s)${totalSemPermissao > 0 ? ` · ${totalSemPermissao} sem permissão` : ''}`;

  const indicadores = [
    { key: 'sem_permissao' as const, label: 'Sem permissão', value: totalSemPermissao, icon: ShieldCheck, color: 'text-white', surface: 'bg-white/15', escuro: true, caption: 'ativos sem acesso definido' },
    { key: 'ativo' as const, label: 'Ativos', value: totalAtivos, icon: CheckCircle, color: 'text-success', surface: 'bg-success/10', escuro: false, caption: 'com acesso liberado' },
    { key: 'inativo' as const, label: 'Inativos', value: totalInativos, icon: UserX, color: 'text-muted-foreground', surface: 'bg-muted', escuro: false, caption: 'sem acesso ao sistema' },
    { key: 'todos' as const, label: 'Total', value: funcionarios.length, icon: Users, color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false, caption: 'toda a equipe' },
  ];

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      {taskPage && <UnsavedChangesGuard dirty={labelsPage ? JSON.stringify(editingCustomRoles) !== labelsBaseline.current : JSON.stringify(formData) !== baseline.current} busy={salvandoFuncionario || saveCustomizationMutation.isPending} completed={completed} />}
      {taskPage && <Button variant="outline" onClick={leaveTask}>Voltar aos funcionários</Button>}
      {taskPage && roleConfigQuery.isError && <ErrorState title="Não foi possível carregar as configurações de função" error={roleConfigQuery.error} onRetry={() => void roleConfigQuery.refetch()} />}
      {!taskPage && <>
      <PageHeader
        title="Funcionários"
        description={descricaoHeader}
        icon={<Users />}
        actions={
          <>
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => void funcionariosQuery.refetch()} aria-label="Atualizar funcionários" title="Atualizar funcionários">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="shrink-0 gap-2 rounded-full" onClick={() => navigate('/equipe/convites/novo', { state: { inviteReturn: location.pathname + location.search, inviteReturnState: { employeeFilters: { search: searchTerm, status: filterStatus } } } })}>
              <Mail className="h-4 w-4" />Convidar por e-mail
            </Button>
            <Button variant="outline" onClick={handleOpenCustomize} className="shrink-0 gap-2 rounded-full">
              <Settings2 className="h-4 w-4" />Personalizar perfis
            </Button>
            <Button onClick={() => handleOpenDialog()} className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
              <Plus className="h-4 w-4" />Novo Funcionário
            </Button>
          </>
        }
      />

      <section role="group" aria-label="Resumo da equipe" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {indicadores.map(ind => {
          const Icon = ind.icon;
          const ativo = filterStatus === ind.key;
          return (
            <button
              key={ind.key}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFilterStatus(ind.key === 'todos' ? 'todos' : (ativo ? 'todos' : ind.key))}
              className={cn(
                'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                ind.escuro && 'border-transparent bg-gradient-primary text-white',
                ativo && !ind.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
                ativo && ind.escuro && 'ring-2 ring-[#1080CA]/60',
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

      <Card className="overflow-hidden rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white">
                <Users className="h-4 w-4" />
              </span>
              Equipe
              <Badge variant="outline" className="rounded-full border-[#BFD8EE] text-[#1080CA]">{filteredFuncionarios.length} de {funcionarios.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input aria-label="Buscar funcionários por nome ou e-mail" placeholder="Buscar por nome ou e-mail..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-10 rounded-full pl-10 focus-visible:ring-[#1080CA]" />
              </div>
              {temFiltro && (
                <Button variant="ghost" size="sm" className="h-10 shrink-0 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}>
                  <X className="h-3.5 w-3.5" /> Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border/60">
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
                    <TableCell colSpan={6} className="p-0">
                      {temFiltro ? (
                        <ActionableEmptyState
                          icon={Search}
                          title="Nenhum funcionário corresponde aos filtros"
                          description={normalizedSearch ? `Não encontramos funcionários para “${searchTerm.trim()}”.` : 'Limpe os filtros para ver toda a equipe.'}
                          actionLabel="Limpar filtros"
                          onAction={limparFiltros}
                          className="px-4 py-8"
                        />
                      ) : (
                        <ActionableEmptyState
                          icon={Users}
                          title="Nenhum funcionário cadastrado"
                          description="Cadastre sua equipe para definir permissões e enviar convites com o acesso adequado."
                          actionLabel="Cadastrar funcionário"
                          actionIcon={Plus}
                          onAction={() => handleOpenDialog()}
                          className="px-4 py-8"
                        />
                      )}
                    </TableCell>
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
                            <Badge variant="outline" className="rounded-full text-xs">{tipoConfig?.label || 'Atendente'}</Badge>
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
                              <Badge key={role} className={cn('rounded-full', getRoleColor(role))}>{getRoleLabel(role)}</Badge>
                            )) : (
                              <Badge variant="outline" className="gap-1 rounded-full border-warning/40 bg-warning/10 text-warning-foreground">Sem permissões</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm">{TURNO_OPTIONS.find(t => t.value === raw.turno)?.label || '—'}</span>
                          {raw.carga_horaria && <span className="text-xs text-muted-foreground block">{raw.carga_horaria}h/sem</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('rounded-full', func.ativo ? 'border-success/30 bg-success/10 text-success-foreground' : 'border-border bg-muted text-muted-foreground')} variant="outline">
                            {func.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {!func.user_id && func.email && func.ativo && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex" tabIndex={func.roles.length === 0 ? 0 : undefined}>
                                    <Button aria-label={func.roles.length > 0 ? 'Enviar convite por e-mail' : 'Defina uma função antes de enviar convite'} size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => handleSendInvitation(func)} disabled={inviteMutation.isPending || func.roles.length === 0}>
                                      {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-[#1080CA]" />}
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {func.roles.length > 0 ? 'Enviar convite por e-mail' : 'Defina e salve ao menos uma função antes de enviar o convite.'}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {func.user_id && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span role="status" aria-label="Conta vinculada" tabIndex={0} className="flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                                    <CheckCircle className="h-4 w-4 text-success" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Conta vinculada</TooltipContent>
                              </Tooltip>
                            )}
                            <Button aria-label={`Editar funcionário ${func.nome}`} size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => handleOpenDialog(func)}><Pencil className="h-4 w-4" /></Button>
                            <Button aria-label={`Excluir funcionário ${func.nome}`} size="icon" variant="ghost" className="h-9 w-9 rounded-full hover:bg-destructive/10" onClick={() => handleDeleteClick(func.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
      {formPage && (funcionariosQuery.isError ? <ErrorState title="Não foi possível abrir o funcionário" error={funcionariosQuery.error} onRetry={() => void funcionariosQuery.refetch()} />
        : isLoading ? <p role="status">Carregando funcionário…</p>
        : employeeId && !currentEmployee ? <p role="status">Funcionário não encontrado na clínica atual.</p>
        : <form onSubmit={event => { event.preventDefault(); void handleSave(); }} className="mx-auto max-w-4xl space-y-6 rounded-xl border bg-card p-5 sm:p-8">
          <header className="space-y-2 border-b pb-5"><p className="text-sm text-muted-foreground">Equipe / Funcionários</p><h1 className="text-2xl font-semibold">{editingFunc ? 'Editar Funcionário' : 'Novo Funcionário'}</h1><p className="text-sm text-muted-foreground">{editingFunc ? 'Atualize os dados e permissões do funcionário.' : 'Cadastre um novo funcionário com seus dados profissionais.'}</p></header>
          <fieldset disabled={salvandoFuncionario} className="contents">
          <div className="space-y-6 py-4">
            {/* Tipo de Profissional */}
            <div className="space-y-2">
              <Label htmlFor="func-tipo" className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4" />Tipo de Profissional *
              </Label>
              <Select value={formData.tipo_funcionario} onValueChange={handleTipoChange}>
                <SelectTrigger id="func-tipo"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
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
              <h3 className="text-sm font-semibold">Dados Pessoais</h3>
              <div className="space-y-2">
                <Label htmlFor="func-nome" className="text-xs">Nome completo *</Label>
                <Input required id="func-nome" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} placeholder="Nome Sobrenome" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="func-cpf" className="text-xs">CPF</Label>
                  <Input id="func-cpf" value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} placeholder="000.000.000-00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="func-data-nascimento" className="text-xs">Data de Nascimento</Label>
                  <Input id="func-data-nascimento" type="date" value={formData.data_nascimento} onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="func-email" className="text-xs">E-mail de contato / convite</Label>
                  <Input id="func-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@clinica.com" />
                  {editingFunc?.user_id && (
                    <p className="text-xs text-muted-foreground">
                      Alterar este contato não troca o e-mail usado para entrar na conta vinculada.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="func-telefone" className="text-xs">Telefone</Label>
                  <Input id="func-telefone" value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} placeholder="(11) 99999-9999" />
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
                      <Label htmlFor="func-registro" className="text-xs">Nº do Registro *</Label>
                      <Input id="func-registro" value={formData.registro_profissional}
                        onChange={(e) => setFormData({ ...formData, registro_profissional: e.target.value })}
                        placeholder={`Ex: 12345`} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="func-conselho" className="text-xs">Conselho</Label>
                      <Input id="func-conselho" value={formData.tipo_registro} readOnly className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="func-uf" className="text-xs">UF</Label>
                      <Select value={formData.uf_registro} onValueChange={v => setFormData({ ...formData, uf_registro: v })}>
                        <SelectTrigger id="func-uf"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-48">
                          {UF_OPTIONS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="func-especialidade" className="text-xs">Especialidade</Label>
                    <Input id="func-especialidade" value={formData.especialidade}
                      onChange={(e) => setFormData({ ...formData, especialidade: e.target.value })}
                      placeholder="Ex: Análises Clínicas, Cardiologia" />
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Dados Funcionais */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Dados Funcionais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="func-cargo" className="text-xs">Cargo</Label>
                  <Input id="func-cargo" value={formData.cargo} onChange={(e) => setFormData({ ...formData, cargo: e.target.value })} placeholder="Ex: Recepcionista" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="func-departamento" className="text-xs">Departamento</Label>
                  <Input id="func-departamento" value={formData.departamento} onChange={(e) => setFormData({ ...formData, departamento: e.target.value })} placeholder="Ex: Atendimento" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="func-turno" className="text-xs">Turno</Label>
                  <Select value={formData.turno} onValueChange={v => setFormData({ ...formData, turno: v })}>
                    <SelectTrigger id="func-turno"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TURNO_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="func-carga-horaria" className="text-xs">Carga Horária (h/semana)</Label>
                  <Input id="func-carga-horaria" type="number" value={formData.carga_horaria} onChange={(e) => setFormData({ ...formData, carga_horaria: e.target.value })} placeholder="40" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="func-ativo">Funcionário ativo</Label>
                <Switch id="func-ativo" checked={formData.ativo} onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })} />
              </div>
            </div>

            <Separator />

            {/* Permissões de Acesso */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Permissões de Acesso</h3>
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
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      formData.selectedRoles.includes(role) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                    >
                    <Checkbox id={`func-role-${role}`} checked={formData.selectedRoles.includes(role)} onCheckedChange={() => toggleRole(role)} className="mt-0.5" />
                    <label htmlFor={`func-role-${role}`} className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{label}</span>
                        <Badge className={color} variant="secondary">{role}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </label>
                  </div>
                ))}
              </div>
              <RoleAccessPreview
                roles={formData.selectedRoles}
                warnAboutLastAdmin={Boolean(editingFunc && shouldWarnAboutLastAdmin({
                  userLinked: Boolean(editingFunc.user_id),
                  currentActive: editingFunc.ativo,
                  currentRoles: editingFunc.roles,
                  nextActive: formData.ativo,
                  nextRoles: formData.selectedRoles,
                }))}
              />
            </div>
          </div>
          </fieldset>

          <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button type="button" variant="outline" onClick={leaveTask} disabled={salvandoFuncionario}>Cancelar</Button>
            <Button type="submit" className="scroll-mb-24" disabled={salvandoFuncionario || roleConfigQuery.isError || roleConfigQuery.isPending}>
              {salvandoFuncionario && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingFunc ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>)}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {labelsPage && !roleConfigQuery.isError && (roleConfigQuery.isPending ? <p role="status">Carregando nomes dos perfis…</p> : <form onSubmit={event => { event.preventDefault(); void handleSaveCustomization(); }} className="mx-auto max-w-4xl space-y-6 rounded-xl border bg-card p-5 sm:p-8">
        <header className="space-y-2 border-b pb-5"><h1 className="text-2xl font-semibold">Personalizar perfis</h1><p className="text-sm text-muted-foreground">Personalize os nomes e as descrições dos perfis. O acesso efetivo continua definido pelas funções do sistema.</p></header>
        <fieldset disabled={saveCustomizationMutation.isPending} className="min-w-0">
          <div className="space-y-6 py-4">
            {DEFAULT_ROLE_CONFIG.map((def) => {
              const custom = editingCustomRoles[def.role];
              if (!custom) return null;
              return (
                <div
                  key={def.role}
                  className="border rounded-lg p-4 space-y-4"
                >
                  <div className="flex items-center gap-3">
                    <Badge className={def.color} variant="secondary">{def.role}</Badge>
                    <span className="text-sm text-muted-foreground">Permissão do sistema</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`role-label-${def.role}`} className="text-xs font-medium">Nome de exibição</Label>
                      <Input
                        id={`role-label-${def.role}`}
                        value={custom.label}
                        onChange={(e) => setEditingCustomRoles(prev => ({
                          ...prev,
                          [def.role]: { ...prev[def.role], label: e.target.value }
                        }))}
                        placeholder={def.label}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`role-description-${def.role}`} className="text-xs font-medium">Descrição</Label>
                      <Input
                        id={`role-description-${def.role}`}
                        value={custom.description}
                        onChange={(e) => setEditingCustomRoles(prev => ({
                          ...prev,
                          [def.role]: { ...prev[def.role], description: e.target.value }
                        }))}
                        placeholder={def.description}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">As permissões de acesso são aplicadas pela função selecionada no cadastro do funcionário. Esta personalização não concede nem remove acesso a módulos.</p>
                </div>
              );
            })}
          </div>

          </fieldset>
          <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button type="button" variant="ghost" disabled={saveCustomizationMutation.isPending} onClick={handleResetCustomization} className="gap-2 mr-auto rounded-full">
              <RotateCcw className="h-4 w-4" />Restaurar nomes padrão
            </Button>
            <Button type="button" variant="outline" disabled={saveCustomizationMutation.isPending} onClick={leaveTask}>Cancelar</Button>
            <Button type="submit" disabled={saveCustomizationMutation.isPending} className="gap-2 scroll-mb-24">
              {saveCustomizationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar nomes e descrições
            </Button>
          </div>
        </form>)}
    </div>
  );
}
