 /**
  * Configurações Avançadas - Complemento ao Painel de Admin
  * Seções críticas para operação da plataforma:
  * - Status & Health Check
  * - Integrações (APIs, webhooks)
  * - Especialidades & Equipes
  * - Templates CID-10
  * - Documentos & Templates
  * - LGPD & Privacidade
  */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Server, Zap, Database, Shield, Key, Code, GitBranch, Activity,
  Stethoscope, Users, FileText, CheckCircle2, AlertCircle, AlertTriangle,
  Plus, Edit, Trash2, Save, Settings, RefreshCw, Download, Upload,
  Globe, Webhook, Terminal, Lock, Eye, EyeOff, Copy, Check,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';

/* ─── Types ─── */
interface SystemHealth {
  database: { status: 'ok' | 'warning' | 'error'; latency: number };
  auth: { status: 'ok' | 'error'; detail: string };
  /** usedGB/totalGB são null: a cota real só é acessível pela API de
   *  administração do Supabase, indisponível no navegador. */
  storage: { status: 'ok' | 'warning' | 'error'; usedGB: number | null; totalGB: number | null };
  lastCheck: Date;
}

interface IntegrationCheck {
  id: string; nome: string; status: 'ok' | 'warning' | 'error';
  detalhe: string; latencia_ms?: number;
}

interface Especialidade {
  id: string;
  clinica_id: string | null;
  codigo: string;
  nome: string;
  descricao: string;
  ativo: boolean;
}

const formatarDataHoraSaoPaulo = (valor: string | Date, incluirSegundos = false) => {
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', ...(incluirSegundos ? { second: '2-digit' as const } : {}),
    hourCycle: 'h23',
  }).format(data);
};

