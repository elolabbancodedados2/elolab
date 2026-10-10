import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, History, Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

type AIConfig = {
  id: boolean;
  ativo: boolean;
  modelo_principal: string;
  modelo_fallback: string | null;
  temperatura: number;
  max_tokens: number;
  limite_mensal_clinica: number;
  prompt_base: string;
  versao: number;
  updated_at: string;
};

type ConfigDraft = Omit<AIConfig, 'temperatura' | 'max_tokens' | 'limite_mensal_clinica'> & {
  temperatura: string;
  max_tokens: string;
  limite_mensal_clinica: string;
  baseVersion: number;
};

type UsageSummary = {
  period_start: string;
  requests: number;
  failed_requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
};

type PromptVersion = { id: string; versao: number; prompt: string; modelo: string; criado_por: string | null; created_at: string };

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Data indisponível';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

function toDraft(config: AIConfig): ConfigDraft {
  return {
    ...config,
    temperatura: String(config.temperatura),
    max_tokens: String(config.max_tokens),
    limite_mensal_clinica: String(config.limite_mensal_clinica),
    baseVersion: config.versao,
  };
}

export default function PlatformIA() {
  const queryClient = useQueryClient();
  const publishLock = useRef(false);
  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [versionConflict, setVersionConflict] = useState<AIConfig | null>(null);

  const config = useQuery({
    queryKey: ['platform-ai-config'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('platform_ai_config').select('*').eq('id', true).single();
      if (error) throw error;
      return data as AIConfig;
    },
    staleTime: 30_000,
  });

  const usage = useQuery({
    queryKey: ['platform-ai-usage-summary'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_ai_usage_summary');
      if (error) throw error;
      return data as UsageSummary;
    },
    refetchInterval: 60_000,
  });

  const versions = useQuery({
    queryKey: ['platform-ai-prompt-versions'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('platform_ai_prompt_versions')
        .select('id,versao,prompt,modelo,criado_por,created_at')
        .order('versao', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as PromptVersion[];
    },
  });

  useEffect(() => {
    if (config.data) setDraft((current) => current || toDraft(config.data));
  }, [config.data]);

  const numeric = draft ? {
    temperatura: Number(draft.temperatura),
    max_tokens: Number(draft.max_tokens),
    limite_mensal_clinica: Number(draft.limite_mensal_clinica),
  } : null;
  const modelPattern = /^[A-Za-z0-9._-]{2,100}$/;
  const valid = !!draft && !!numeric &&
    modelPattern.test(draft.modelo_principal.trim()) &&
    (!draft.modelo_fallback?.trim() || (modelPattern.test(draft.modelo_fallback.trim()) && draft.modelo_fallback.trim() !== draft.modelo_principal.trim())) &&
    draft.prompt_base.trim().length >= 20 && draft.prompt_base.length <= 20_000 &&
    draft.temperatura.trim() !== '' && Number.isFinite(numeric.temperatura) && numeric.temperatura >= 0 && numeric.temperatura <= 2 &&
    Number.isInteger(numeric.max_tokens) && numeric.max_tokens >= 100 && numeric.max_tokens <= 16_000 &&
    Number.isSafeInteger(numeric.limite_mensal_clinica) && numeric.limite_mensal_clinica >= 1 && numeric.limite_mensal_clinica <= 2_147_483_647;

  const publish = useMutation({
    mutationFn: async () => {
      if (!draft || !numeric || !valid) throw new Error('Confira os campos antes de publicar.');
      const { data, error } = await (supabase as any).rpc('platform_publish_ai_config', {
        p_expected_version: draft.baseVersion,
        p_ativo: draft.ativo,
        p_modelo_principal: draft.modelo_principal.trim(),
        p_modelo_fallback: draft.modelo_fallback?.trim() || null,
        p_temperatura: numeric.temperatura,
        p_max_tokens: numeric.max_tokens,
        p_limite_mensal_clinica: numeric.limite_mensal_clinica,
        p_prompt_base: draft.prompt_base.trim(),
      });
      if (error) throw error;
      if (!data) throw new Error('O servidor não retornou a configuração publicada.');
      return data as AIConfig;
    },
    onSuccess: (saved) => {
      setDraft(toDraft(saved));
      queryClient.setQueryData(['platform-ai-config'], saved);
      void queryClient.invalidateQueries({ queryKey: ['platform-ai-prompt-versions'] });
      toast.success(`Configuração publicada como versão ${saved.versao}.`);
    },
    onError: async (error) => {
      if (error instanceof Error && /mudou desde que a página foi aberta/i.test(error.message)) {
        const refreshed = await config.refetch();
        if (refreshed.data) {
          setVersionConflict(refreshed.data);
          return;
        }
      }
      toast.error('Não foi possível publicar a configuração.', { description: mensagemDeErro(error) });
    },
    onSettled: () => { publishLock.current = false; },
  });

  const summary = usage.data;
  const stats = useMemo(() => [
    { label: 'Requisições no mês', value: formatNumber(summary?.requests) },
    { label: 'Tokens no mês', value: formatNumber(summary?.total_tokens) },
    { label: 'Falhas no mês', value: formatNumber(summary?.failed_requests) },
    { label: 'Custo estimado registrado', value: `US$ ${Number(summary?.estimated_cost || 0).toFixed(4)}` },
  ], [summary]);

  const update = <K extends keyof ConfigDraft>(key: K, value: ConfigDraft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const handlePublish = () => {
    if (publishLock.current || !valid || config.isFetching) return;
    publishLock.current = true;
    publish.mutate();
  };

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Bot className="h-6 w-6 text-primary" /> Governança da IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">Modelos, limites, prompts versionados e consumo agregado da plataforma.</p>
        </div>
        <Button className="min-h-11" variant="outline" onClick={() => { void config.refetch(); void usage.refetch(); void versions.refetch(); }} disabled={publish.isPending || config.isFetching || usage.isFetching || versions.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${config.isFetching || usage.isFetching || versions.isFetching ? 'animate-spin' : ''}`} /> Atualizar dados
        </Button>
      </header>

      {usage.isError ? (
        <Card><CardContent className="py-5" role="alert">
          <p className="font-medium">Não foi possível carregar o resumo de consumo.</p>
          <p className="mt-1 text-sm text-muted-foreground">{mensagemDeErro(usage.error)}</p>
          <Button className="mt-3" variant="outline" onClick={() => void usage.refetch()}>Tentar novamente</Button>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {usage.isLoading ? [1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 w-full" />) : stats.map((stat) => (
            <Card key={stat.label}><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 break-words text-2xl font-bold tabular-nums">{stat.value}</p>
            </CardContent></Card>
          ))}
        </div>
      )}
      {summary?.period_start && <p className="-mt-4 text-xs text-muted-foreground">Período UTC desde {formatDate(summary.period_start)}. O custo é uma estimativa registrada pelo aplicativo, não uma fatura do provedor.</p>}

      {config.isLoading ? (
        <Skeleton className="h-[34rem] w-full" />
      ) : config.isError ? (
        <Card><CardContent className="py-6" role="alert">
          <p className="font-medium">Não foi possível carregar a configuração de IA.</p>
          <p className="mt-1 text-sm text-muted-foreground">{mensagemDeErro(config.error)}</p>
          <Button className="mt-3" variant="outline" onClick={() => void config.refetch()}>Tentar novamente</Button>
        </CardContent></Card>
      ) : draft && (
        <Card>
          {versionConflict && <div role="alert" className="m-6 mb-0 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="font-medium">Outra pessoa publicou uma versão enquanto você editava.</p>
            <p className="mt-1 text-sm text-muted-foreground">Seu rascunho continua nesta tela. Escolha carregar a versão {versionConflict.versao} ou revisar seu rascunho antes de reaplicá-lo.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setDraft(toDraft(versionConflict)); setVersionConflict(null); }}>Carregar versão {versionConflict.versao}</Button>
              <Button size="sm" onClick={() => { setDraft((current) => current ? { ...current, baseVersion: versionConflict.versao } : toDraft(versionConflict)); setVersionConflict(null); toast.warning('Rascunho mantido', { description: 'Revise os campos antes de publicar sobre a versão atual.' }); }}>Manter meu rascunho</Button>
            </div>
          </div>}
          <CardHeader>
            <CardTitle>Configuração ativa · versão {config.data?.versao}</CardTitle>
            <CardDescription>A publicação atualiza a configuração e grava a nova versão do prompt na mesma transação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <div>
                <Label htmlFor="ai-enabled">Assistente de IA habilitado</Label>
                <p className="mt-1 text-xs text-muted-foreground">Desativar bloqueia novas chamadas do assistente clínico.</p>
              </div>
              <Switch id="ai-enabled" checked={draft.ativo} disabled={publish.isPending} onCheckedChange={(value) => update('ativo', value)} aria-label="Habilitar assistente de IA" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ai-primary-model">Modelo principal</Label>
                <Input id="ai-primary-model" value={draft.modelo_principal} maxLength={100} disabled={publish.isPending} onChange={(event) => update('modelo_principal', event.target.value)} placeholder="gpt-4o-mini" />
                {draft.modelo_principal.trim() && !modelPattern.test(draft.modelo_principal.trim()) && <p role="alert" className="text-xs text-destructive">Use letras, números, ponto, hífen ou sublinhado.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-fallback-model">Modelo alternativo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="ai-fallback-model" value={draft.modelo_fallback || ''} maxLength={100} disabled={publish.isPending} onChange={(event) => update('modelo_fallback', event.target.value || null)} placeholder="Usado em falha temporária do principal" />
                <p className="text-xs text-muted-foreground">Ativado apenas se o principal falhar por rede, limite de requisições ou indisponibilidade.</p>
                {draft.modelo_fallback?.trim() && draft.modelo_fallback.trim() === draft.modelo_principal.trim() && <p role="alert" className="text-xs text-destructive">O modelo alternativo deve ser diferente do principal.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-temperature">Temperatura</Label>
                <Input id="ai-temperature" type="number" inputMode="decimal" min={0} max={2} step={0.01} value={draft.temperatura} disabled={publish.isPending} onChange={(event) => update('temperatura', event.target.value)} />
                <p className="text-xs text-muted-foreground">Entre 0 e 2. Valores menores reduzem a variação das respostas.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-max-tokens">Máximo de tokens por resposta</Label>
                <Input id="ai-max-tokens" type="number" inputMode="numeric" min={100} max={16_000} step={1} value={draft.max_tokens} disabled={publish.isPending} onChange={(event) => update('max_tokens', event.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ai-clinic-monthly-limit">Cota padrão mensal por clínica</Label>
                <Input id="ai-clinic-monthly-limit" type="number" inputMode="numeric" min={1} max={2_147_483_647} step={1} value={draft.limite_mensal_clinica} disabled={publish.isPending} onChange={(event) => update('limite_mensal_clinica', event.target.value)} />
                <p className="text-xs text-muted-foreground">Aplicada às clínicas sem cota individual. A cota individual definida em Limites e Consumo tem prioridade.</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ai-base-prompt">Prompt base de segurança</Label>
                <span className="text-xs text-muted-foreground">{draft.prompt_base.length.toLocaleString('pt-BR')} / 20.000</span>
              </div>
              <Textarea id="ai-base-prompt" rows={10} maxLength={20_000} value={draft.prompt_base} disabled={publish.isPending} onChange={(event) => update('prompt_base', event.target.value)} />
              <p className="text-xs text-muted-foreground">Este texto será aplicado junto das instruções específicas de cada operação clínica.</p>
            </div>

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>Publicações geram versões imutáveis e registram a ação na auditoria. Versão base: {draft.baseVersion}.</span></div>
              <Button className="min-h-11 shrink-0" onClick={handlePublish} disabled={!valid || publish.isPending || config.isFetching}>
                {publish.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Publicar versão
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Versões recentes do prompt</CardTitle>
          <CardDescription>Histórico somente de leitura. Versões publicadas não podem ser alteradas ou removidas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {versions.isLoading ? [1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />) : versions.isError ? (
            <div role="alert" className="rounded-lg border border-destructive/30 p-4">
              <p className="text-sm">Não foi possível carregar as versões.</p>
              <Button className="mt-2" size="sm" variant="outline" onClick={() => void versions.refetch()}>Tentar novamente</Button>
            </div>
          ) : versions.data?.length ? versions.data.map((version) => (
            <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">Versão {version.versao} · {version.modelo}</p>
                <p className="text-xs text-muted-foreground">Publicada em {formatDate(version.created_at)}</p>
              </div>
              <Button className="min-h-11" size="sm" variant="outline" onClick={() => setSelectedVersion(version)}>Ver prompt</Button>
            </div>
          )) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Ainda não há versões publicadas no histórico.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedVersion} onOpenChange={(open) => !open && setSelectedVersion(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prompt da versão {selectedVersion?.versao}</DialogTitle>
            <DialogDescription>{selectedVersion?.modelo} · {selectedVersion ? formatDate(selectedVersion.created_at) : ''}</DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm">{selectedVersion?.prompt}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
