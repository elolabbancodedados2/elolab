import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Save, Building, Clock, Bell, Download, History,
  Shield,
  Key, RefreshCw, CloudOff, Cloud,
  DollarSign, Printer, MapPin, Phone, Users, Plus, Trash2, Edit,
  CreditCard, Receipt, Loader2, Hash, Clipboard, Image, Workflow,
  PlugZap,
} from 'lucide-react';
import { FluxoDoAtendimento } from '@/components/configuracoes/FluxoDoAtendimento';
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
import { ImportadorDePlanilha } from '@/components/importacao/ImportadorDePlanilha';
import { AuditLog } from '@/components/AuditLog';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from '@/contexts/ThemeContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserPlan, usePlanos } from '@/hooks/useSubscriptionPlan';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { abrirUrlSegura, checkoutUrlSeguro } from '@/lib/safeUrl';
import { clearClinicaInfoCache } from '@/lib/pdfGenerator';
import { IntegracoesClinica } from '@/components/configuracoes/IntegracoesClinica';
import { AgendamentoOnlineConfig } from '@/components/configuracoes/AgendamentoOnlineConfig';
import { CONFIG_SEGURANCA_ATUALIZADA_EVENT, chaveDaClinica, lerConfigsClinicaComVersoes } from '@/lib/configClinica';




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

