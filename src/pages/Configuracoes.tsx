import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Save, Building, Clock, Bell, Download, History,
  Shield, Globe, Mail, Smartphone, MessageSquare, Database,
  Key, RefreshCw, CloudOff, Cloud,
  DollarSign, Printer, MapPin, Phone, FileText, Users, Plus, Trash2, Edit,
  CreditCard, Receipt, Loader2, Hash, Clipboard, Image,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/ConfirmDialog';
import { BackupRestore } from '@/components/BackupRestore';
import { AuditLog } from '@/components/AuditLog';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from '@/contexts/ThemeContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserPlan, usePlanos } from '@/hooks/useSubscriptionPlan';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';




/* ─── Types ─── */
interface ConfiguracaoClinica {
  nomeClinica: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  celular: string;
  email: string;
  website: string;
  cnes: string;
  responsavelTecnico: string;
  crmResponsavel: string;
  especialidadePrincipal: string;
  logoUrl: string;
  horarioAbertura: string;
  horarioFechamento: string;
  horarioAlmocoInicio: string;
  horarioAlmocoFim: string;
  duracaoConsulta: number;
  intervaloConsultas: number;
  diasFuncionamento: string[];
  sabadoAbertura: string;
  sabadoFechamento: string;
}

interface ConfiguracaoNotificacoes {
  emailLembrete: boolean;
  smsLembrete: boolean;
  whatsappLembrete: boolean;
  antecedenciaLembrete: number;
  notificarCancelamento: boolean;
  notificarNovoAgendamento: boolean;
  notificarResultadoExame: boolean;
  notificarAniversario: boolean;
  notificarEstoqueBaixo: boolean;
  notificarContasVencer: boolean;
  resumoDiario: boolean;
}

interface ConfiguracaoFinanceiro {
  formasPagamento: string[];
  valorConsultaPadrao: number;
  valorRetornoPadrao: number;
  taxaCartaoCredito: number;
  taxaCartaoDebito: number;
  diasVencimentoBoleto: number;
  chavePix: string;
  tipoChavePix: string;
  gerarBoletoAutomatico: boolean;
  faturamentoAutomatico: boolean;
  categoriasPadrao: string[];
}

interface ConfiguracaoSeguranca {
  sessionTimeoutMin: number;
  mascarCpf: boolean;
  logAuditoria: boolean;
  lgpdConsentimento: boolean;
  senhaForte: boolean;
  loginDuplo: boolean;
}

interface ConfiguracaoImpressao {
  cabecalhoReceita: string;
  rodapeReceita: string;
  mostrarLogo: boolean;
  mostrarCRM: boolean;
  mostrarCNES: boolean;
  tamanhoPapel: string;
  margemSuperior: number;
  margemInferior: number;
  margemEsquerda: number;
  margemDireita: number;
  fontePrincipal: string;
  tamanhoFonte: number;
}

const DEFAULT_CLINICA: ConfiguracaoClinica = {
  nomeClinica: '', cnpj: '', endereco: '', telefone: '', celular: '',
  email: '', website: '', cnes: '', responsavelTecnico: '', crmResponsavel: '',
  especialidadePrincipal: '', logoUrl: '',
  horarioAbertura: '08:00', horarioFechamento: '18:00',
  horarioAlmocoInicio: '12:00', horarioAlmocoFim: '13:00',
  duracaoConsulta: 30, intervaloConsultas: 5,
  diasFuncionamento: ['seg', 'ter', 'qua', 'qui', 'sex'],
  sabadoAbertura: '08:00', sabadoFechamento: '12:00',
};

const DEFAULT_NOTIFICACOES: ConfiguracaoNotificacoes = {
  emailLembrete: true, smsLembrete: false, whatsappLembrete: false,
  antecedenciaLembrete: 24, notificarCancelamento: true,
  notificarNovoAgendamento: true, notificarResultadoExame: true,
  notificarAniversario: false, notificarEstoqueBaixo: true,
  notificarContasVencer: true, resumoDiario: false,
};

const DEFAULT_FINANCEIRO: ConfiguracaoFinanceiro = {
  formasPagamento: ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito'],
  valorConsultaPadrao: 200, valorRetornoPadrao: 0,
  taxaCartaoCredito: 3.5, taxaCartaoDebito: 1.5,
  diasVencimentoBoleto: 7, chavePix: '', tipoChavePix: 'cpf',
  gerarBoletoAutomatico: false, faturamentoAutomatico: true,
  categoriasPadrao: ['consulta', 'exame', 'procedimento', 'material', 'taxa'],
};

const DEFAULT_SEGURANCA: ConfiguracaoSeguranca = {
  sessionTimeoutMin: 30, mascarCpf: true, logAuditoria: true,
  lgpdConsentimento: true, senhaForte: true, loginDuplo: false,
};

const DEFAULT_IMPRESSAO: ConfiguracaoImpressao = {
  cabecalhoReceita: '', rodapeReceita: '', mostrarLogo: true,
  mostrarCRM: true, mostrarCNES: false, tamanhoPapel: 'A4',
  margemSuperior: 20, margemInferior: 20, margemEsquerda: 15, margemDireita: 15,
  fontePrincipal: 'Helvetica', tamanhoFonte: 12,
};

