import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, KeyRound, Loader2, PlugZap, Unplug, CircleCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMedicos } from '@/hooks/useSupabaseData';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { formatDateInTimeZone } from '@/lib/datePreference';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';

interface Campo {
  id: string; rotulo: string; tipo: 'texto' | 'segredo' | 'selecao'; publico?: boolean; obrigatorio?: boolean;
  opcoes?: Array<{ valor: string; rotulo: string }>; ajuda?: string;
}
interface Integracao { id: string; nome: string; descricao: string; escopo: 'clinica' | 'profissional'; campos: Campo[]; documentacao?: string; somenteStatus?: boolean }
interface Conexao {
  provedor: string; referencia_id: string | null; status: 'conectado' | 'erro' | 'desconectado';
  config: Record<string, string>; ultimo_erro: string | null; ultimo_teste_em: string | null; conectado_em: string; updated_at: string;
}

async function chamar<T>(body: Record<string, unknown>, funcao = 'clinic-integrations'): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funcao, { body });
  if (error) {
    let msg = 'Não foi possível concluir agora.';
    try { msg = (await (error as any)?.context?.json())?.error || msg; } catch { /* corpo não-JSON */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const STATUS: Record<Conexao['status'], { rotulo: string; variante: 'outline' | 'destructive' | 'secondary' }> = {
  conectado: { rotulo: 'Conectada', variante: 'outline' },
  erro: { rotulo: 'Com erro', variante: 'destructive' },
  desconectado: { rotulo: 'Desconectado', variante: 'secondary' },
};

const formatarDataConexao = (valor: string | null | undefined) => {
  if (!valor) return 'data indisponível';
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? 'data indisponível'
    : formatDateInTimeZone(data);
};

const formatarDataHoraConexao = (valor: string) => {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 'data indisponível' : new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(data);
};

/**
 * Integrações que a clínica conecta com a própria conta. O catálogo vem do
 * servidor; os segredos são enviados uma vez e nunca voltam (só a dica ••••1234).
 */
export function IntegracoesClinica() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { integrationId } = useParams<{ integrationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useSupabaseAuth();
  const medicosQuery = useMedicos();
  const medicos = medicosQuery.data ?? [];
  const integrationPage = location.pathname.startsWith('/configuracoes/integracoes/conectar/');
  const routeState = location.state as { referenciaId?: string | null; versaoEsperada?: string | null } | null;
  const referenciaIdDaRota = routeState?.referenciaId ?? null;
  const query = useQuery({
    queryKey: ['integracoes-clinica', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: () => chamar<{ catalogo: Integracao[]; conexoes: Conexao[] }>({ action: 'list' }),
    enabled: !!user && !!profile?.clinica_id,
    refetchInterval: 60_000,
    refetchOnMount: 'always',
  });
  const [valores, setValores] = useState<Record<string, string>>({});
  const [versaoEsperada, setVersaoEsperada] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState<string | null>(null);
  const completed = useRef(false);
  const initializedTarget = useRef<string | null>(null);

  useEffect(() => {
    const retornoOAuth = searchParams.get('mercado_pago');
    if (!retornoOAuth) return;
    if (retornoOAuth === 'conectado') {
      toast.success('Conta Mercado Pago conectada');
      void queryClient.invalidateQueries({ queryKey: ['integracoes-clinica'] });
    } else if (retornoOAuth === 'cancelado') {
      toast.info('Conexão cancelada. Você pode continuar usando o EloLab normalmente.');
    } else {
      toast.error('Não foi possível conectar a conta Mercado Pago. Tente novamente.');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('mercado_pago');
    setSearchParams(next, { replace: true });
  }, [queryClient, searchParams, setSearchParams]);

  const conexao = (provedor: string, ref: string | null) =>
    query.data?.conexoes.find((c) => c.provedor === provedor && (c.referencia_id ?? null) === ref);

  const catalogo = query.data?.catalogo ?? [];
  const integracaoSelecionada = integrationPage ? catalogo.find((item) => item.id === integrationId) ?? null : null;
  const referenciaSelecionada = integracaoSelecionada?.escopo === 'clinica' ? null : referenciaIdDaRota;
  const conexaoSelecionada = integracaoSelecionada ? conexao(integracaoSelecionada.id, referenciaSelecionada) : undefined;
  const referenciaObrigatoria = integracaoSelecionada?.escopo === 'profissional' && !referenciaSelecionada;

  useEffect(() => {
    if (!integrationPage) {
      initializedTarget.current = null;
      setValores({});
      setVersaoEsperada(null);
      setDirty(false);
      return;
    }
    if (!integracaoSelecionada || query.isLoading) return;
    const target = `${integracaoSelecionada.id}:${referenciaSelecionada ?? 'clinica'}`;
    if (initializedTarget.current === target) return;
    initializedTarget.current = target;
    setValores({ ...(conexaoSelecionada?.config ?? {}) });
    const versaoDaOrigem = routeState && Object.prototype.hasOwnProperty.call(routeState, 'versaoEsperada')
      ? routeState.versaoEsperada ?? null
      : conexaoSelecionada?.updated_at ?? null;
    setVersaoEsperada(versaoDaOrigem);
    setDirty(false);
    completed.current = false;
  }, [integrationPage, integracaoSelecionada, referenciaSelecionada, query.isLoading, conexaoSelecionada?.config, conexaoSelecionada?.updated_at, routeState]);

  const abrir = (integracao: Integracao, referencia_id: string | null) => {
    const atual = conexao(integracao.id, referencia_id);
    setValores({ ...(atual?.config ?? {}) });
    setVersaoEsperada(atual?.updated_at ?? null);
    setDirty(false);
    completed.current = false;
    navigate(`/configuracoes/integracoes/conectar/${encodeURIComponent(integracao.id)}`, {
      state: { referenciaId: referencia_id, versaoEsperada: atual?.updated_at ?? null },
    });
  };

  const conectar = async () => {
    if (!integracaoSelecionada || referenciaObrigatoria) return;
    setSalvando(true);
    try {
      await chamar({ action: 'connect', provedor: integracaoSelecionada.id, referencia_id: referenciaSelecionada, versao_esperada: versaoEsperada, valores });
      toast.success(`Credencial salva para ${integracaoSelecionada.nome}`);
      completed.current = true;
      setValores({});
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['integracoes-clinica'] });
      navigate('/configuracoes?tab=integracoes');
    } catch (e: any) {
      toast.error('Não foi possível conectar', { description: e.message });
    } finally {
      setSalvando(false);
    }
  };

  const voltarParaIntegracoes = () => navigate('/configuracoes?tab=integracoes');

  const conectarMercadoPago = async () => {
    setSalvando(true);
    try {
      const result = await chamar<{ authorization_url: string }>({ action: 'start' }, 'mercadopago-oauth');
      const authorizationUrl = new URL(result.authorization_url);
      if (authorizationUrl.protocol !== 'https:' || !['auth.mercadopago.com', 'auth.mercadopago.com.br'].includes(authorizationUrl.hostname)) {
        throw new Error('O endereço de autorização retornado não é válido.');
      }
      window.location.assign(authorizationUrl.toString());
    } catch (e: any) {
      toast.error('Não foi possível iniciar a conexão', { description: e.message });
      setSalvando(false);
    }
  };

  const testarConexao = async (integracao: Integracao) => {
    setTestando(integracao.id);
    try {
      const result = await chamar<{ healthy: boolean; code?: string }>({ action: 'test', provedor: integracao.id });
      if (result.healthy) {
        toast.success('Conexão validada', { description: 'O Mercado Pago respondeu e a conta vinculada confere.' });
      } else {
        const orientacoes: Record<string, string> = {
          not_connected: 'Conecte a conta Mercado Pago e tente novamente.',
          credential_expired: 'A autorização expirou. Reconecte a conta Mercado Pago para renovar o acesso.',
          credential_rejected: 'A autorização pode ter expirado ou sido revogada. Reconecte a conta Mercado Pago.',
          identity_mismatch: 'A conta vinculada não corresponde à conexão salva. Reconecte a conta correta.',
          provider_unavailable: 'O Mercado Pago não respondeu agora. Confira a disponibilidade e tente novamente em instantes.',
        };
        toast.error('Não foi possível validar a conexão', { description: orientacoes[result.code ?? ''] ?? 'Revise a conexão ou contate o suporte.' });
      }
      await queryClient.invalidateQueries({ queryKey: ['integracoes-clinica'] });
    } catch (e: any) {
      toast.error('Não foi possível testar a conexão', { description: e.message || 'Revise a conexão ou contate o suporte.' });
    } finally {
      setTestando(null);
    }
  };

  const desconectar = async (integracao: Integracao, referencia_id: string | null) => {
    const detalhe = integracao.id === 'mercado_pago'
      ? 'O EloLab apagará a autorização salva. Para revogar também o acesso da aplicação, faça isso nas configurações da sua conta Mercado Pago.'
      : 'A credencial salva será apagada.';
    if (!window.confirm(`Desconectar ${integracao.nome}? ${detalhe}`)) return;
    try {
      await chamar({ action: 'disconnect', provedor: integracao.id, referencia_id });
      toast.success(`${integracao.nome} desconectado`);
      queryClient.invalidateQueries({ queryKey: ['integracoes-clinica'] });
    } catch (e: any) {
      toast.error('Não foi possível desconectar', { description: e.message });
    }
  };

  if (query.isLoading) {
    return integrationPage ? (
      <main className="mx-auto w-full max-w-3xl space-y-5 pb-28">
        <PageHeader title="Conectar integração" icon={<PlugZap />} description="Carregando os dados atuais da integração." actions={<Button variant="outline" className="min-h-11 rounded-full" onClick={voltarParaIntegracoes}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às integrações</Button>} />
        <Skeleton className="h-80 rounded-2xl" />
      </main>
    ) : <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (query.isError) {
    return integrationPage ? (
      <main className="mx-auto w-full max-w-3xl space-y-5 pb-28">
        <PageHeader title="Conectar integração" icon={<PlugZap />} description="Não foi possível confirmar o catálogo e a conexão atual." actions={<Button variant="outline" className="min-h-11 rounded-full" onClick={voltarParaIntegracoes}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às integrações</Button>} />
        <ErrorState title="Não foi possível carregar as integrações" error={query.error} onRetry={() => void query.refetch()} />
      </main>
    ) : <ErrorState title="Não foi possível carregar as integrações" error={query.error} onRetry={() => void query.refetch()} />;
  }

  const camposObrigatoriosPreenchidos = Boolean(integracaoSelecionada) && (integracaoSelecionada?.campos.every((campo) => (
    !campo.obrigatorio || Boolean(valores[campo.id]?.trim())
  )) ?? false);

  const linha = (integracao: Integracao, referencia_id: string | null, titulo?: string) => {
    const c = conexao(integracao.id, referencia_id);
    const ativa = c && c.status !== 'desconectado';
    if (integracao.somenteStatus) {
      return (
        <div key={`${integracao.id}:${referencia_id ?? 'clinica'}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{titulo ?? integracao.nome}</p>
            <p className="text-xs text-muted-foreground">
              {ativa ? <>Prescritor registrado · desde {formatarDataConexao(c.conectado_em)}</> : 'Ainda sem prescrição feita por este médico'}
            </p>
            {c?.status === 'erro' && c.ultimo_erro && <p className="mt-1 text-xs text-destructive">Falha ao comunicar com o provedor. Confira a conexão ou contate o suporte.</p>}
          </div>
          {c && <Badge variant={STATUS[c.status].variante}>{STATUS[c.status].rotulo === 'Credencial salva' ? 'Registrado' : STATUS[c.status].rotulo}</Badge>}
        </div>
      );
    }
    return (
      <div key={`${integracao.id}:${referencia_id ?? 'clinica'}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{titulo ?? integracao.nome}</p>
          <p className="text-xs text-muted-foreground">
          {ativa ? <>{integracao.id === 'mercado_pago' && c.config.nickname ? `Conta ${c.config.nickname} · ` : ''}{integracao.id === 'mercado_pago' ? 'conectada' : 'credencial salva'} · desde {formatarDataConexao(c.conectado_em)}</> : 'Opcional · não conectado'}
          </p>
          {ativa && (
            <p className="mt-1 text-xs text-muted-foreground" role="status">
              {c.ultimo_teste_em
                ? <time dateTime={c.ultimo_teste_em}>{c.status === 'erro' ? 'Última tentativa de sincronização' : 'Última sincronização'}: {formatarDataHoraConexao(c.ultimo_teste_em)}</time>
                : 'Nenhuma sincronização registrada'}
            </p>
          )}
          {c?.status === 'erro' && <p className="mt-1 text-xs text-destructive" role="alert">Falha na última comunicação. Revise a conexão ou contate o suporte.</p>}
        </div>
        <div className="flex items-center gap-2">
          {c && <Badge variant={STATUS[c.status].variante}>{integracao.id === 'mercado_pago' && c.status === 'conectado' ? 'Conta conectada' : STATUS[c.status].rotulo}</Badge>}
          {integracao.id === 'mercado_pago' && ativa && (
            <Button size="sm" variant="outline" disabled={testando !== null || salvando} aria-label={`Testar conexão ${integracao.nome}`} onClick={() => void testarConexao(integracao)}>
              {testando === integracao.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CircleCheck className="mr-1.5 h-3.5 w-3.5" />}
              Testar conexão
            </Button>
          )}
          <Button size="sm" variant={ativa ? 'outline' : 'default'} disabled={salvando}
            onClick={() => integracao.id === 'mercado_pago' ? void conectarMercadoPago() : abrir(integracao, referencia_id)}>
            {integracao.id === 'mercado_pago' ? <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> : <KeyRound className="mr-1.5 h-3.5 w-3.5" />}
            {integracao.id === 'mercado_pago' ? (ativa ? 'Trocar conta' : 'Conectar Mercado Pago') : (ativa ? 'Trocar credencial' : 'Conectar')}
          </Button>
          {ativa && (
            <Button size="sm" variant="ghost" onClick={() => desconectar(integracao, referencia_id)} aria-label={`Desconectar ${integracao.nome}`}>
              <Unplug className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (integrationPage) {
    if (!integracaoSelecionada) {
      return (
        <main className="mx-auto w-full max-w-3xl space-y-5 pb-28">
          <PageHeader title="Integração indisponível" icon={<PlugZap />} description="O provedor não está disponível no catálogo atual da clínica." actions={<Button variant="outline" className="min-h-11 rounded-full" onClick={voltarParaIntegracoes}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às integrações</Button>} />
          <Alert variant="destructive"><AlertTitle>Não foi possível abrir esta integração</AlertTitle><AlertDescription>Volte ao catálogo e escolha um provedor que esteja liberado para sua clínica.</AlertDescription></Alert>
        </main>
      );
    }
    if (referenciaObrigatoria) {
      return (
        <main className="mx-auto w-full max-w-3xl space-y-5 pb-28">
          <PageHeader title={`Conectar ${integracaoSelecionada.nome}`} icon={<PlugZap />} description="Esta integração precisa ser iniciada a partir de um profissional da lista." actions={<Button variant="outline" className="min-h-11 rounded-full" onClick={voltarParaIntegracoes}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às integrações</Button>} />
          <Alert><AlertTitle>Profissional não selecionado</AlertTitle><AlertDescription>O destino não foi preservado nesta navegação. Volte à lista e escolha o profissional novamente; nenhum dado será enviado.</AlertDescription></Alert>
        </main>
      );
    }

    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 pb-28">
        <UnsavedChangesGuard dirty={dirty} busy={salvando} completed={completed} onDiscard={() => { setValores({}); setDirty(false); }} />
        <PageHeader
          title={`Conectar ${integracaoSelecionada.nome}`}
          icon={<PlugZap />}
          description={integracaoSelecionada.escopo === 'clinica' ? 'Credenciais da conta da clínica.' : `Credenciais para ${medicos.find((medico) => medico.id === referenciaSelecionada)?.nome ?? 'profissional selecionado'}.`}
          actions={<Button variant="outline" className="min-h-11 rounded-full" onClick={voltarParaIntegracoes} disabled={salvando}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às integrações</Button>}
        />

        <Alert>
          <KeyRound className="h-4 w-4" />
          <AlertTitle>Credenciais protegidas</AlertTitle>
          <AlertDescription>Os dados serão enviados ao servidor e guardados cifrados. Segredos já salvos nunca voltam preenchidos; informe-os novamente apenas para trocar a credencial. O rascunho desta página fica somente em memória.</AlertDescription>
        </Alert>

        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardHeader>
            <CardTitle>Dados de conexão</CardTitle>
            <CardDescription>{integracaoSelecionada.descricao}</CardDescription>
            {integracaoSelecionada.documentacao && <a href={integracaoSelecionada.documentacao} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1 text-sm text-primary hover:underline">Abrir documentação <ExternalLink className="h-3.5 w-3.5" /></a>}
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => { event.preventDefault(); void conectar(); }} className="space-y-5">
                {integracaoSelecionada.campos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Esta integração não requer campos manuais. Salve para concluir a conexão.</p>
                ) : (
                <div className="space-y-5">
                  {integracaoSelecionada.campos.map((campo) => (
                    <div key={campo.id} className="space-y-2">
                      <Label htmlFor={`int-${campo.id}`}>{campo.rotulo}{campo.obrigatorio && ' *'}</Label>
                      {campo.tipo === 'selecao' ? (
                        <Select value={valores[campo.id] ?? ''} onValueChange={(value) => { setValores((current) => ({ ...current, [campo.id]: value })); setDirty(true); }}>
                          <SelectTrigger id={`int-${campo.id}`}><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{campo.opcoes?.map((opcao) => <SelectItem key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`int-${campo.id}`}
                          type={campo.tipo === 'segredo' ? 'password' : 'text'}
                          autoComplete="off"
                          required={campo.obrigatorio}
                          value={valores[campo.id] ?? ''}
                          onChange={(event) => { setValores((current) => ({ ...current, [campo.id]: event.target.value })); setDirty(true); }}
                        />
                      )}
                      {campo.ajuda && <p className="text-sm text-muted-foreground">{campo.ajuda}</p>}
                    </div>
                  ))}
                </div>
                )}

                <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={voltarParaIntegracoes} disabled={salvando}>Cancelar</Button>
                  <Button type="submit" className="min-h-11 rounded-full" disabled={salvando || !camposObrigatoriosPreenchidos} aria-busy={salvando}>
                    {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{salvando ? 'Salvando…' : 'Salvar credencial'}
                  </Button>
                </div>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><PlugZap className="h-4 w-4 text-primary" />Integrações da clínica</CardTitle>
          <CardDescription>
            Serviços que a clínica conecta com a própria conta. As credenciais são guardadas cifradas no servidor e nunca
            são exibidas de novo — só os últimos caracteres, para você reconhecer qual está salva.
            {' '}Conectar o Mercado Pago é opcional; sem a conexão, o financeiro e os resumos internos do EloLab continuam disponíveis.
          </CardDescription>
        </CardHeader>
        {catalogo.length === 0 && (
          <CardContent>
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma integração disponível ainda. Elas aparecem aqui conforme forem liberadas.
            </p>
          </CardContent>
        )}
      </Card>

      {catalogo.map((integracao) => (
        <Card key={integracao.id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              {integracao.nome}
              {integracao.documentacao && (
                <a href={integracao.documentacao} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-normal text-primary hover:underline">
                  Documentação <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardTitle>
            <CardDescription>{integracao.descricao}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {integracao.escopo === 'clinica'
              ? linha(integracao, null)
              : medicosQuery.isError
                ? <ErrorState compact title="Não foi possível carregar os profissionais" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />
                : medicosQuery.isLoading
                  ? <p className="py-3 text-sm text-muted-foreground" role="status">Carregando profissionais…</p>
                  : (medicos as any[]).filter((m) => m.ativo).length === 0
                    ? <p className="py-3 text-sm text-muted-foreground">Cadastre ou ative um profissional para conectar esta integração.</p>
                    : (medicos as any[]).filter((m) => m.ativo).map((m) => linha(integracao, m.id, m.nome))}
          </CardContent>
        </Card>
      ))}

    </div>
  );
}