const FATURA_STATUS_LABEL: Record<string, string> = {
  approved: 'Pago', aprovado: 'Pago',
  pending: 'Pendente', pendente: 'Pendente',
  rejected: 'Recusado', recusado: 'Recusado',
  cancelled: 'Cancelado', cancelado: 'Cancelado', cancelada: 'Cancelado',
  refunded: 'Estornado', estornado: 'Estornado',
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
function SalasManager() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  /** Excluir sala é irreversível e ficava a um clique de distância, sem aviso. */
  const [salaParaExcluir, setSalaParaExcluir] = useState<{ id: string; nome: string } | null>(null);
  const [form, setForm] = useState({ nome: '', tipo: 'consultorio', ativo: true, equipamentos: '' as string });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saveLock = useRef(false);
  const deleteLock = useRef(false);

  const salasQuery = useQuery({
    queryKey: ['salas-config', profile?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data, error } = await supabase.from('salas').select('*').eq('clinica_id', profile.clinica_id).order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const salas = salasQuery.data ?? [];
  const { isLoading } = salasQuery;

  const handleSave = async () => {
    if (saveLock.current) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    if (salasQuery.isError || salasQuery.isLoading) { toast.error('Carregue as salas antes de salvar.'); return; }
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    saveLock.current = true;
    setSaving(true);
    try {
      const equipArray = form.equipamentos ? form.equipamentos.split(',').map(s => s.trim()).filter(Boolean) : null;
      const payload: any = { nome: form.nome.trim(), tipo: form.tipo, ativo: form.ativo, equipamentos: equipArray };
      if (editId) {
        const { data, error } = await supabase.from('salas').update(payload)
          .eq('id', editId).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Sala não encontrada ou sem permissão para alterar.');
        toast.success('Sala atualizada!');
      } else {
        const { error } = await supabase.from('salas').insert([{
          ...payload,
          clinica_id: profile.clinica_id,
        }]);
        if (error) throw error;
        toast.success('Sala criada!');
      }
      queryClient.invalidateQueries({ queryKey: ['salas-config'] });
      setShowForm(false); setEditId(null);
    } catch (e: any) { toast.error(e.message); }
    finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deleteLock.current) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    deleteLock.current = true;
    setDeleting(true);
    try {
      const { data, error } = await supabase.from('salas').delete()
        .eq('id', id).eq('clinica_id', profile.clinica_id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir esta sala.');
      await queryClient.invalidateQueries({ queryKey: ['salas-config'] });
      setSalaParaExcluir(null);
      toast.success('Sala removida!');
    } catch (error) {
      toast.error('Não foi possível excluir a sala', { description: (error as Error)?.message || 'Tente novamente.' });
    } finally {
      deleteLock.current = false;
      setDeleting(false);
    }
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
          <Button size="sm" disabled={!profile?.clinica_id || isLoading || salasQuery.isError} onClick={() => { setEditId(null); setForm({ nome: '', tipo: 'consultorio', ativo: true, equipamentos: '' }); setShowForm(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nova Sala
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {salasQuery.isError ? <ErrorState compact title="Não foi possível carregar as salas" error={salasQuery.error} onRetry={() => void salasQuery.refetch()} /> : isLoading ? <Skeleton className="h-32 w-full" /> : (salas as any[]).length === 0 ? (
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

      <Dialog open={showForm} onOpenChange={v => {
        if (v || !saveLock.current) {
          setShowForm(v);
          if (!v) setEditId(null);
        }
      }}>
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
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{editId ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {salaParaExcluir && (
        <DeleteConfirmDialog
          open
          onOpenChange={(o) => { if (!o && !deleteLock.current) setSalaParaExcluir(null); }}
          itemName={salaParaExcluir.nome}
          onConfirm={() => { void handleDelete(salaParaExcluir.id); }}
          isLoading={deleting}
          closeOnConfirm={false}
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
  const { planName, planSlug, hasActivePlan, isTrial, trialEnd, trialDaysLeft, isLoading: loadingPlanoAtual, isError: erroPlanoAtual, error: erroConsultaPlano, refetch: recarregarPlanoAtual } = useUserPlan();
  const { data: planos, isLoading: carregandoPlanos, isError: erroAoCarregarPlanos, error: erroListaPlanos } = usePlanos();
  const navigate = useNavigate();
  const [showFaturas, setShowFaturas] = useState(false);
  const [showCancelPlan, setShowCancelPlan] = useState(false);
  const cancelPlanLock = useRef(false);

  const { data: faturas, isLoading: loadingFaturas, error: erroFaturas, refetch: recarregarFaturas } = useQuery({
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
      const { data, error } = await supabase.functions.invoke('mercadopago-checkout', {
        body: {
          action: 'cancel_subscription',
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
    onSettled: () => { cancelPlanLock.current = false; },
  });

  const confirmarCancelamentoPlano = () => {
    if (cancelPlanLock.current || cancelPlanMutation.isPending) return;
    cancelPlanLock.current = true;
    cancelPlanMutation.mutate();
  };

  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [configClinica, setConfigClinica] = useState<ConfiguracaoClinica>(DEFAULT_CLINICA);
  const [configSeguranca, setConfigSeguranca] = useState<ConfiguracaoSeguranca>(DEFAULT_SEGURANCA);
  const [configImpressao, setConfigImpressao] = useState<ConfiguracaoImpressao>(DEFAULT_IMPRESSAO);
  const [configVersions, setConfigVersions] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const saveLocks = useRef(new Set<string>());
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configLoadError, setConfigLoadError] = useState<unknown>(null);
  const configLoadGeneration = useRef(0);
  const [loadedConfigScope, setLoadedConfigScope] = useState<string | null>(null);
  const currentConfigScope = `${user?.id ?? ''}:${profile?.clinica_id ?? ''}`;

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
    if (!user?.id || !profile?.clinica_id) {
      setConfigLoadError(new Error('Sessão ou clínica não identificada.'));
      setLoadingConfig(false);
      return;
    }
    try {
      const [configResult, clinicaResult] = await Promise.all([
        // Chaves da clínica vêm da linha compartilhada da clínica; antes a
        // leitura era só das linhas do próprio usuário, e um segundo admin
        // abria esta tela vazia.
        profile?.clinica_id
          ? lerConfigsClinicaComVersoes(profile.clinica_id).then(
              ({ configs, updatedAtByKey }) => ({
                data: Object.entries(configs).map(([chave, valor]) => ({ chave, valor })),
                versions: updatedAtByKey,
                error: null,
              }),
              (error) => ({ data: [] as Array<{ chave: string; valor: any }>, versions: {}, error }),
            )
          : Promise.resolve({ data: [] as Array<{ chave: string; valor: any }>, versions: {}, error: null }),
        profile?.clinica_id
          ? supabase
              .from('clinicas')
              .select('nome, cnpj')
              .eq('id', profile.clinica_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (generation !== configLoadGeneration.current) return;
      if (configResult.error) throw configResult.error;
      if (clinicaResult.error) throw clinicaResult.error;

      setLoadedConfigScope(`${user!.id}:${profile!.clinica_id}`);
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
  }, [profile?.clinica_id, user?.id]);

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
        const { data: novaVersao, error } = await (supabase as any).rpc('salvar_configuracao_clinica_segura', {
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
      if (generation === configLoadGeneration.current) {
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
    <Button onClick={() => {
      const validationError = validate?.();
      if (validationError) {
        toast.error('Revise os horários', { description: validationError });
        return;
      }
      void saveConfig(configKey, configValue, label);
    }} disabled={saving[configKey]} className="gap-2">
      {saving[configKey] ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      Salvar na Nuvem
    </Button>
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

  const LazyFallback = (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (loadingConfig || (!configLoadError && loadedConfigScope !== currentConfigScope)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (configLoadError) {
    return <div className="p-4 md:p-6"><ErrorState title="Não foi possível carregar as configurações atuais" description="Os campos não serão apresentados com valores padrão para evitar sobrescrever configurações existentes. Tente carregar novamente." error={configLoadError} onRetry={() => void loadConfigs()} /></div>;
  }

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
        <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible">
          <TabsList className="flex h-auto w-max min-w-full flex-nowrap gap-1 bg-muted/50 p-1 sm:w-full sm:flex-wrap">
            {tabItems.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} aria-label={tab.label} title={tab.label} className="shrink-0 gap-1.5 text-xs">
                <tab.icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

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
                {loadingPlanoAtual ? (
                  <p role="status" className="py-8 text-center text-sm text-muted-foreground">Consultando sua assinatura…</p>
                ) : erroPlanoAtual ? (
                  <ErrorState compact title="Não foi possível confirmar seu plano" error={erroConsultaPlano} onRetry={() => void recarregarPlanoAtual()} />
                ) : !hasActivePlan ? (
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
                                {erroAoCarregarPlanos
                                  ? 'Preço indisponível'
                                  : carregandoPlanos
                                    ? 'Carregando...'
                                    : planos?.find(p => p.slug === planSlug)
                                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(planos.find(p => p.slug === planSlug)!.valor)
                                      : 'Plano não encontrado'}
                              </p>
                              {erroAoCarregarPlanos && <p className="text-xs text-destructive" title={erroListaPlanos instanceof Error ? erroListaPlanos.message : undefined}>Atualize os planos para consultar o valor.</p>}
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
                ) : erroFaturas ? (
                  <ErrorState compact title="Não foi possível carregar as faturas" error={erroFaturas} onRetry={() => void recarregarFaturas()} />
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
                              {FATURA_STATUS_LABEL[String(f.status || '').toLowerCase()] || f.status || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {f.checkout_url && (
                              <Button size="sm" variant="ghost" onClick={() => abrirUrlSegura(f.checkout_url, checkoutUrlSeguro)}>Abrir</Button>
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
            <Dialog open={showCancelPlan} onOpenChange={open => {
              if (open || (!cancelPlanLock.current && !cancelPlanMutation.isPending)) setShowCancelPlan(open);
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancelar assinatura?</DialogTitle>
                  <DialogDescription>
                    Sua assinatura será cancelada no Mercado Pago. Você manterá acesso até o fim do período já pago.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCancelPlan(false)} disabled={cancelPlanMutation.isPending}>Manter assinatura</Button>
                  <Button variant="destructive" disabled={cancelPlanMutation.isPending} onClick={confirmarCancelamentoPlano}>
                    {cancelPlanMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Confirmar cancelamento
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </motion.div>
        </TabsContent>

        {/* ─── Horários ─── */}
        <TabsContent value="horarios" className="space-y-6">
          <AgendamentoOnlineConfig />
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Horários de Funcionamento</CardTitle>
                <CardDescription>
                  Horário geral da clínica, exibido no link público. Os horários disponíveis para marcar dependem da agenda de cada profissional.{' '}
                  <Button variant="link" asChild className="h-auto p-0 align-baseline"><Link to="/equipe">Configurar disponibilidade da equipe</Link></Button>
                </CardDescription>
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
                <SaveBtn configKey="config_clinica" label="Horários" configValue={configClinica} validate={() => validarHorarioClinica(configClinica)} />
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
                <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" />Operação financeira</CardTitle>
                <CardDescription>Configure preços e acompanhe cobranças nos módulos que usam esses dados.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <h3 className="font-medium">Preços e serviços</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Cadastre serviços, valores particulares e preços de exames por convênio.</p>
                  </div>
                  <Button asChild><Link to="/precos-servicos">Abrir preços e serviços</Link></Button>
                </div>
                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <h3 className="font-medium">Contas e recebimentos</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Registre cobranças, pagamentos, vencimentos e formas recebidas em cada lançamento.</p>
                  </div>
                  <Button asChild><Link to="/contas?tab=receber">Abrir contas a receber</Link></Button>
                </div>
                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <h3 className="font-medium">Caixa da recepção</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Conclua atendimentos e registre o pagamento no fluxo do caixa.</p>
                  </div>
                  <Button asChild><Link to="/recepcao">Abrir recepção</Link></Button>
                </div>
                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <h3 className="font-medium">Faturamento de convênios</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Organize lotes TISS, faturamento e acompanhamento de glosas.</p>
                  </div>
                  <Button asChild><Link to="/faturamento-convenios">Abrir faturamento</Link></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ─── Notificações ─── */}
        <TabsContent value="integracoes">
          <IntegracoesClinica />
        </TabsContent>

        <TabsContent value="notificacoes">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" />Notificações</CardTitle>
                <CardDescription>Gerencie lembretes e mensagens automáticas da clínica</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <p className="font-medium text-sm">As regras de envio ficam em Automações</p>
                  <p className="text-sm text-muted-foreground">
                    Os controles antigos desta aba só eram armazenados e não alteravam o envio. Configure e acompanhe os lembretes e mensagens que estão realmente ativos no módulo Automações.
                  </p>
                </div>
                <Button asChild><Link to="/automacoes">Abrir Automações</Link></Button>
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
                <CardDescription>Personalize os elementos exibidos no receituário médico em PDF.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Rodapé do Receituário</Label>
                  <Textarea value={configImpressao.rodapeReceita} onChange={e => setConfigImpressao({ ...configImpressao, rodapeReceita: e.target.value })} rows={2} placeholder="Ex: Este documento é válido por 30 dias" />
                  <p className="text-xs text-muted-foreground">O rodapé personalizado aparece acima do aviso de assinatura e é limitado a duas linhas.</p>
                </div>

                <Separator />
                <h3 className="font-semibold text-sm">Elementos Visíveis</h3>
                <div className="divide-y">
                  <SettingRow icon={Image} title="Mostrar Logo" description="Incluir logo da clínica no cabeçalho dos documentos">
                    <Switch checked={configImpressao.mostrarLogo} onCheckedChange={v => setConfigImpressao({ ...configImpressao, mostrarLogo: v })} />
                  </SettingRow>
                  <SettingRow icon={Hash} title="Mostrar CRM" description="Incluir o CRM do profissional na área de assinatura">
                    <Switch checked={configImpressao.mostrarCRM} onCheckedChange={v => setConfigImpressao({ ...configImpressao, mostrarCRM: v })} />
                  </SettingRow>
                  <SettingRow icon={Building} title="Mostrar CNES" description="Incluir código CNES do estabelecimento">
                    <Switch checked={configImpressao.mostrarCNES} onCheckedChange={v => setConfigImpressao({ ...configImpressao, mostrarCNES: v })} />
                  </SettingRow>
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
                </div>
                <div className="mt-6 p-4 rounded-xl border bg-primary/5 space-y-3">
                  <div className="flex gap-3">
                    <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Proteções aplicadas pelo sistema</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Cadastro e redefinição de senha exigem pelo menos 10 caracteres, incluindo maiúscula, minúscula e número. O agendamento online sempre solicita consentimento. A autenticação em dois fatores é configurada por conta.
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild><Link to="/seguranca">Configurar segurança da conta</Link></Button>
                </div>
                <Separator className="my-6" />
                <SaveBtn configKey="config_seguranca" label="Configurações de segurança" configValue={configSeguranca} />
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ─── Backup ─── */}
        <TabsContent value="backup">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <BackupRestore />
            {/* Fica junto do backup porque é a mesma pergunta do usuário —
                "como tiro e como ponho dados aqui" — e é onde ele procura no
                dia em que troca de sistema. */}
            <ImportadorDePlanilha />
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