/* ─── Setting Row ─── */
function SettingRow({ icon: Icon, title, description, children }: {
  icon: React.ElementType; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="p-2 rounded-lg bg-muted shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ─── Salas Management ─── */
function SalasManager() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  /** Excluir sala é irreversível e ficava a um clique de distância, sem aviso. */
  const [salaParaExcluir, setSalaParaExcluir] = useState<{ id: string; nome: string } | null>(null);
  const [form, setForm] = useState({ nome: '', tipo: 'consultorio', ativo: true, equipamentos: '' as string });
  const [saving, setSaving] = useState(false);

  const { data: salas = [], isLoading } = useQuery({
    queryKey: ['salas-config'],
    queryFn: async () => {
      const { data } = await supabase.from('salas').select('*').order('nome');
      return data || [];
    },
  });

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      const equipArray = form.equipamentos ? form.equipamentos.split(',').map(s => s.trim()).filter(Boolean) : null;
      const payload: any = { nome: form.nome.trim(), tipo: form.tipo, ativo: form.ativo, equipamentos: equipArray };
      if (editId) {
        const { error } = await supabase.from('salas').update(payload).eq('id', editId);
        if (error) throw error;
        toast.success('Sala atualizada!');
      } else {
        const { error } = await supabase.from('salas').insert([{
          ...payload,
          clinica_id: profile?.clinica_id || null,
        }]);
        if (error) throw error;
        toast.success('Sala criada!');
      }
      queryClient.invalidateQueries({ queryKey: ['salas-config'] });
      setShowForm(false); setEditId(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const { data, error } = await supabase.from('salas').delete().eq('id', id).select('id');
    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) { toast.error('Sem permissão para excluir esta sala.'); return; }
    queryClient.invalidateQueries({ queryKey: ['salas-config'] });
    toast.success('Sala removida!');
  };

  const openEdit = (s: any) => {
    setEditId(s.id);
    const eq = Array.isArray(s.equipamentos) ? s.equipamentos.join(', ') : (s.equipamentos || '');
    setForm({ nome: s.nome, tipo: s.tipo || 'consultorio', ativo: s.ativo ?? true, equipamentos: eq });
    setShowForm(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Salas e Consultórios</CardTitle>
            <CardDescription>Gerencie os espaços físicos da clínica</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditId(null); setForm({ nome: '', tipo: 'consultorio', ativo: true, equipamentos: '' }); setShowForm(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nova Sala
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32 w-full" /> : (salas as any[]).length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma sala cadastrada</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Equipamentos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(salas as any[]).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nome}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{s.tipo || 'Consultório'}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{s.equipamentos || '—'}</TableCell>
                    <TableCell><Badge variant={s.ativo !== false ? 'default' : 'secondary'}>{s.ativo !== false ? 'Ativa' : 'Inativa'}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                         <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Editar sala ${s.nome}`} onClick={() => openEdit(s)}><Edit className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Excluir sala ${s.nome}`} onClick={() => setSalaParaExcluir(s)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) setEditId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Editar Sala' : 'Nova Sala'}</DialogTitle><DialogDescription>Preencha os dados do espaço.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Consultório 1" /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultorio">Consultório</SelectItem>
                  <SelectItem value="exame">Sala de Exames</SelectItem>
                  <SelectItem value="procedimento">Sala de Procedimentos</SelectItem>
                  <SelectItem value="coleta">Sala de Coleta</SelectItem>
                  <SelectItem value="espera">Sala de Espera</SelectItem>
                  <SelectItem value="reuniao">Sala de Reunião</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Equipamentos</Label><Textarea value={form.equipamentos} onChange={e => setForm({ ...form, equipamentos: e.target.value })} placeholder="Maca, Esfigmomanômetro..." rows={2} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} /><Label>Ativa</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{editId ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {salaParaExcluir && (
        <DeleteConfirmDialog
          open
          onOpenChange={(o) => !o && setSalaParaExcluir(null)}
          itemName={salaParaExcluir.nome}
          onConfirm={() => { handleDelete(salaParaExcluir.id); setSalaParaExcluir(null); }}
        />
      )}
    </Card>
  );
}

/* ─── Main Component ─── */
export default function Configuracoes() {
  const { theme, setTheme } = useTheme();
  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const { planName, planSlug, hasActivePlan, isTrial, trialEnd, trialDaysLeft } = useUserPlan();
  const { data: planos } = usePlanos();
  const navigate = useNavigate();
  const [showFaturas, setShowFaturas] = useState(false);
  const [showCancelPlan, setShowCancelPlan] = useState(false);

  const { data: faturas, isLoading: loadingFaturas } = useQuery({
    queryKey: ['minhas_faturas_saas', profile?.clinica_id],
    enabled: !!profile?.clinica_id && showFaturas,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('pagamentos_mercadopago')
        .select('id, valor, valor_pago, status, tipo, descricao, data_criacao, data_aprovacao, checkout_url, metodo_pagamento')
        .eq('clinica_id', profile!.clinica_id)
        .order('data_criacao', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const cancelPlanMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      const { data: assinaturaMp, error: searchErr } = await (supabase as any)
        .from('assinaturas_mercadopago')
        .select('id, mp_preapproval_id')
        .eq('status', 'ativa')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (searchErr) throw searchErr;
      if (!assinaturaMp?.mp_preapproval_id) throw new Error('Não encontramos assinatura ativa para cancelar');
      const { data, error } = await supabase.functions.invoke('mercadopago-checkout', {
        body: {
          action: 'cancel_subscription',
          assinatura_id: assinaturaMp.id,
          mp_preapproval_id: assinaturaMp.mp_preapproval_id,
          user_id: user.id,
          motivo: 'Cancelado pelo usuário em Configurações',
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Assinatura cancelada. Acesso mantido até o fim do período pago.');
      setShowCancelPlan(false);
      queryClient.invalidateQueries({ queryKey: ['user_plan'] });
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao cancelar assinatura'),
  });

  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [configClinica, setConfigClinica] = useState<ConfiguracaoClinica>(DEFAULT_CLINICA);
  const [configNotificacoes, setConfigNotificacoes] = useState<ConfiguracaoNotificacoes>(DEFAULT_NOTIFICACOES);
  const [configFinanceiro, setConfigFinanceiro] = useState<ConfiguracaoFinanceiro>(DEFAULT_FINANCEIRO);
  const [configSeguranca, setConfigSeguranca] = useState<ConfiguracaoSeguranca>(DEFAULT_SEGURANCA);
  const [configImpressao, setConfigImpressao] = useState<ConfiguracaoImpressao>(DEFAULT_IMPRESSAO);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loadingConfig, setLoadingConfig] = useState(true);

  const loadConfigs = useCallback(async () => {
    if (!user?.id) return;
    setLoadingConfig(true);
    try {
      const [configResult, clinicaResult] = await Promise.all([
        supabase
          .from('configuracoes_clinica')
          .select('chave, valor')
          .eq('user_id', user.id),
        profile?.clinica_id
          ? supabase
              .from('clinicas')
              .select('nome, cnpj')
              .eq('id', profile.clinica_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const data = configResult.data;
      const clinicaBase = clinicaResult.data;

      if ((data && data.length > 0) || clinicaBase) {
        setIsCloudSynced(true);
        const map: Record<string, any> = {};
        data.forEach(d => { map[d.chave] = d.valor; });
        if (map['config_clinica'] || clinicaBase) {
          const clinicaConfig = (map['config_clinica'] as Partial<ConfiguracaoClinica> | undefined) ?? {};
          setConfigClinica({
            ...DEFAULT_CLINICA,
            ...clinicaConfig,
            nomeClinica: clinicaConfig.nomeClinica || clinicaBase?.nome || DEFAULT_CLINICA.nomeClinica,
            cnpj: clinicaConfig.cnpj || clinicaBase?.cnpj || DEFAULT_CLINICA.cnpj,
          });
        }
        if (map['config_notificacoes']) setConfigNotificacoes({ ...DEFAULT_NOTIFICACOES, ...(map['config_notificacoes'] as any) });
        if (map['config_financeiro']) setConfigFinanceiro({ ...DEFAULT_FINANCEIRO, ...(map['config_financeiro'] as any) });
        if (map['config_seguranca']) setConfigSeguranca({ ...DEFAULT_SEGURANCA, ...(map['config_seguranca'] as any) });
        if (map['config_impressao']) setConfigImpressao({ ...DEFAULT_IMPRESSAO, ...(map['config_impressao'] as any) });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading configs:', error);
    } finally {
      setLoadingConfig(false);
    }
  }, [profile?.clinica_id, user?.id]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const saveConfig = async (chave: string, valor: any, label: string) => {
    if (!user?.id) { toast.error('Faça login para salvar.'); return; }
    setSaving(prev => ({ ...prev, [chave]: true }));
    try {
      if (chave === 'config_clinica' && profile?.clinica_id) {
        const clinicaConfig = valor as ConfiguracaoClinica;
        const { error: clinicError } = await supabase
          .from('clinicas')
          .update({
            nome: clinicaConfig.nomeClinica?.trim() || 'Minha Clínica',
            cnpj: clinicaConfig.cnpj?.trim() || null,
          })
          .eq('id', profile.clinica_id);

        if (clinicError) throw clinicError;
      }

      const { error } = await supabase
        .from('configuracoes_clinica')
        .upsert(
          {
            user_id: user.id,
            clinica_id: profile?.clinica_id ?? null,
            chave,
            valor,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,chave' }
        );
      if (error) throw error;
      setIsCloudSynced(true);
      toast.success(`${label} salvas na nuvem!`);
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + (error.message || 'Tente novamente.'));
    } finally {
      setSaving(prev => ({ ...prev, [chave]: false }));
    }
  };

  const diasSemana = [
    { value: 'seg', label: 'Seg' }, { value: 'ter', label: 'Ter' },
    { value: 'qua', label: 'Qua' }, { value: 'qui', label: 'Qui' },
    { value: 'sex', label: 'Sex' }, { value: 'sab', label: 'Sáb' },
    { value: 'dom', label: 'Dom' },
  ];

  const toggleDia = (dia: string) => {
    setConfigClinica(prev => ({
      ...prev,
      diasFuncionamento: prev.diasFuncionamento.includes(dia)
        ? prev.diasFuncionamento.filter(d => d !== dia)
        : [...prev.diasFuncionamento, dia]
    }));
  };

  const toggleFormaPagamento = (forma: string) => {
    setConfigFinanceiro(prev => ({
      ...prev,
      formasPagamento: prev.formasPagamento.includes(forma)
        ? prev.formasPagamento.filter(f => f !== forma)
        : [...prev.formasPagamento, forma]
    }));
  };

  const SaveBtn = ({ configKey, label, configValue }: { configKey: string; label: string; configValue: any }) => (
    <Button onClick={() => saveConfig(configKey, configValue, label)} disabled={saving[configKey]} className="gap-2">
      {saving[configKey] ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      Salvar na Nuvem
    </Button>
  );

  const tabItems = [
    { value: 'clinica', icon: Building, label: 'Clínica' },
    { value: 'plano', icon: CreditCard, label: 'Meu Plano' },
    { value: 'horarios', icon: Clock, label: 'Horários' },
    { value: 'salas', icon: MapPin, label: 'Salas' },
    { value: 'financeiro', icon: DollarSign, label: 'Financeiro' },
    { value: 'notificacoes', icon: Bell, label: 'Notificações' },
    { value: 'impressao', icon: Printer, label: 'Impressão' },
    { value: 'seguranca', icon: Shield, label: 'Segurança' },
    { value: 'backup', icon: Download, label: 'Backup' },
    { value: 'historico', icon: History, label: 'Auditoria' },
  ];

  const LazyFallback = (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const FORMAS_PAGAMENTO = [
    { value: 'dinheiro', label: 'Dinheiro' },
    { value: 'pix', label: 'PIX' },
    { value: 'cartao_credito', label: 'Cartão Crédito' },
    { value: 'cartao_debito', label: 'Cartão Débito' },
    { value: 'boleto', label: 'Boleto' },
    { value: 'transferencia', label: 'Transferência' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'convenio', label: 'Convênio' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie todas as configurações do sistema</p>
        </div>
        <Badge variant={isCloudSynced ? 'default' : 'secondary'} className="gap-1.5">
          {isCloudSynced ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
          {isCloudSynced ? 'Sincronizado' : 'Local'}
        </Badge>
      </div>

      <Tabs defaultValue="clinica" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {tabItems.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs">
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ─── Clínica ─── */}
        <TabsContent value="clinica">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5 text-primary" />Dados da Clínica</CardTitle>
                <CardDescription>Informações cadastrais completas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome da Clínica *</Label>
                    <Input value={configClinica.nomeClinica} onChange={e => setConfigClinica({ ...configClinica, nomeClinica: e.target.value })} placeholder="Nome da clínica" />
                  </div>
                  <div className="space-y-2">
                    <Label>CNPJ</Label>
                    <Input value={configClinica.cnpj} onChange={e => setConfigClinica({ ...configClinica, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
                  </div>
                  <div className="space-y-2">
                    <Label>CNES</Label>
                    <Input value={configClinica.cnes} onChange={e => setConfigClinica({ ...configClinica, cnes: e.target.value })} placeholder="Código CNES" />
                  </div>
                  <div className="space-y-2">
                    <Label>Especialidade Principal</Label>
                    <Input value={configClinica.especialidadePrincipal} onChange={e => setConfigClinica({ ...configClinica, especialidadePrincipal: e.target.value })} placeholder="Ex: Clínica Geral" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Endereço Completo</Label>
                    <Textarea value={configClinica.endereco} onChange={e => setConfigClinica({ ...configClinica, endereco: e.target.value })} rows={2} placeholder="Rua, número, bairro, cidade - UF, CEP" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone Fixo</Label>
                    <Input value={configClinica.telefone} onChange={e => setConfigClinica({ ...configClinica, telefone: e.target.value })} placeholder="(00) 0000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Celular / WhatsApp</Label>
                    <Input value={configClinica.celular} onChange={e => setConfigClinica({ ...configClinica, celular: e.target.value })} placeholder="(00) 00000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={configClinica.email} onChange={e => setConfigClinica({ ...configClinica, email: e.target.value })} placeholder="contato@clinica.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <Input value={configClinica.website} onChange={e => setConfigClinica({ ...configClinica, website: e.target.value })} placeholder="https://www.clinica.com.br" />
                  </div>
                  <div className="space-y-2">
                    <Label>URL do Logo</Label>
                    <Input value={configClinica.logoUrl} onChange={e => setConfigClinica({ ...configClinica, logoUrl: e.target.value })} placeholder="https://..." />
                  </div>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Responsável Técnico</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome do Responsável</Label>
                    <Input value={configClinica.responsavelTecnico} onChange={e => setConfigClinica({ ...configClinica, responsavelTecnico: e.target.value })} placeholder="Dr(a). Nome Completo" />
                  </div>
                  <div className="space-y-2">
                    <Label>CRM do Responsável</Label>
                    <Input value={configClinica.crmResponsavel} onChange={e => setConfigClinica({ ...configClinica, crmResponsavel: e.target.value })} placeholder="CRM/UF 00000" />
                  </div>
                </div>

                <Separator />
                <SaveBtn configKey="config_clinica" label="Dados da clínica" configValue={configClinica} />
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ─── Meu Plano ─── */}
        <TabsContent value="plano">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Plano Atual */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" />Seu Plano Atual</CardTitle>
                <CardDescription>Visualize e gerencie sua subscrição</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!hasActivePlan ? (
                  <div className="text-center py-8 space-y-4">
                    <p className="text-muted-foreground">Você não possui um plano ativo</p>
                    <Button className="gap-2" onClick={() => navigate('/planos')}>
                      <CreditCard className="h-4 w-4" />
                      Escolher Plano
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Plano Ativo</Label>
                        <div className="text-2xl font-bold text-primary capitalize">{planName || 'Carregando...'}</div>
                        <p className="text-xs text-muted-foreground">{isTrial ? 'Período de teste' : 'Plano profissional'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        {isTrial ? (
                          <>
                            <Badge className="w-fit bg-blue-500/10 text-blue-700 border-blue-200">⏰ Em Teste</Badge>
                            <p className="text-xs text-muted-foreground">Restam {trialDaysLeft} dia{trialDaysLeft !== 1 ? 's' : ''}</p>
                          </>
                        ) : (
                          <>
                            <Badge className="w-fit bg-green-500/10 text-green-700 border-green-200">✓ Ativo</Badge>
                            <p className="text-xs text-muted-foreground">{trialEnd ? `Até ${trialEnd.toLocaleDateString('pt-BR')}` : 'Contínuo'}</p>
                          </>
                        )}
                      </div>
                    </div>

                    {!isTrial && (
                      <>
                        <Separator />

                        <div className="space-y-4">
                          <h4 className="font-semibold text-sm">Próxima Renovação</h4>
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="p-3 bg-muted rounded-lg">
                              <p className="text-xs text-muted-foreground">Data da Renovação</p>
                              <p className="text-lg font-semibold mt-1">{trialEnd ? trialEnd.toLocaleDateString('pt-BR') : 'Mensal'}</p>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                              <p className="text-xs text-muted-foreground">Valor Mensal</p>
                              <p className="text-lg font-semibold mt-1">
                                {planos?.find(p => p.slug === planSlug)?.valor
                                  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(planos.find(p => p.slug === planSlug)!.valor)
                                  : 'Carregando...'}
                              </p>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                              <p className="text-xs text-muted-foreground">Status do Pagamento</p>
                              <p className="text-xs text-foreground mt-1 flex items-center gap-1">
                                ✓ Ativo
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    <Separator />

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="gap-2" onClick={() => navigate('/planos')}>
                        <CreditCard className="h-4 w-4" />
                        Fazer Upgrade
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={() => setShowFaturas(true)}>
                        <Receipt className="h-4 w-4" />
                        Ver Faturas
                      </Button>
                      <Button variant="destructive" className="gap-2" onClick={() => setShowCancelPlan(true)}>
                        ✕ Cancelar Plano
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Dialog: Faturas */}
            <Dialog open={showFaturas} onOpenChange={setShowFaturas}>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-primary" /> Histórico de Faturas
                  </DialogTitle>
                  <DialogDescription>Pagamentos da sua assinatura EloLab</DialogDescription>
                </DialogHeader>
                {loadingFaturas ? (
                  <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
                ) : !faturas || faturas.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">Nenhuma fatura encontrada ainda.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {faturas.map((f: any) => (
                        <TableRow key={f.id}>
                          <TableCell className="text-xs">{f.data_criacao ? new Date(f.data_criacao).toLocaleDateString('pt-BR') : '—'}</TableCell>
                          <TableCell className="text-xs">{f.descricao || f.tipo || 'Assinatura'}</TableCell>
                          <TableCell className="text-xs font-semibold">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(f.valor_pago || f.valor || 0)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={f.status === 'approved' || f.status === 'aprovado' ? 'default' : f.status === 'pending' || f.status === 'pendente' ? 'secondary' : 'outline'}>
                              {f.status || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {f.checkout_url && (
                              <Button size="sm" variant="ghost" onClick={() => window.open(f.checkout_url, '_blank')}>Abrir</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </DialogContent>
            </Dialog>

            {/* Dialog: Cancel plan */}
            <Dialog open={showCancelPlan} onOpenChange={setShowCancelPlan}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancelar assinatura?</DialogTitle>
                  <DialogDescription>
                    Sua assinatura será cancelada no Mercado Pago. Você manterá acesso até o fim do período já pago.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCancelPlan(false)}>Manter assinatura</Button>
                  <Button variant="destructive" disabled={cancelPlanMutation.isPending} onClick={() => cancelPlanMutation.mutate()}>
                    {cancelPlanMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Confirmar cancelamento
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </motion.div>
        </TabsContent>

        {/* ─── Horários ─── */}
        <TabsContent value="horarios">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Horários de Funcionamento</CardTitle>
                <CardDescription>Configure os horários, intervalos e dias de atendimento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <h3 className="font-semibold text-sm">Horário Principal</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Abertura</Label>
                    <Input type="time" value={configClinica.horarioAbertura} onChange={e => setConfigClinica({ ...configClinica, horarioAbertura: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fechamento</Label>
                    <Input type="time" value={configClinica.horarioFechamento} onChange={e => setConfigClinica({ ...configClinica, horarioFechamento: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Início Almoço</Label>
                    <Input type="time" value={configClinica.horarioAlmocoInicio} onChange={e => setConfigClinica({ ...configClinica, horarioAlmocoInicio: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fim Almoço</Label>
                    <Input type="time" value={configClinica.horarioAlmocoFim} onChange={e => setConfigClinica({ ...configClinica, horarioAlmocoFim: e.target.value })} />
                  </div>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">Consultas</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Duração Padrão</Label>
                    <Select value={configClinica.duracaoConsulta.toString()} onValueChange={v => setConfigClinica({ ...configClinica, duracaoConsulta: parseInt(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[10, 15, 20, 25, 30, 40, 45, 50, 60].map(m => (
                          <SelectItem key={m} value={m.toString()}>{m} minutos</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Intervalo entre Consultas</Label>
                    <Select value={configClinica.intervaloConsultas.toString()} onValueChange={v => setConfigClinica({ ...configClinica, intervaloConsultas: parseInt(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0, 5, 10, 15, 20, 30].map(m => (
                          <SelectItem key={m} value={m.toString()}>{m === 0 ? 'Sem intervalo' : `${m} minutos`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">Dias de Funcionamento</h3>
                <div className="flex flex-wrap gap-2">
                  {diasSemana.map(dia => (
                    <Button key={dia.value} variant={configClinica.diasFuncionamento.includes(dia.value) ? 'default' : 'outline'} size="sm" onClick={() => toggleDia(dia.value)} className="min-w-[48px]">
                      {dia.label}
                    </Button>
                  ))}
                </div>

                {configClinica.diasFuncionamento.includes('sab') && (
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <h4 className="text-sm font-medium mb-3">Horário de Sábado</h4>
                    <div className="grid grid-cols-2 gap-4 max-w-sm">
                      <div className="space-y-1"><Label className="text-xs">Abertura</Label><Input type="time" value={configClinica.sabadoAbertura} onChange={e => setConfigClinica({ ...configClinica, sabadoAbertura: e.target.value })} /></div>
                      <div className="space-y-1"><Label className="text-xs">Fechamento</Label><Input type="time" value={configClinica.sabadoFechamento} onChange={e => setConfigClinica({ ...configClinica, sabadoFechamento: e.target.value })} /></div>
                    </div>
                  </div>
                )}

                <Separator />
                <SaveBtn configKey="config_clinica" label="Horários" configValue={configClinica} />
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ─── Salas ─── */}
        <TabsContent value="salas">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <SalasManager />
          </motion.div>
        </TabsContent>




        {/* ─── Financeiro ─── */}
        <TabsContent value="financeiro">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" />Configurações Financeiras</CardTitle>
                <CardDescription>Valores padrão, formas de pagamento e taxas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <h3 className="font-semibold text-sm">Valores Padrão</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Consulta Padrão (R$)</Label>
                    <Input type="number" step="0.01" value={configFinanceiro.valorConsultaPadrao} onChange={e => setConfigFinanceiro({ ...configFinanceiro, valorConsultaPadrao: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Retorno Padrão (R$)</Label>
                    <Input type="number" step="0.01" value={configFinanceiro.valorRetornoPadrao} onChange={e => setConfigFinanceiro({ ...configFinanceiro, valorRetornoPadrao: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Dias p/ Vencimento Boleto</Label>
                    <Input type="number" value={configFinanceiro.diasVencimentoBoleto} onChange={e => setConfigFinanceiro({ ...configFinanceiro, diasVencimentoBoleto: parseInt(e.target.value) || 7 })} />
                  </div>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">Taxas de Cartão</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Taxa Cartão Crédito (%)</Label>
                    <Input type="number" step="0.1" value={configFinanceiro.taxaCartaoCredito} onChange={e => setConfigFinanceiro({ ...configFinanceiro, taxaCartaoCredito: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Taxa Cartão Débito (%)</Label>
                    <Input type="number" step="0.1" value={configFinanceiro.taxaCartaoDebito} onChange={e => setConfigFinanceiro({ ...configFinanceiro, taxaCartaoDebito: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">PIX</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo de Chave</Label>
                    <Select value={configFinanceiro.tipoChavePix} onValueChange={v => setConfigFinanceiro({ ...configFinanceiro, tipoChavePix: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpf">CPF</SelectItem>
                        <SelectItem value="cnpj">CNPJ</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="telefone">Telefone</SelectItem>
                        <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Chave PIX</Label>
                    <Input value={configFinanceiro.chavePix} onChange={e => setConfigFinanceiro({ ...configFinanceiro, chavePix: e.target.value })} placeholder="Sua chave PIX" />
                  </div>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">Formas de Pagamento Aceitas</h3>
                <div className="flex flex-wrap gap-2">
                  {FORMAS_PAGAMENTO.map(fp => (
                    <Button key={fp.value} variant={configFinanceiro.formasPagamento.includes(fp.value) ? 'default' : 'outline'} size="sm" onClick={() => toggleFormaPagamento(fp.value)}>
                      {fp.label}
                    </Button>
                  ))}
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">Automações</h3>
                <div className="divide-y">
                  <SettingRow icon={Receipt} title="Faturamento Automático" description="Gerar lançamento financeiro ao finalizar atendimento">
                    <Switch checked={configFinanceiro.faturamentoAutomatico} onCheckedChange={v => setConfigFinanceiro({ ...configFinanceiro, faturamentoAutomatico: v })} />
                  </SettingRow>
                  <SettingRow icon={FileText} title="Boleto Automático" description="Gerar boleto automaticamente para convênios">
                    <Switch checked={configFinanceiro.gerarBoletoAutomatico} onCheckedChange={v => setConfigFinanceiro({ ...configFinanceiro, gerarBoletoAutomatico: v })} />
                  </SettingRow>
                </div>

                <Separator />
                <SaveBtn configKey="config_financeiro" label="Configurações financeiras" configValue={configFinanceiro} />
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ─── Notificações ─── */}
        <TabsContent value="notificacoes">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" />Notificações</CardTitle>
                <CardDescription>Configure os canais e tipos de notificações automáticas</CardDescription>
              </CardHeader>
              <CardContent>
                <h3 className="font-semibold text-sm mb-2">Canais de Lembrete</h3>
                <div className="divide-y">
                  <SettingRow icon={Mail} title="Lembrete por Email" description="Enviar lembrete de consulta por email">
                    <Switch checked={configNotificacoes.emailLembrete} onCheckedChange={v => setConfigNotificacoes({ ...configNotificacoes, emailLembrete: v })} />
                  </SettingRow>
                  <SettingRow icon={Smartphone} title="Lembrete por SMS" description="Enviar lembrete por SMS">
                    <Switch checked={configNotificacoes.smsLembrete} onCheckedChange={v => setConfigNotificacoes({ ...configNotificacoes, smsLembrete: v })} />
                  </SettingRow>
                  <SettingRow icon={MessageSquare} title="Lembrete por WhatsApp" description="Enviar lembrete via WhatsApp (requer Evolution API)">
                    <Switch checked={configNotificacoes.whatsappLembrete} onCheckedChange={v => setConfigNotificacoes({ ...configNotificacoes, whatsappLembrete: v })} />
                  </SettingRow>
                </div>

                <Separator className="my-4" />
                <h3 className="font-semibold text-sm mb-2">Tipos de Notificação</h3>
                <div className="divide-y">
                  <SettingRow icon={Bell} title="Cancelamentos" description="Notificar equipe ao cancelar consulta">
                    <Switch checked={configNotificacoes.notificarCancelamento} onCheckedChange={v => setConfigNotificacoes({ ...configNotificacoes, notificarCancelamento: v })} />
                  </SettingRow>
                  <SettingRow icon={Bell} title="Novos Agendamentos" description="Notificar sobre novos agendamentos">
                    <Switch checked={configNotificacoes.notificarNovoAgendamento} onCheckedChange={v => setConfigNotificacoes({ ...configNotificacoes, notificarNovoAgendamento: v })} />
                  </SettingRow>
                  <SettingRow icon={Database} title="Resultado de Exames" description="Notificar paciente quando resultado disponível">
                    <Switch checked={configNotificacoes.notificarResultadoExame} onCheckedChange={v => setConfigNotificacoes({ ...configNotificacoes, notificarResultadoExame: v })} />
                  </SettingRow>
                  <SettingRow icon={Bell} title="Aniversário do Paciente" description="Enviar felicitação automática">
                    <Switch checked={configNotificacoes.notificarAniversario} onCheckedChange={v => setConfigNotificacoes({ ...configNotificacoes, notificarAniversario: v })} />
                  </SettingRow>
                  <SettingRow icon={Bell} title="Estoque Baixo" description="Alertar quando item atingir estoque mínimo">
                    <Switch checked={configNotificacoes.notificarEstoqueBaixo} onCheckedChange={v => setConfigNotificacoes({ ...configNotificacoes, notificarEstoqueBaixo: v })} />
                  </SettingRow>
                  <SettingRow icon={DollarSign} title="Contas a Vencer" description="Alertar sobre contas próximas do vencimento">
                    <Switch checked={configNotificacoes.notificarContasVencer} onCheckedChange={v => setConfigNotificacoes({ ...configNotificacoes, notificarContasVencer: v })} />
                  </SettingRow>
                  <SettingRow icon={Mail} title="Resumo Diário" description="Receber resumo das atividades do dia por email">
                    <Switch checked={configNotificacoes.resumoDiario} onCheckedChange={v => setConfigNotificacoes({ ...configNotificacoes, resumoDiario: v })} />
                  </SettingRow>
                </div>

                <div className="mt-6 space-y-2 max-w-xs">
                  <Label>Antecedência do Lembrete</Label>
                  <Select value={configNotificacoes.antecedenciaLembrete.toString()} onValueChange={v => setConfigNotificacoes({ ...configNotificacoes, antecedenciaLembrete: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 hora antes</SelectItem>
                      <SelectItem value="2">2 horas antes</SelectItem>
                      <SelectItem value="6">6 horas antes</SelectItem>
                      <SelectItem value="12">12 horas antes</SelectItem>
                      <SelectItem value="24">24 horas antes</SelectItem>
                      <SelectItem value="48">48 horas antes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator className="my-6" />
                <SaveBtn configKey="config_notificacoes" label="Notificações" configValue={configNotificacoes} />
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ─── Impressão ─── */}
        <TabsContent value="impressao">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5 text-primary" />Impressão e Receituário</CardTitle>
                <CardDescription>Configure a aparência de receitas, atestados e documentos impressos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Cabeçalho do Receituário</Label>
                  <Textarea value={configImpressao.cabecalhoReceita} onChange={e => setConfigImpressao({ ...configImpressao, cabecalhoReceita: e.target.value })} rows={3} placeholder="Ex: Clínica São Lucas - Atendimento Médico Especializado&#10;Rua das Flores, 123 - Centro - (11) 1234-5678" />
                </div>
                <div className="space-y-2">
                  <Label>Rodapé do Receituário</Label>
                  <Textarea value={configImpressao.rodapeReceita} onChange={e => setConfigImpressao({ ...configImpressao, rodapeReceita: e.target.value })} rows={2} placeholder="Ex: Este documento é válido por 30 dias" />
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">Elementos Visíveis</h3>
                <div className="divide-y">
                  <SettingRow icon={Image} title="Mostrar Logo" description="Incluir logo da clínica no cabeçalho dos documentos">
                    <Switch checked={configImpressao.mostrarLogo} onCheckedChange={v => setConfigImpressao({ ...configImpressao, mostrarLogo: v })} />
                  </SettingRow>
                  <SettingRow icon={Hash} title="Mostrar CRM" description="Incluir número do CRM do médico">
                    <Switch checked={configImpressao.mostrarCRM} onCheckedChange={v => setConfigImpressao({ ...configImpressao, mostrarCRM: v })} />
                  </SettingRow>
                  <SettingRow icon={Building} title="Mostrar CNES" description="Incluir código CNES do estabelecimento">
                    <Switch checked={configImpressao.mostrarCNES} onCheckedChange={v => setConfigImpressao({ ...configImpressao, mostrarCNES: v })} />
                  </SettingRow>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">Layout</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Tamanho do Papel</Label>
                    <Select value={configImpressao.tamanhoPapel} onValueChange={v => setConfigImpressao({ ...configImpressao, tamanhoPapel: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A4">A4</SelectItem>
                        <SelectItem value="A5">A5 (Meio A4)</SelectItem>
                        <SelectItem value="Receituario">Receituário (14x20cm)</SelectItem>
                        <SelectItem value="Carta">Carta (Letter)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fonte</Label>
                    <Select value={configImpressao.fontePrincipal} onValueChange={v => setConfigImpressao({ ...configImpressao, fontePrincipal: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Helvetica">Helvetica</SelectItem>
                        <SelectItem value="Times">Times New Roman</SelectItem>
                        <SelectItem value="Courier">Courier</SelectItem>
                        <SelectItem value="Arial">Arial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tamanho da Fonte (pt)</Label>
                    <Input type="number" value={configImpressao.tamanhoFonte} onChange={e => setConfigImpressao({ ...configImpressao, tamanhoFonte: parseInt(e.target.value) || 12 })} />
                  </div>
                </div>

                <h4 className="font-medium text-sm mt-4">Margens (mm)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1"><Label className="text-xs">Superior</Label><Input type="number" value={configImpressao.margemSuperior} onChange={e => setConfigImpressao({ ...configImpressao, margemSuperior: parseInt(e.target.value) || 0 })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Inferior</Label><Input type="number" value={configImpressao.margemInferior} onChange={e => setConfigImpressao({ ...configImpressao, margemInferior: parseInt(e.target.value) || 0 })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Esquerda</Label><Input type="number" value={configImpressao.margemEsquerda} onChange={e => setConfigImpressao({ ...configImpressao, margemEsquerda: parseInt(e.target.value) || 0 })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Direita</Label><Input type="number" value={configImpressao.margemDireita} onChange={e => setConfigImpressao({ ...configImpressao, margemDireita: parseInt(e.target.value) || 0 })} /></div>
                </div>

                <Separator />
                <SaveBtn configKey="config_impressao" label="Configurações de impressão" configValue={configImpressao} />
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>



        {/* ─── Segurança ─── */}
        <TabsContent value="seguranca">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />Segurança e Privacidade</CardTitle>
                <CardDescription>Configurações de segurança do sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  <SettingRow icon={Key} title="Tempo de Sessão" description="Desconectar após inatividade">
                    <Select value={configSeguranca.sessionTimeoutMin.toString()} onValueChange={v => setConfigSeguranca({ ...configSeguranca, sessionTimeoutMin: parseInt(v) })}>
                      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutos</SelectItem>
                        <SelectItem value="30">30 minutos</SelectItem>
                        <SelectItem value="60">1 hora</SelectItem>
                        <SelectItem value="120">2 horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow icon={Shield} title="Mascarar CPF" description="Exibir CPF mascarado na listagem de pacientes">
                    <Switch checked={configSeguranca.mascarCpf} onCheckedChange={v => setConfigSeguranca({ ...configSeguranca, mascarCpf: v })} />
                  </SettingRow>
                  <SettingRow icon={Shield} title="Log de Auditoria" description="Registrar todas as ações dos usuários">
                    <Switch checked={configSeguranca.logAuditoria} onCheckedChange={v => setConfigSeguranca({ ...configSeguranca, logAuditoria: v })} />
                  </SettingRow>
                  <SettingRow icon={Globe} title="Conformidade LGPD" description="Exigir consentimento do paciente para coleta de dados">
                    <Switch checked={configSeguranca.lgpdConsentimento} onCheckedChange={v => setConfigSeguranca({ ...configSeguranca, lgpdConsentimento: v })} />
                  </SettingRow>
                  <SettingRow icon={Key} title="Senha Forte Obrigatória" description="Exigir mínimo 8 caracteres, maiúscula e número">
                    <Switch checked={configSeguranca.senhaForte} onCheckedChange={v => setConfigSeguranca({ ...configSeguranca, senhaForte: v })} />
                  </SettingRow>
                </div>
                <div className="mt-6 p-4 rounded-xl border bg-primary/5">
                  <div className="flex gap-3">
                    <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Proteção de Dados</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        O sistema utiliza Row Level Security (RLS) no banco de dados, garantindo isolamento de dados por clínica.
                        Todas as comunicações são criptografadas via HTTPS e os dados sensíveis são mascarados.
                      </p>
                    </div>
                  </div>
                </div>
                <Separator className="my-6" />
                <SaveBtn configKey="config_seguranca" label="Configurações de segurança" configValue={configSeguranca} />
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ─── Backup ─── */}
        <TabsContent value="backup">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <BackupRestore />
          </motion.div>
        </TabsContent>

        {/* ─── Auditoria ─── */}
        <TabsContent value="historico">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <AuditLog />
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
