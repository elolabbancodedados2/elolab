import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Save, Building, Clock, Bell, Download, History,
  Shield,
  Key, RefreshCw, CloudOff, Cloud,
  DollarSign, Printer, MapPin, Users,
  CreditCard, Receipt, Loader2, Hash, Image, Workflow, FileSpreadsheet,
  PlugZap, Settings2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FluxoDoAtendimento } from '@/components/configuracoes/FluxoDoAtendimento';
import { formatDate } from '@/lib/formatters';
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
import { AuditLog } from '@/components/AuditLog';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { CancelamentoPlanoResumo } from '@/components/CancelamentoPlanoResumo';
import { UsoDoPlano } from '@/components/UsoDoPlano';
import { useQueryClient } from '@tanstack/react-query';
import { useUserPlan, usePlanos } from '@/hooks/useSubscriptionPlan';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { clearClinicaInfoCache } from '@/lib/pdfGenerator';
import { IntegracoesClinica } from '@/components/configuracoes/IntegracoesClinica';
import { AgendamentoOnlineConfig } from '@/components/configuracoes/AgendamentoOnlineConfig';
import { AccountSessionsPanel } from '@/components/security/AccountSessionsPanel';
import { CONFIG_SEGURANCA_ATUALIZADA_EVENT, chaveDaClinica, lerConfigsClinicaComVersoes } from '@/lib/configClinica';
import { ReauthDialog } from '@/components/ReauthDialog';
import { exigeReautenticacao } from '@/lib/reautenticacao';

export function textoAcaoPlano(planSlug: string | null) {
  return planSlug === 'elolab-ultra' ? 'Gerenciar plano' : 'Fazer Upgrade';
}



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

interface ConfiguracaoSeguranca {
  sessionTimeoutMin: number;
  mascarCpf: boolean;
  logAuditoria: boolean;
  lgpdConsentimento: boolean;
  senhaForte: boolean;
  loginDuplo: boolean;
}