/* ─── 1. HEALTH CHECK & STATUS ─── */
export function HealthCheckTab() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [checking, setChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const startTime = performance.now();

      // Database
      const { error: dbError } = await supabase
        .from('pacientes')
        .select('id', { head: true });
      const dbLatency = Math.round(performance.now() - startTime);

      // Auth
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      // Storage: mede o que dá para medir pelo cliente — se algum bucket
      // responde. O total consumido em GB só existe na API de administração do
      // Supabase, que não pode ser chamada do navegador, então NÃO inventamos
      // um número aqui (a versão anterior usava Math.random()).
      const { error: storageError } = await supabase.storage
        .from('medical-attachments')
        .list('', { limit: 1 });

      setHealth({
        database: { status: dbError ? 'error' : 'ok', latency: dbLatency },
        auth: {
          status: user && !authError ? 'ok' : 'error',
          detail: user && !authError ? 'Sessão atual validada' : 'Sessão não autenticada ou indisponível',
        },
        storage: {
          status: storageError ? 'error' : 'ok',
          usedGB: null,
          totalGB: null,
        },
        lastCheck: new Date(),
      });

      if (dbError || authError || storageError) {
        toast.warning('Verificação concluída com falhas', { description: 'Revise o estado dos serviços abaixo.' });
      } else {
        toast.success('Todos os serviços verificados responderam.');
      }
    } catch (error) {
      toast.error('Erro ao verificar saúde do sistema', { description: mensagemDeErro(error) });
      console.error(error);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const StatusBadge = ({ status }: { status: 'ok' | 'warning' | 'error' }) => {
    const variants: Record<string, { bg: string; text: string; icon: any }> = {
      ok: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle2 },
      warning: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: AlertTriangle },
      error: { bg: 'bg-red-100', text: 'text-red-800', icon: AlertCircle },
    };
    const v = variants[status];
    const Icon = v.icon;
    return <Badge className={`${v.bg} ${v.text} gap-1`}><Icon className="h-3 w-3" /> {status.toUpperCase()}</Badge>;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />Status do Sistema</CardTitle>
            <CardDescription>Verificação em tempo real dos serviços</CardDescription>
          </div>
          <Button onClick={checkHealth} disabled={checking} size="sm" variant="outline">
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Verificando...' : 'Verificar Agora'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {health ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Database */}
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-blue-600" />
                        <span className="font-semibold">API de Dados</span>
                      </div>
                      <StatusBadge status={health.database.status} />
                    </div>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>Consulta real: <span className="font-semibold text-foreground">{health.database.latency}ms</span></p>
                    </div>
                  </CardContent>
                </Card>

                {/* Auth */}
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-green-600" />
                        <span className="font-semibold">Autenticação</span>
                      </div>
                      <StatusBadge status={health.auth.status} />
                    </div>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>{health.auth.detail}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Storage */}
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-purple-600" />
                        <span className="font-semibold">Acesso aos anexos</span>
                      </div>
                      <StatusBadge status={health.storage.status} />
                    </div>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>
                        {health.storage.status === 'error'
                          ? 'Bucket de anexos não respondeu ou o acesso foi negado'
                          : 'Bucket medical-attachments acessível'}
                      </p>
                      <p className="text-xs">
                        Consumo em GB: consulte o painel do Supabase
                        (Settings → Usage). Não é possível medir pelo navegador.
                      </p>
                    </div>
                  </CardContent>
                </Card>

              </div>

              <Separator />
              <div className="text-xs text-muted-foreground">
                Última verificação: {formatarDataHoraSaoPaulo(health.lastCheck, true)}
              </div>
            </>
          ) : (
            <div role="status" className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              {checking && <RefreshCw className="h-4 w-4 animate-spin" />}
              {checking ? 'Verificando os serviços…' : 'Clique em "Verificar Agora" para iniciar'}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── 2. INTEGRAÇÕES ─── */
export function IntegracoesTab() {
  const { user, profile } = useSupabaseAuth();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['integration-health', user?.id ?? null, profile?.clinica_id ?? null],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('integration-health');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { checked_at: string; overall: string; checks: IntegrationCheck[] };
    },
    staleTime: 60_000,
  });
  const integracoes = data?.checks ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Code className="h-5 w-5" />Integrações</CardTitle>
            <CardDescription>APIs e webhooks conectados</CardDescription>
          </div>
          <Button onClick={() => refetch()} disabled={isFetching} size="sm" variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Verificar agora
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{mensagemDeErro(error)}</AlertDescription></Alert>}
          {integracoes.map(integracao => (
            <div key={integracao.id} className="flex items-start justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  {integracao.nome}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">{integracao.detalhe}</p>
                {integracao.latencia_ms !== undefined && <p className="text-xs text-muted-foreground mt-1">Latência: {integracao.latencia_ms} ms</p>}
              </div>
              <Badge className={integracao.status === 'ok' ? 'bg-green-100 text-green-800' : integracao.status === 'warning' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}>{integracao.status === 'ok' ? 'Operacional' : integracao.status === 'warning' ? 'Atenção' : 'Falha'}</Badge>
            </div>
          ))}

          {!error && integracoes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Code className="h-12 w-12 mx-auto opacity-20 mb-2" />
              <p>{isLoading ? 'Verificando integrações...' : 'Nenhuma integração encontrada'}</p>
            </div>
          )}
          {data?.checked_at && <p className="text-xs text-muted-foreground">Última verificação: {formatarDataHoraSaoPaulo(data.checked_at, true)}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── 3. ESPECIALIDADES ─── */
export function EspecialidadesTab() {
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();

  const especialidadesQuery = useQuery({
    queryKey: ['especialidades', profile?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      if (!profile?.clinica_id) return [] as Especialidade[];
      // A tabela existe (migration add_referral_system) mas ainda não consta no
      // types.ts gerado — mesma convenção usada nas demais telas.
      const { data, error } = await (supabase as any).from('especialidades_destino')
        .select('*')
        .or(`clinica_id.is.null,clinica_id.eq.${profile.clinica_id}`)
        .order('nome');
      if (error) throw error;
      return (data || []) as Especialidade[];
    },
    enabled: !!profile?.clinica_id,
  });
  const especialidades = especialidadesQuery.data ?? [];

  const criarEspecialidade = async () => {
    if (!profile?.clinica_id) return toast.error('Clínica não identificada.');
    if (especialidadesQuery.isLoading || especialidadesQuery.isError) return toast.error('Carregue as especialidades antes de criar outra.');
    const nome = window.prompt('Nome da nova especialidade:')?.trim();
    if (!nome) return;
    const sugerido = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
    const codigo = window.prompt('Código curto:', sugerido)?.trim();
    if (!codigo) return;
    const descricao = window.prompt('Descrição:', '')?.trim() || '';
    const { error } = await (supabase as any).from('especialidades_destino').insert({ nome, codigo, descricao, ativo: true, clinica_id: profile.clinica_id });
    if (error) return toast.error('Erro ao criar especialidade', { description: error.message });
    await queryClient.invalidateQueries({ queryKey: ['especialidades'] });
    toast.success('Especialidade criada');
  };

  const editarEspecialidade = async (esp: Especialidade) => {
    if (especialidadesQuery.isLoading || especialidadesQuery.isError) return toast.error('Carregue as especialidades antes de editar.');
    if (!profile?.clinica_id || esp.clinica_id !== profile.clinica_id) return toast.info('As especialidades padrão são compartilhadas e não podem ser editadas.');
    const nome = window.prompt('Nome da especialidade:', esp.nome)?.trim();
    if (!nome) return;
    const descricao = window.prompt('Descrição:', esp.descricao)?.trim() ?? esp.descricao;
    const { data, error } = await (supabase as any).from('especialidades_destino').update({ nome, descricao })
      .eq('id', esp.id).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
    if (error) return toast.error('Erro ao editar', { description: error.message });
    if (!data) return toast.error('Especialidade não encontrada ou sem permissão para editar.');
    await queryClient.invalidateQueries({ queryKey: ['especialidades'] });
    toast.success('Especialidade atualizada');
  };

  const removerEspecialidade = async (esp: Especialidade) => {
    if (especialidadesQuery.isLoading || especialidadesQuery.isError) return toast.error('Carregue as especialidades antes de excluir.');
    if (!profile?.clinica_id || esp.clinica_id !== profile.clinica_id) return toast.info('As especialidades padrão são compartilhadas e não podem ser excluídas.');
    if (!window.confirm(`Excluir a especialidade "${esp.nome}"?`)) return;
    const { data, error } = await (supabase as any).from('especialidades_destino').delete()
      .eq('id', esp.id).eq('clinica_id', profile.clinica_id).select('id');
    if (error) return toast.error('Não foi possível excluir', { description: error.message });
    if (!data?.length) return toast.error('Especialidade não encontrada ou sem permissão para excluir.');
    await queryClient.invalidateQueries({ queryKey: ['especialidades'] });
    toast.success('Especialidade excluída');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5" />Especialidades</CardTitle>
            <CardDescription>Gerenciar especialidades disponíveis</CardDescription>
          </div>
          <Button onClick={() => void criarEspecialidade()} disabled={!profile?.clinica_id || especialidadesQuery.isLoading || especialidadesQuery.isError} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Especialidade
          </Button>
        </CardHeader>
        <CardContent>
          {especialidadesQuery.isError ? <ErrorState compact title="Não foi possível carregar as especialidades" error={especialidadesQuery.error} onRetry={() => void especialidadesQuery.refetch()} /> : especialidadesQuery.isLoading ? <div className="py-8 text-center text-sm text-muted-foreground">Carregando especialidades…</div> : especialidades.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma especialidade cadastrada.</div> : <div className="space-y-3">
            {especialidades.map(esp => (
              <div key={esp.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h3 className="font-semibold">{esp.nome}</h3>
                  <p className="text-sm text-muted-foreground">{esp.descricao}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={esp.ativo ? 'default' : 'secondary'}>
                    {esp.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  {esp.clinica_id === profile?.clinica_id && <>
                    <Button size="sm" variant="outline" aria-label={`Editar ${esp.nome}`} onClick={() => void editarEspecialidade(esp)}><Edit className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" className="text-red-600" aria-label={`Excluir ${esp.nome}`} onClick={() => void removerEspecialidade(esp)}><Trash2 className="h-3 w-3" /></Button>
                  </>}
                </div>
              </div>
            ))}
          </div>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── 4. DOCUMENTOS & TEMPLATES ─── */
export function DocumentosTemplatesTab() {
  const navigate = useNavigate();

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Templates de Documentos</CardTitle>
            <CardDescription>Prontuários, prescrições, atestados</CardDescription>
          </div>
          <Button onClick={() => navigate('/todos-templates')} size="sm">
            <FileText className="h-4 w-4 mr-2" />
            Abrir gerenciador
          </Button>
        </CardHeader>
        <CardContent><Alert><FileText className="h-4 w-4" /><AlertDescription>Os templates reais de prontuário, prescrição, atestado e e-mail ficam no gerenciador unificado. Alterações feitas lá são persistidas e usadas nos documentos clínicos.</AlertDescription></Alert></CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── 5. LGPD & PRIVACIDADE AVANÇADA ─── */
export function LGPDAvancadoTab() {
  const { profile } = useSupabaseAuth();
  const [showRequests, setShowRequests] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const configClinicScope = useRef(profile?.clinica_id ?? null);
  const [configLGPD, setConfigLGPD] = useState({
    consentimentoObrigatorio: true,
    politicaPrivacidadeUrl: '',
    termosDealUrl: '',
    diasRetencaoDados: 2555, // 7 anos
    criptografiaSenhas: true,
    auditoriCompleta: true,
    exportarEmFormato: 'json',
    notificarDeletacao: true,
    backupAutomatico: true,
    dpoEmail: '',
  });

  const configQuery = useQuery({
    queryKey: ['lgpd-config', profile?.id ?? null, profile?.clinica_id ?? null],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('automation_settings').select('id,valor,updated_at').eq('clinica_id', profile?.clinica_id ?? '').eq('chave', 'lgpd_config').maybeSingle();
      if (error) throw error; return data;
    },
  });

  const requestsQuery = useQuery({
    queryKey: ['lgpd-access-requests', profile?.id ?? null, profile?.clinica_id ?? null],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('lgpd_access_request_log').select('id,request_type,status,requested_at,pacientes(nome)').eq('clinica_id', profile?.clinica_id ?? '').eq('status','pending').order('requested_at',{ascending:true});
      if (error) throw error; return data ?? [];
    },
  });
  const savedConfig = configQuery.data;
  const requests = requestsQuery.data ?? [];
  useEffect(() => {
    const nextClinicId = profile?.clinica_id ?? null;
    if (configClinicScope.current === nextClinicId) return;
    configClinicScope.current = nextClinicId;
    setConfigLGPD({
      consentimentoObrigatorio: true,
      politicaPrivacidadeUrl: '',
      termosDealUrl: '',
      diasRetencaoDados: 2555,
      criptografiaSenhas: true,
      auditoriCompleta: true,
      exportarEmFormato: 'json',
      notificarDeletacao: true,
      backupAutomatico: true,
      dpoEmail: '',
    });
  }, [profile?.clinica_id]);
  useEffect(() => {
    if (savedConfig?.valor && typeof savedConfig.valor === 'object') setConfigLGPD(current => ({...current, ...(savedConfig.valor as typeof current)}));
  }, [savedConfig]);

  const saveLGPD = async () => {
    if (saveLock.current) return;
    if (!profile?.clinica_id) return toast.error('Clínica não identificada');
    if (configQuery.isLoading || configQuery.isError) return toast.error('Carregue a configuração atual antes de salvar.');
    if (!Number.isSafeInteger(configLGPD.diasRetencaoDados) || configLGPD.diasRetencaoDados < 1) {
      return toast.error('O prazo de retenção deve ser um número inteiro maior que zero.');
    }
    for (const [label, value] of [
      ['Política de Privacidade', configLGPD.politicaPrivacidadeUrl],
      ['Termos de Uso', configLGPD.termosDealUrl],
    ] as const) {
      if (!value.trim()) continue;
      try {
        const url = new URL(value.trim());
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        return toast.error(`Informe uma URL válida para ${label}.`);
      }
    }
    if (configLGPD.dpoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configLGPD.dpoEmail.trim())) {
      return toast.error('Informe um e-mail válido para o contato do DPO.');
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const valor = {
        ...configLGPD,
        politicaPrivacidadeUrl: configLGPD.politicaPrivacidadeUrl.trim(),
        termosDealUrl: configLGPD.termosDealUrl.trim(),
        dpoEmail: configLGPD.dpoEmail.trim(),
      };
      const payload = { chave:'lgpd_config', valor, descricao:'Informações de privacidade registradas pela clínica', ativo:true, clinica_id:profile.clinica_id };
      if (savedConfig?.id) {
        const { data, error } = await supabase.from('automation_settings').update(payload)
          .eq('id',savedConfig.id).eq('clinica_id',profile.clinica_id).eq('updated_at', savedConfig.updated_at).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Outra pessoa atualizou estas informações. Atualize a página e confira os dados antes de salvar novamente.');
      } else {
        const { error } = await supabase.from('automation_settings').insert(payload);
        if (error?.code === '23505') throw new Error('Outra pessoa criou estas informações enquanto você editava. Atualize a página antes de salvar novamente.');
        if (error) throw error;
      }
      const resultadoAtualizacao = await configQuery.refetch();
      if (resultadoAtualizacao.error) {
        toast.warning('Informações salvas, mas não foi possível atualizar a tela.', { description: 'Atualize as informações antes de fazer outra alteração.' });
      } else {
        toast.success('Informações salvas');
      }
    } catch (error) {
      toast.error('Erro ao salvar informações', { description: mensagemDeErro(error) });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const exportReport = () => {
    if (configQuery.isLoading || configQuery.isError || requestsQuery.isLoading || requestsQuery.isError) {
      return toast.error('Carregue as informações antes de gerar o resumo.');
    }
    const report = { gerado_em:new Date().toISOString(), configuracao:configLGPD, requisicoes_pendentes:requests.length };
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download=`resumo-configuracoes-privacidade-${format(new Date(),'yyyy-MM-dd')}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Resumo JSON gerado');
  };

  if (!profile?.clinica_id) return <ErrorState title="Clínica não identificada" description="As configurações de privacidade e solicitações precisam de uma clínica vinculada." />;
  if (configQuery.isLoading || requestsQuery.isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">Carregando configurações e solicitações…</div>;
  if (configQuery.isError || requestsQuery.isError) {
    const query = configQuery.isError ? configQuery : requestsQuery;
    return <ErrorState title="Não foi possível carregar os dados de privacidade" error={query.error} onRetry={() => { void configQuery.refetch(); void requestsQuery.refetch(); }} />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Alert className="border-blue-200 bg-blue-50">
        <Shield className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-sm text-blue-800">
          Esta tela registra informações da clínica e lista solicitações pendentes. Salvar aqui não ativa automaticamente consentimento, retenção, backup, criptografia ou auditoria.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />Política & Consentimento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Switch checked={configLGPD.consentimentoObrigatorio} disabled={saving} onCheckedChange={v => setConfigLGPD({ ...configLGPD, consentimentoObrigatorio: v })} />
              Consentimento Obrigatório
            </Label>
            <p className="text-xs text-muted-foreground ml-6">Preferência registrada; ainda não altera o cadastro de pacientes.</p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>URL da Política de Privacidade</Label>
            <Input
              type="url"
              disabled={saving}
              value={configLGPD.politicaPrivacidadeUrl}
              onChange={e => setConfigLGPD({ ...configLGPD, politicaPrivacidadeUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label>URL dos Termos de Uso</Label>
            <Input
              type="url"
              disabled={saving}
              value={configLGPD.termosDealUrl}
              onChange={e => setConfigLGPD({ ...configLGPD, termosDealUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label>Email do DPO (Data Protection Officer)</Label>
            <Input
              type="email"
              disabled={saving}
              value={configLGPD.dpoEmail}
              onChange={e => setConfigLGPD({ ...configLGPD, dpoEmail: e.target.value })}
              placeholder="dpo@clinica.com"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Prazo e preferências registradas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Prazo de retenção desejado (dias)</Label>
            <Input
              type="number"
              min="1"
              step="1"
              disabled={saving}
              value={configLGPD.diasRetencaoDados}
              onChange={e => setConfigLGPD({ ...configLGPD, diasRetencaoDados: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Este campo registra a política da clínica; não exclui dados automaticamente.</p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Switch checked={configLGPD.backupAutomatico} disabled={saving} onCheckedChange={v => setConfigLGPD({ ...configLGPD, backupAutomatico: v })} />
              Backup Automático Diário
            </Label>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Switch checked={configLGPD.criptografiaSenhas} disabled={saving} onCheckedChange={v => setConfigLGPD({ ...configLGPD, criptografiaSenhas: v })} />
              Criptografia de Senhas (bcrypt)
            </Label>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Switch checked={configLGPD.auditoriCompleta} disabled={saving} onCheckedChange={v => setConfigLGPD({ ...configLGPD, auditoriCompleta: v })} />
              Auditoria Completa de Acessos
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">Esses interruptores registram preferências da clínica; não ativam backup, criptografia ou auditoria no sistema.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />Direitos do Titular</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-yellow-50 border-yellow-200">
            <AlertDescription className="text-sm">
              Este resumo não inclui prontuários e não exporta automaticamente os dados de pacientes.
            </AlertDescription>
          </Alert>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-2">
              <CardContent className="pt-6">
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Resumo exportado por esta tela
                </h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>JSON com as informações registradas</li>
                  <li>Quantidade de solicitações pendentes</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardContent className="pt-6">
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  Solicitações pendentes
                </h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Lista os pedidos recebidos pela clínica</li>
                  <li>O atendimento e a conclusão são acompanhados no fluxo próprio</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={exportReport}>
              <Download className="h-4 w-4 mr-2" />
              Gerar Relatório LGPD
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowRequests(v=>!v)}>
              <FileText className="h-4 w-4 mr-2" />
              Requisições Pendentes ({requests.length})
            </Button>
          </div>
          {showRequests && <div className="space-y-2">{requests.length===0 ? <p className="text-sm text-muted-foreground">Nenhuma requisição pendente.</p> : requests.map((request:any)=><div key={request.id} className="flex justify-between rounded border p-3 text-sm"><span>{request.pacientes?.nome || 'Paciente'} — {request.request_type}</span><span>{formatarDataHoraSaoPaulo(request.requested_at).split(' ')[0]}</span></div>)}</div>}
        </CardContent>
      </Card>

      <Button className="w-full" onClick={saveLGPD} disabled={saving}>
        <Save className="h-4 w-4 mr-2" />
        {saving ? 'Salvando...' : 'Salvar Configurações LGPD'}
      </Button>
    </motion.div>
  );
}

/* ─── Main Component ─── */
// O controle de acesso fica na rota (SupabaseProtectedRoute allowedRoles=['admin']),
// como em todas as outras páginas — antes esta era a única a usar um guard próprio.
export default function ConfiguracoesAvancadas() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações Avançadas</h1>
        <p className="text-muted-foreground mt-2">Gerenciamento completo dos serviços e conformidade</p>
      </div>

      <Tabs defaultValue="status" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto">
          <TabsTrigger value="status" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Status</span>
          </TabsTrigger>
          <TabsTrigger value="integracoes" className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            <span className="hidden sm:inline">APIs</span>
          </TabsTrigger>
          <TabsTrigger value="especialidades" className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            <span className="hidden sm:inline">Espec.</span>
          </TabsTrigger>
          <TabsTrigger value="documentos" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Docs</span>
          </TabsTrigger>
          <TabsTrigger value="lgpd" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">LGPD</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status"><HealthCheckTab /></TabsContent>
        <TabsContent value="integracoes"><IntegracoesTab /></TabsContent>
        <TabsContent value="especialidades"><EspecialidadesTab /></TabsContent>
        <TabsContent value="documentos"><DocumentosTemplatesTab /></TabsContent>
        <TabsContent value="lgpd"><LGPDAvancadoTab /></TabsContent>
      </Tabs>
    </div>
  );
}