interface ConfiguracaoImpressao {
  rodapeReceita: string;
  mostrarLogo: boolean;
  mostrarCRM: boolean;
  mostrarCNES: boolean;
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

const DEFAULT_SEGURANCA: ConfiguracaoSeguranca = {
  sessionTimeoutMin: 30, mascarCpf: true, logAuditoria: true,
  lgpdConsentimento: true, senhaForte: true, loginDuplo: false,
};

const DEFAULT_IMPRESSAO: ConfiguracaoImpressao = {
  rodapeReceita: '', mostrarLogo: true, mostrarCRM: true, mostrarCNES: false,
};

/* ─── Setting Row ─── */
function SettingRow({ icon: Icon, title, description, children }: {
  icon: React.ElementType; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="shrink-0 rounded-xl bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center sm:pl-4">{children}</div>
    </div>
  );
}

function validarHorarioClinica(config: ConfiguracaoClinica): string | null {
  const minutos = (value: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value || '');
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const abertura = minutos(config.horarioAbertura);
  const fechamento = minutos(config.horarioFechamento);
  if (abertura === null || fechamento === null || abertura >= fechamento) {
    return 'O fechamento principal deve ocorrer depois da abertura, com horários válidos.';
  }

  const inicioAlmoco = config.horarioAlmocoInicio ? minutos(config.horarioAlmocoInicio) : null;
  const fimAlmoco = config.horarioAlmocoFim ? minutos(config.horarioAlmocoFim) : null;
  if (Boolean(config.horarioAlmocoInicio) !== Boolean(config.horarioAlmocoFim)) {
    return 'Preencha os dois horários do intervalo ou deixe ambos vazios.';
  }
  if (config.horarioAlmocoInicio && (inicioAlmoco === null || fimAlmoco === null)) {
    return 'Informe horários válidos para o intervalo.';
  }
  if (inicioAlmoco !== null && fimAlmoco !== null &&
      (inicioAlmoco >= fimAlmoco || inicioAlmoco < abertura || fimAlmoco > fechamento)) {
    return 'O intervalo deve estar dentro do horário de funcionamento e terminar depois do início.';
  }

  if (config.diasFuncionamento.includes('sab')) {
    const aberturaSabado = minutos(config.sabadoAbertura);
    const fechamentoSabado = minutos(config.sabadoFechamento);
    if (aberturaSabado === null || fechamentoSabado === null || aberturaSabado >= fechamentoSabado) {
      return 'O fechamento de sábado deve ocorrer depois da abertura, com horários válidos.';
    }
  }
  return null;
}

/* ─── Salas Management ─── */
/* ─── Main Component ─── */
export default function Configuracoes() {
  const { theme, setTheme } = useTheme();
  const { user, profile } = useSupabaseAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { plan: assinaturaAtual, planName, planSlug, hasActivePlan, isExempt: isPlanExempt, isTrial, trialEnd, trialDaysLeft, isLoading: loadingPlanoAtual, isError: erroPlanoAtual, error: erroConsultaPlano, refetch: recarregarPlanoAtual } = useUserPlan();
  const { data: planos, isLoading: carregandoPlanos, isError: erroAoCarregarPlanos, error: erroListaPlanos } = usePlanos(!isPlanExempt);
  const navigate = useNavigate();
  const [showCancelPlan, setShowCancelPlan] = useState(false);
  const [motivoCancelamentoPlano, setMotivoCancelamentoPlano] = useState('');
  const cancelPlanLock = useRef(false);

  const cancelPlanMutation = useMutation({
    mutationFn: async (motivo: string) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      const { data, error } = await supabase.functions.invoke('mercadopago-checkout', {
        body: {
          action: 'cancel_subscription',
          motivo: motivo.trim().slice(0, 500) || 'Cancelado pelo usuário em Configurações',
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Plano cancelado. O acesso foi encerrado e nenhuma cobrança futura será feita.');
      setShowCancelPlan(false);
      setMotivoCancelamentoPlano('');
      queryClient.invalidateQueries({ queryKey: ['user_plan'] });
      queryClient.invalidateQueries({ queryKey: ['billing_status'] });
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao cancelar assinatura'),
    onSettled: () => { cancelPlanLock.current = false; },
  });

  const confirmarCancelamentoPlano = () => {
    if (cancelPlanLock.current || cancelPlanMutation.isPending) return;
    cancelPlanLock.current = true;
    cancelPlanMutation.mutate(motivoCancelamentoPlano);
  };

  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [configClinica, setConfigClinica] = useState<ConfiguracaoClinica>(DEFAULT_CLINICA);
  const [configSeguranca, setConfigSeguranca] = useState<ConfiguracaoSeguranca>(DEFAULT_SEGURANCA);
  const [configImpressao, setConfigImpressao] = useState<ConfiguracaoImpressao>(DEFAULT_IMPRESSAO);
  const [configVersions, setConfigVersions] = useState<Record<string, string | null>>({});
  // Ação recusada pelo banco por reduzir segurança sem prova recente; refeita após reautenticar.
  const [reauthAcao, setReauthAcao] = useState<(() => Promise<void>) | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const saveLocks = useRef(new Set<string>());
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configLoadError, setConfigLoadError] = useState<unknown>(null);
  const configLoadGeneration = useRef(0);
  const clinicId = profile?.clinica_id;
  const currentUserId = user?.id;
  const [loadedConfigScope, setLoadedConfigScope] = useState<string | null>(null);
  const currentConfigScope = `${user?.id ?? ''}:${profile?.clinica_id ?? ''}`;
  const fimPeriodoPago = assinaturaAtual?.cobranca_modalidade === 'pre_pago' && assinaturaAtual.data_fim
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${assinaturaAtual.data_fim.slice(0, 10)}T00:00:00Z`))
    : null;
  const resumoPeriodo = isTrial && trialEnd
    ? `Teste até ${formatDate(trialEnd, 'short')}`
    : fimPeriodoPago
      ? `Período pago até ${fimPeriodoPago}`
      : assinaturaAtual?.cobranca_modalidade === 'recorrente'
        ? 'Renovação automática'
        : 'Consulte o histórico de faturas';

  const loadConfigs = useCallback(async () => {
    const generation = ++configLoadGeneration.current;
    setLoadedConfigScope(null);
    setConfigClinica(DEFAULT_CLINICA);
    setConfigSeguranca(DEFAULT_SEGURANCA);
    setConfigImpressao(DEFAULT_IMPRESSAO);
    setConfigVersions({});
    setSaving({});
    setIsCloudSynced(false);
    setConfigLoadError(null);
    setLoadingConfig(true);
    if (!currentUserId || !clinicId) {
      setConfigLoadError(new Error('Sessão ou clínica não identificada.'));
      setLoadingConfig(false);
      return;
    }
    try {
      const [configResult, clinicaResult] = await Promise.all([
        // Chaves da clínica vêm da linha compartilhada da clínica; antes a
        // leitura era só das linhas do próprio usuário, e um segundo admin
        // abria esta tela vazia.
        clinicId
          ? lerConfigsClinicaComVersoes(clinicId).then(
              ({ configs, updatedAtByKey }) => ({
                data: Object.entries(configs).map(([chave, valor]) => ({ chave, valor })),
                versions: updatedAtByKey,
                error: null,
              }),
              (error) => ({ data: [] as Array<{ chave: string; valor: any }>, versions: {}, error }),
            )
          : Promise.resolve({ data: [] as Array<{ chave: string; valor: any }>, versions: {}, error: null }),
        clinicId
          ? supabase
              .from('clinicas')
              .select('nome, cnpj')
              .eq('id', clinicId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (generation !== configLoadGeneration.current) return;
      if (configResult.error) throw configResult.error;
      if (clinicaResult.error) throw clinicaResult.error;

      setLoadedConfigScope(`${currentUserId}:${clinicId}`);
      setConfigVersions(configResult.versions);
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
        if (map['config_seguranca']) setConfigSeguranca({ ...DEFAULT_SEGURANCA, ...(map['config_seguranca'] as any) });
        if (map['config_impressao']) setConfigImpressao({ ...DEFAULT_IMPRESSAO, ...(map['config_impressao'] as any) });
      }
    } catch (error) {
      if (generation === configLoadGeneration.current) {
        setConfigLoadError(error);
        if (import.meta.env.DEV) console.error('Error loading configs:', error);
      }
    } finally {
      if (generation === configLoadGeneration.current) setLoadingConfig(false);
    }
  }, [clinicId, currentUserId]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const saveConfig = async (chave: string, valor: any, label: string) => {
    const saveLockKey = `${profile?.clinica_id ?? user?.id ?? 'sessao'}:${chave}`;
    if (saveLocks.current.has(saveLockKey)) return;
    if (!user?.id) { toast.error('Faça login para salvar.'); return; }
    if (loadingConfig || configLoadError || loadedConfigScope !== currentConfigScope) {
      toast.error('Carregue as configurações atuais antes de salvar.');
      return;
    }
    if (chave === 'config_clinica' && !String((valor as ConfiguracaoClinica).nomeClinica || '').trim()) {
      toast.error('Informe o nome da clínica antes de salvar.');
      return;
    }
    const generation = configLoadGeneration.current;
    saveLocks.current.add(saveLockKey);
    setSaving(prev => ({ ...prev, [chave]: true }));
    try {
      if (profile?.clinica_id && chaveDaClinica(chave)) {
        const { data: novaVersao, error } = await supabase.rpc('salvar_configuracao_clinica_segura', {
          p_chave: chave,
          p_valor: valor,
          p_versao_esperada: configVersions[chave] ?? null,
        });
        if (error) throw error;
        if (typeof novaVersao !== 'string') throw new Error('A configuração foi salva, mas a versão não foi confirmada. Atualize os dados antes de salvar novamente.');
        setConfigVersions(prev => ({ ...prev, [chave]: novaVersao }));
      } else {
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
      }
      if (chave === 'config_clinica') clearClinicaInfoCache();
      if (chave === 'config_seguranca') window.dispatchEvent(new Event(CONFIG_SEGURANCA_ATUALIZADA_EVENT));
      if (generation === configLoadGeneration.current) {
        setIsCloudSynced(true);
        toast.success(`${label} salvas na nuvem!`);
      }
    } catch (error: any) {
      if (exigeReautenticacao(error)) {
        setReauthAcao(() => () => saveConfig(chave, valor, label));
      } else if (generation === configLoadGeneration.current) {
        toast.error('Erro ao salvar: ' + (error.message || 'Tente novamente.'));
      }
    } finally {
      saveLocks.current.delete(saveLockKey);
      if (generation === configLoadGeneration.current) setSaving(prev => ({ ...prev, [chave]: false }));
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

  const SaveBtn = ({ configKey, label, configValue, validate }: { configKey: string; label: string; configValue: any; validate?: () => string | null }) => (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => {
        const validationError = validate?.();
        if (validationError) {
          toast.error('Revise os horários', { description: validationError });
          return;
        }
        void saveConfig(configKey, configValue, label);
      }} disabled={saving[configKey]} aria-busy={saving[configKey]} className="gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
        {saving[configKey] ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving[configKey] ? 'Salvando…' : 'Salvar na nuvem'}
      </Button>
      {profile?.clinica_id && chaveDaClinica(configKey) && (
        <Button type="button" variant="outline" onClick={() => navigate(`/configuracoes/historico-versoes?chave=${encodeURIComponent(configKey)}&origem=${initialSettingsTab}`)} className="gap-2 rounded-full">
          <History className="h-4 w-4" /> Histórico e versões
        </Button>
      )}
    </div>
  );

  const tabItems = [
    { value: 'clinica', icon: Building, label: 'Clínica' },
    { value: 'plano', icon: CreditCard, label: 'Meu Plano' },
    { value: 'horarios', icon: Clock, label: 'Horários e Agenda Online' },
    { value: 'salas', icon: MapPin, label: 'Salas' },
    { value: 'financeiro', icon: DollarSign, label: 'Financeiro' },
    { value: 'notificacoes', icon: Bell, label: 'Notificações' },
    { value: 'integracoes', icon: PlugZap, label: 'Integrações' },
    { value: 'impressao', icon: Printer, label: 'Impressão' },
    { value: 'seguranca', icon: Shield, label: 'Segurança' },
    { value: 'backup', icon: Download, label: 'Backup' },
    { value: 'historico', icon: History, label: 'Auditoria' },
  ];
  const requestedTab = searchParams.get('tab');
  const initialSettingsTab = tabItems.some(tab => tab.value === requestedTab) ? requestedTab! : 'clinica';

  const LazyFallback = (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (location.pathname.startsWith('/configuracoes/integracoes/conectar/')) {
    return <div className="p-4 md:p-6"><IntegracoesClinica /></div>;
  }

  if (loadingConfig || (!configLoadError && loadedConfigScope !== currentConfigScope)) {
    return (
      <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-20 text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin" />
        <span>Carregando as configurações…</span>
      </div>
    );
  }

  if (configLoadError) {
    return <div className="p-4 md:p-6"><ErrorState title="Não foi possível carregar as configurações atuais" description="Os campos não serão apresentados com valores padrão para evitar sobrescrever configurações existentes. Tente carregar novamente." error={configLoadError} onRetry={() => void loadConfigs()} /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie os dados e as preferências da sua clínica."
        icon={<Settings2 />}
        actions={
          <>
            <Badge variant="outline" role="status" className={cn('w-fit gap-1.5 rounded-full', isCloudSynced ? 'border-success/30 bg-success/10 text-success' : 'border-border text-muted-foreground')}>
              {isCloudSynced ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
              {isCloudSynced ? 'Sincronizado' : 'Local'}
            </Badge>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/configuracoes-avancadas">Configurações avançadas</Link>
            </Button>
          </>
        }
      />

      <Tabs
        value={initialSettingsTab}
        onValueChange={(value) => setSearchParams((previous) => {
          const next = new URLSearchParams(previous);
          if (value === 'clinica') next.delete('tab');
          else next.set('tab', value);
          return next;
        }, { replace: true })}
        className="space-y-5 sm:space-y-6"
      >
        <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:-mx-1 sm:px-1 lg:overflow-visible">
          <TabsList aria-label="Seções das configurações" className="flex h-auto w-max min-w-full flex-nowrap justify-start gap-1 rounded-2xl bg-muted/60 p-1.5 lg:w-full lg:flex-wrap">
            {tabItems.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} title={tab.label} className="min-h-11 shrink-0 gap-2 rounded-xl px-3 text-xs data-[state=active]:shadow-sm">
                <tab.icon aria-hidden="true" className="h-4 w-4" />
                <span>{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ─── Clínica ─── */}
        <TabsContent value="clinica">
          <div>
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><Building className="h-4 w-4" /></span>Dados da Clínica</CardTitle>
                <CardDescription>Informações cadastrais completas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-nome">Nome da Clínica *</Label>
                    <Input id="config-clinica-nome" value={configClinica.nomeClinica} onChange={e => setConfigClinica({ ...configClinica, nomeClinica: e.target.value })} placeholder="Nome da clínica" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-cnpj">CNPJ</Label>
                    <Input id="config-clinica-cnpj" value={configClinica.cnpj} onChange={e => setConfigClinica({ ...configClinica, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-cnes">CNES</Label>
                    <Input id="config-clinica-cnes" value={configClinica.cnes} onChange={e => setConfigClinica({ ...configClinica, cnes: e.target.value })} placeholder="Código CNES" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-especialidade">Especialidade Principal</Label>
                    <Input id="config-clinica-especialidade" value={configClinica.especialidadePrincipal} onChange={e => setConfigClinica({ ...configClinica, especialidadePrincipal: e.target.value })} placeholder="Ex: Clínica Geral" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="config-clinica-endereco">Endereço Completo</Label>
                    <Textarea id="config-clinica-endereco" value={configClinica.endereco} onChange={e => setConfigClinica({ ...configClinica, endereco: e.target.value })} rows={2} placeholder="Rua, número, bairro, cidade - UF, CEP" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-telefone">Telefone Fixo</Label>
                    <Input id="config-clinica-telefone" value={configClinica.telefone} onChange={e => setConfigClinica({ ...configClinica, telefone: e.target.value })} placeholder="(00) 0000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-celular">Celular / WhatsApp</Label>
                    <Input id="config-clinica-celular" value={configClinica.celular} onChange={e => setConfigClinica({ ...configClinica, celular: e.target.value })} placeholder="(00) 00000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-email">Email</Label>
                    <Input id="config-clinica-email" type="email" value={configClinica.email} onChange={e => setConfigClinica({ ...configClinica, email: e.target.value })} placeholder="contato@clinica.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-website">Website</Label>
                    <Input id="config-clinica-website" value={configClinica.website} onChange={e => setConfigClinica({ ...configClinica, website: e.target.value })} placeholder="https://www.clinica.com.br" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-logo">URL do Logo</Label>
                    <Input id="config-clinica-logo" value={configClinica.logoUrl} onChange={e => setConfigClinica({ ...configClinica, logoUrl: e.target.value })} placeholder="https://..." />
                  </div>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Responsável Técnico</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-responsavel">Nome do Responsável</Label>
                    <Input id="config-clinica-responsavel" value={configClinica.responsavelTecnico} onChange={e => setConfigClinica({ ...configClinica, responsavelTecnico: e.target.value })} placeholder="Dr(a). Nome Completo" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="config-clinica-crm">CRM do Responsável</Label>
                    <Input id="config-clinica-crm" value={configClinica.crmResponsavel} onChange={e => setConfigClinica({ ...configClinica, crmResponsavel: e.target.value })} placeholder="CRM/UF 00000" />
                  </div>
                </div>

                <Separator />
                {/* Fica na aba da clínica, e não em Financeiro, porque decide
                    quem entra no consultório — não é ajuste de cobrança. */}
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-primary" /> Fluxo do Atendimento
                </h3>
                <FluxoDoAtendimento />

                <Separator />
                <SaveBtn configKey="config_clinica" label="Dados da clínica" configValue={configClinica} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Meu Plano ─── */}
        <TabsContent value="plano">
          <div className="space-y-6">
            {/* Plano Atual */}
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><CreditCard className="h-4 w-4" /></span>Seu Plano Atual</CardTitle>
                <CardDescription>Visualize e gerencie sua subscrição</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loadingPlanoAtual ? (
                  <p role="status" className="py-8 text-center text-sm text-muted-foreground">Consultando sua assinatura…</p>
                ) : erroPlanoAtual ? (
                  <ErrorState compact title="Não foi possível confirmar seu plano" error={erroConsultaPlano} onRetry={() => void recarregarPlanoAtual()} />
                ) : isPlanExempt ? (
                  <div className="rounded-xl border border-border/60 bg-muted/40 p-6 text-center">
                    <Shield className="mx-auto mb-3 h-8 w-8 text-primary" />
                    <p className="font-semibold">Acesso da plataforma</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Esta conta administra o EloLab e está isenta dos planos de cliente. Nenhuma assinatura ou cobrança é necessária.
                    </p>
                  </div>
                ) : !hasActivePlan ? (
                  <div className="text-center py-8 space-y-4">
                    <p className="text-muted-foreground">Você não possui um plano ativo</p>
                    <Button className="gap-2 rounded-full bg-gradient-primary text-foreground shadow-[0_4px_12px_rgba(16,17,19,0.06)] hover:brightness-110" onClick={() => navigate('/planos')}>
                      <CreditCard className="h-4 w-4" />
                      Escolher Plano
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Plano Ativo</Label>
                        <div className="text-2xl font-bold capitalize text-foreground">{planName || 'Carregando...'}</div>
                        <p className="text-xs text-muted-foreground">{isTrial ? 'Período de teste' : 'Plano profissional'}</p>
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        {isTrial ? (
                          <>
                            <Badge className="w-fit rounded-full border-transparent bg-secondary text-foreground">⏰ Em Teste</Badge>
                            <p className="text-xs text-muted-foreground">Restam {trialDaysLeft} dia{trialDaysLeft !== 1 ? 's' : ''}</p>
                          </>
                        ) : (
                          <>
                            <Badge className="w-fit rounded-full border-transparent bg-success/20 text-success">✓ Ativo</Badge>
                            <p className="text-xs text-muted-foreground">{resumoPeriodo}</p>
                          </>
                        )}
                      </div>
                    </div>

                    {isTrial && assinaturaAtual?.cobranca_modalidade === 'recorrente' && (
                      <>
                        <Separator />
                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-secondary p-4">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">Teste sem cobrança até o fim do período</p>
                            <p className="text-sm text-muted-foreground">Cancele aqui antes da primeira cobrança. O cancelamento encerra o acesso ao plano imediatamente.</p>
                          </div>
                          <Button variant="destructive" className="gap-2 rounded-full" onClick={() => setShowCancelPlan(true)}>
                            ✕ Cancelar teste grátis
                          </Button>
                        </div>
                      </>
                    )}

                    {!isTrial && (
                      <>
                        <Separator />

                        <div className="space-y-4">
                          <h4 className="font-semibold text-sm text-foreground">
                            {assinaturaAtual?.cobranca_modalidade === 'recorrente' ? 'Próxima renovação' : 'Período vigente'}
                          </h4>
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="rounded-lg bg-secondary p-3">
                              <p className="text-xs text-muted-foreground">
                                {assinaturaAtual?.cobranca_modalidade === 'recorrente' ? 'Vigência e renovação' : 'Vigência do plano'}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{resumoPeriodo}</p>
                            </div>
                            <div className="rounded-lg bg-secondary p-3">
                              <p className="text-xs text-muted-foreground">Valor do plano</p>
                              <p className="mt-1 text-lg font-semibold text-foreground">
                                {erroAoCarregarPlanos
                                  ? 'Preço indisponível'
                                  : carregandoPlanos
                                    ? 'Carregando...'
                                    : planos?.find(p => p.slug === planSlug)
                                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(planos.find(p => p.slug === planSlug)!.valor)
                                      : 'Plano não encontrado'}
                              </p>
                              {erroAoCarregarPlanos && <p className="text-xs text-warning" title={erroListaPlanos instanceof Error ? erroListaPlanos.message : undefined}>Atualize os planos para consultar o valor.</p>}
                            </div>
                            <div className="rounded-lg bg-secondary p-3">
                              <p className="text-xs text-muted-foreground">Modalidade de cobrança</p>
                              <p className="mt-1 flex items-center gap-1 text-xs text-foreground">
                                {assinaturaAtual?.cobranca_modalidade === 'pre_pago' ? 'Período pré-pago' : assinaturaAtual?.cobranca_modalidade === 'recorrente' ? 'Cartão recorrente' : 'Não informada'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    <Separator />

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="gap-2 rounded-full" onClick={() => navigate('/planos')}>
                        <CreditCard className="h-4 w-4" />
                        {textoAcaoPlano(planSlug)}
                      </Button>
                      <Button variant="outline" asChild className="gap-2 rounded-full">
                        <Link to="/configuracoes/plano/faturas">
                        <Receipt className="h-4 w-4" />
                        Ver histórico de faturas
                        </Link>
                      </Button>
                      {!isTrial && assinaturaAtual?.cobranca_modalidade !== 'pre_pago' && (
                        <Button variant="destructive" className="gap-2 rounded-full" onClick={() => setShowCancelPlan(true)}>
                          ✕ Cancelar Plano
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {!isPlanExempt && profile?.clinica_id && <UsoDoPlano />}

            {/* Dialog: Cancel plan */}
            <Dialog open={showCancelPlan} onOpenChange={open => {
              if (open || (!cancelPlanLock.current && !cancelPlanMutation.isPending)) setShowCancelPlan(open);
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{isTrial ? 'Cancelar teste grátis?' : 'Cancelar assinatura?'}</DialogTitle>
                  <DialogDescription asChild>
                    <div><CancelamentoPlanoResumo isTrial={isTrial} trialEnd={trialEnd} /></div>
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="cancel-plan-reason" className="text-sm">Motivo do cancelamento (opcional, ajuda a melhorar)</Label>
                  <Textarea id="cancel-plan-reason" value={motivoCancelamentoPlano} onChange={(e) => setMotivoCancelamentoPlano(e.target.value)} maxLength={500} rows={3} disabled={cancelPlanMutation.isPending} placeholder="Ex.: encontrei outra solução, custo, não atendeu à necessidade..." />
                  <p className="text-xs text-muted-foreground">{motivoCancelamentoPlano.length}/500</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" className="rounded-full" onClick={() => setShowCancelPlan(false)} disabled={cancelPlanMutation.isPending}>Manter assinatura</Button>
                  <Button variant="destructive" className="rounded-full" disabled={cancelPlanMutation.isPending} onClick={confirmarCancelamentoPlano}>
                    {cancelPlanMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    {isTrial ? 'Cancelar teste grátis' : 'Confirmar cancelamento'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        {/* ─── Horários ─── */}
        <TabsContent value="horarios" className="space-y-6">
          <AgendamentoOnlineConfig />
          <div>
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><Clock className="h-4 w-4" /></span>Horários de Funcionamento</CardTitle>
                <CardDescription>
                  Horário geral da clínica, exibido no link público. Os horários disponíveis para marcar dependem da agenda de cada profissional.{' '}
                  <Button variant="link" asChild className="h-auto p-0 align-baseline"><Link to="/equipe">Configurar disponibilidade da equipe</Link></Button>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <h3 className="font-semibold text-sm">Horário Principal</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="horario-abertura">Abertura</Label>
                    <Input id="horario-abertura" type="time" value={configClinica.horarioAbertura} onChange={e => setConfigClinica({ ...configClinica, horarioAbertura: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horario-fechamento">Fechamento</Label>
                    <Input id="horario-fechamento" type="time" value={configClinica.horarioFechamento} onChange={e => setConfigClinica({ ...configClinica, horarioFechamento: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horario-almoco-inicio">Início Almoço</Label>
                    <Input id="horario-almoco-inicio" type="time" value={configClinica.horarioAlmocoInicio} onChange={e => setConfigClinica({ ...configClinica, horarioAlmocoInicio: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horario-almoco-fim">Fim Almoço</Label>
                    <Input id="horario-almoco-fim" type="time" value={configClinica.horarioAlmocoFim} onChange={e => setConfigClinica({ ...configClinica, horarioAlmocoFim: e.target.value })} />
                  </div>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">Consultas</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label id="duracao-consulta-label">Duração Padrão</Label>
                    <Select value={configClinica.duracaoConsulta.toString()} onValueChange={v => setConfigClinica({ ...configClinica, duracaoConsulta: parseInt(v) })}>
                      <SelectTrigger aria-labelledby="duracao-consulta-label"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[10, 15, 20, 25, 30, 40, 45, 50, 60].map(m => (
                          <SelectItem key={m} value={m.toString()}>{m} minutos</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label id="intervalo-consultas-label">Intervalo entre Consultas</Label>
                    <Select value={configClinica.intervaloConsultas.toString()} onValueChange={v => setConfigClinica({ ...configClinica, intervaloConsultas: parseInt(v) })}>
                      <SelectTrigger aria-labelledby="intervalo-consultas-label"><SelectValue /></SelectTrigger>
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
                    <button key={dia.value} type="button" aria-pressed={configClinica.diasFuncionamento.includes(dia.value)} onClick={() => toggleDia(dia.value)} className={cn('h-8 min-w-[48px] rounded-full border px-3 text-xs transition-colors', configClinica.diasFuncionamento.includes(dia.value) ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-border/60 bg-card hover:border-foreground/25')}>
                      {dia.label}
                    </button>
                  ))}
                </div>

                {configClinica.diasFuncionamento.includes('sab') && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                    <h4 className="text-sm font-medium mb-3">Horário de Sábado</h4>
                    <div className="grid grid-cols-2 gap-4 max-w-sm">
                      <div className="space-y-1"><Label htmlFor="sabado-abertura" className="text-xs">Abertura</Label><Input id="sabado-abertura" type="time" value={configClinica.sabadoAbertura} onChange={e => setConfigClinica({ ...configClinica, sabadoAbertura: e.target.value })} /></div>
                      <div className="space-y-1"><Label htmlFor="sabado-fechamento" className="text-xs">Fechamento</Label><Input id="sabado-fechamento" type="time" value={configClinica.sabadoFechamento} onChange={e => setConfigClinica({ ...configClinica, sabadoFechamento: e.target.value })} /></div>
                    </div>
                  </div>
                )}

                <Separator />
                <SaveBtn configKey="config_clinica" label="Horários" configValue={configClinica} validate={() => validarHorarioClinica(configClinica)} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Salas ─── */}
        <TabsContent value="salas">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Salas e leitos</CardTitle>
              <CardDescription>Cadastre espaços, acompanhe ocupação e disponibilidade no workspace de salas.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-sm text-muted-foreground">A gestão foi centralizada junto da lista de espera para manter cadastro, ocupação e encaminhamento no mesmo contexto.</p>
              <Button asChild className="shrink-0"><Link to="/gestao-fluxo?tab=salas">Abrir salas e leitos</Link></Button>
            </CardContent>
          </Card>
        </TabsContent>




        {/* ─── Financeiro ─── */}
        <TabsContent value="financeiro">
          <div>
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><DollarSign className="h-4 w-4" /></span>Operação financeira</CardTitle>
                <CardDescription>Configure preços e acompanhe cobranças nos módulos que usam esses dados.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-border/60 p-4">
                  <div>
                    <h3 className="font-medium">Preços e serviços</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Cadastre serviços, valores particulares e preços de exames por convênio.</p>
                  </div>
                  <Button asChild className="rounded-full"><Link to="/precos-servicos">Abrir preços e serviços</Link></Button>
                </div>
                <div className="space-y-3 rounded-xl border border-border/60 p-4">
                  <div>
                    <h3 className="font-medium">Contas e recebimentos</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Registre cobranças, pagamentos, vencimentos e formas recebidas em cada lançamento.</p>
                  </div>
                  <Button asChild className="rounded-full"><Link to="/contas?tab=receber">Abrir contas a receber</Link></Button>
                </div>
                <div className="space-y-3 rounded-xl border border-border/60 p-4">
                  <div>
                    <h3 className="font-medium">Caixa da recepção</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Conclua atendimentos e registre o pagamento no fluxo do caixa.</p>
                  </div>
                  <Button asChild className="rounded-full"><Link to="/recepcao">Abrir recepção</Link></Button>
                </div>
                <div className="space-y-3 rounded-xl border border-border/60 p-4">
                  <div>
                    <h3 className="font-medium">Faturamento de convênios</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Organize lotes TISS, faturamento e acompanhamento de glosas.</p>
                  </div>
                  <Button asChild className="rounded-full"><Link to="/faturamento-convenios">Abrir faturamento</Link></Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Integrações ─── */}
        <TabsContent value="integracoes">
          <IntegracoesClinica />
        </TabsContent>

        {/* ─── Notificações ─── */}
        <TabsContent value="notificacoes">
          <div>
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><Bell className="h-4 w-4" /></span>Notificações</CardTitle>
                <CardDescription>Gerencie lembretes e mensagens automáticas da clínica</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4">
                  <p className="font-medium text-sm">As regras de envio ficam em Automações</p>
                  <p className="text-sm text-muted-foreground">
                    Os controles antigos desta aba só eram armazenados e não alteravam o envio. Configure e acompanhe os lembretes e mensagens que estão realmente ativos no módulo Automações.
                  </p>
                </div>
                <Button asChild className="rounded-full bg-gradient-primary text-white hover:brightness-110"><Link to="/automacoes">Abrir Automações</Link></Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Impressão ─── */}
        <TabsContent value="impressao">
          <div>
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><Printer className="h-4 w-4" /></span>Impressão e Receituário</CardTitle>
                <CardDescription>Personalize os elementos exibidos no receituário médico em PDF.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="rodape-receituario">Rodapé do receituário</Label>
                  <Textarea id="rodape-receituario" value={configImpressao.rodapeReceita} onChange={e => setConfigImpressao({ ...configImpressao, rodapeReceita: e.target.value })} rows={2} placeholder="Ex: Este documento é válido por 30 dias" />
                  <p className="text-xs text-muted-foreground">O rodapé personalizado aparece acima do aviso de assinatura e é limitado a duas linhas.</p>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">Elementos Visíveis</h3>
                <div className="divide-y">
                  <SettingRow icon={Image} title="Mostrar Logo" description="Incluir logo da clínica no cabeçalho dos documentos">
                    <Switch aria-label="Mostrar logotipo nos documentos" checked={configImpressao.mostrarLogo} onCheckedChange={v => setConfigImpressao({ ...configImpressao, mostrarLogo: v })} />
                  </SettingRow>
                  <SettingRow icon={Hash} title="Mostrar CRM" description="Incluir o CRM do profissional na área de assinatura">
                    <Switch aria-label="Mostrar CRM na assinatura" checked={configImpressao.mostrarCRM} onCheckedChange={v => setConfigImpressao({ ...configImpressao, mostrarCRM: v })} />
                  </SettingRow>
                  <SettingRow icon={Building} title="Mostrar CNES" description="Incluir código CNES do estabelecimento">
                    <Switch aria-label="Mostrar CNES nos documentos" checked={configImpressao.mostrarCNES} onCheckedChange={v => setConfigImpressao({ ...configImpressao, mostrarCNES: v })} />
                  </SettingRow>
                </div>

                <Separator />
                <SaveBtn configKey="config_impressao" label="Configurações de impressão" configValue={configImpressao} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Segurança ─── */}
        <TabsContent value="seguranca">
          <div>
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><Shield className="h-4 w-4" /></span>Segurança e Privacidade</CardTitle>
                <CardDescription>Configurações de segurança do sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  <SettingRow icon={Key} title="Encerrar sessão após" description="Tempo sem atividade antes de sair da conta.">
                    <Select value={configSeguranca.sessionTimeoutMin.toString()} onValueChange={v => setConfigSeguranca({ ...configSeguranca, sessionTimeoutMin: parseInt(v) })}>
                      <SelectTrigger aria-label="Tempo sem atividade para encerrar a sessão" className="w-[160px] rounded-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutos</SelectItem>
                        <SelectItem value="30">30 minutos</SelectItem>
                        <SelectItem value="60">1 hora</SelectItem>
                        <SelectItem value="120">2 horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                </div>
                <AccountSessionsPanel />
                <div className="mt-6 space-y-3 rounded-xl border border-border bg-secondary p-4">
                  <div className="flex gap-3">
                    <Shield className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">Proteções aplicadas pelo sistema</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Cadastro e redefinição de senha exigem pelo menos 10 caracteres, incluindo maiúscula, minúscula e número. O agendamento online sempre solicita consentimento. A autenticação em dois fatores é configurada por conta.
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-full" asChild><Link to="/seguranca">Configurar segurança da conta</Link></Button>
                </div>
                <Separator className="my-6" />
                <SaveBtn configKey="config_seguranca" label="Configurações de segurança" configValue={configSeguranca} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Backup ─── */}
        <TabsContent value="backup">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" />Backup e recuperação</CardTitle>
                <CardDescription>Exporte os dados da clínica ou confira um arquivo antes de restaurar.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm text-muted-foreground">A prévia mostra a origem, a integridade e o que será criado ou atualizado.</p>
                <Button asChild className="shrink-0"><Link to="/configuracoes/backup">Abrir backup</Link></Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" />Importar dados</CardTitle>
                <CardDescription>Traga pacientes ou agenda de outro sistema e revise as linhas antes de importar.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm text-muted-foreground">Planilhas .csv, .xlsx e .xls com mapeamento e prévia de duplicidades.</p>
                <Button asChild className="shrink-0"><Link to="/configuracoes/importar-dados">Abrir importação</Link></Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Auditoria ─── */}
        <TabsContent value="historico">
          <div>
            <AuditLog />
          </div>
        </TabsContent>
      </Tabs>
      <ReauthDialog
        open={reauthAcao !== null}
        email={user?.email ?? ''}
        onOpenChange={(open) => { if (!open) setReauthAcao(null); }}
        title="Confirme sua identidade"
        description="Esta mudança reduz os controles de segurança da clínica (por exemplo, aumenta o tempo de sessão). Confirme sua identidade para continuar."
        onConfirmed={async () => { await reauthAcao?.(); }}
      />
    </div>
  );
}
