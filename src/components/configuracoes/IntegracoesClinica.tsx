import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, KeyRound, Loader2, PlugZap, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMedicos } from '@/hooks/useSupabaseData';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

interface Campo {
  id: string; rotulo: string; tipo: 'texto' | 'segredo' | 'selecao'; publico?: boolean; obrigatorio?: boolean;
  opcoes?: Array<{ valor: string; rotulo: string }>; ajuda?: string;
}
interface Integracao { id: string; nome: string; descricao: string; escopo: 'clinica' | 'profissional'; campos: Campo[]; documentacao?: string }
interface Conexao {
  provedor: string; referencia_id: string | null; status: 'conectado' | 'erro' | 'desconectado';
  config: Record<string, string>; segredo_dica: string | null; ultimo_erro: string | null; conectado_em: string; updated_at: string;
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
  conectado: { rotulo: 'Credencial salva', variante: 'outline' },
  erro: { rotulo: 'Com erro', variante: 'destructive' },
  desconectado: { rotulo: 'Desconectado', variante: 'secondary' },
};

const formatarDataConexao = (valor: string | null | undefined) => {
  if (!valor) return 'data indisponível';
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? 'data indisponível'
    : data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

/**
 * Integrações que a clínica conecta com a própria conta. O catálogo vem do
 * servidor; os segredos são enviados uma vez e nunca voltam (só a dica ••••1234).
 */
export function IntegracoesClinica() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useSupabaseAuth();
  const medicosQuery = useMedicos();
  const medicos = medicosQuery.data ?? [];
  const query = useQuery({
    queryKey: ['integracoes-clinica', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: () => chamar<{ catalogo: Integracao[]; conexoes: Conexao[] }>({ action: 'list' }),
    enabled: !!user && !!profile?.clinica_id,
  });
  const [aberta, setAberta] = useState<{ integracao: Integracao; referencia_id: string | null; versaoEsperada: string | null } | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

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

  const abrir = (integracao: Integracao, referencia_id: string | null) => {
    const atual = conexao(integracao.id, referencia_id);
    setValores({ ...(atual?.config ?? {}) });
    setAberta({ integracao, referencia_id, versaoEsperada: atual?.updated_at ?? null });
  };

  const conectar = async () => {
    if (!aberta) return;
    setSalvando(true);
    try {
      await chamar({ action: 'connect', provedor: aberta.integracao.id, referencia_id: aberta.referencia_id, versao_esperada: aberta.versaoEsperada, valores });
      toast.success(`Credencial salva para ${aberta.integracao.nome}`);
      setAberta(null);
      queryClient.invalidateQueries({ queryKey: ['integracoes-clinica'] });
    } catch (e: any) {
      toast.error('Não foi possível conectar', { description: e.message });
    } finally {
      setSalvando(false);
    }
  };

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

  const desconectar = async (integracao: Integracao, referencia_id: string | null) => {
    if (!window.confirm(`Desconectar ${integracao.nome}? A credencial salva será apagada.`)) return;
    try {
      await chamar({ action: 'disconnect', provedor: integracao.id, referencia_id });
      toast.success(`${integracao.nome} desconectado`);
      queryClient.invalidateQueries({ queryKey: ['integracoes-clinica'] });
    } catch (e: any) {
      toast.error('Não foi possível desconectar', { description: e.message });
    }
  };

  if (query.isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (query.isError) return <ErrorState title="Não foi possível carregar as integrações" error={query.error} onRetry={() => query.refetch()} />;

  const catalogo = query.data?.catalogo ?? [];
  const camposObrigatoriosPreenchidos = Boolean(aberta) && (aberta?.integracao.campos.every((campo) => (
    !campo.obrigatorio || Boolean(valores[campo.id]?.trim())
  )) ?? false);

  const linha = (integracao: Integracao, referencia_id: string | null, titulo?: string) => {
    const c = conexao(integracao.id, referencia_id);
    const ativa = c && c.status !== 'desconectado';
    return (
      <div key={`${integracao.id}:${referencia_id ?? 'clinica'}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{titulo ?? integracao.nome}</p>
          <p className="text-xs text-muted-foreground">
          {ativa ? <>{integracao.id === 'mercado_pago' && c.config.nickname ? `Conta ${c.config.nickname} · ` : ''}{integracao.id === 'mercado_pago' ? 'conectada' : `Credencial ${c.segredo_dica ?? 'salva'}`} · desde {formatarDataConexao(c.conectado_em)}</> : 'Opcional · não conectado'}
          </p>
          {c?.status === 'erro' && c.ultimo_erro && <p className="mt-1 text-xs text-destructive">{c.ultimo_erro}</p>}
        </div>
        <div className="flex items-center gap-2">
          {c && <Badge variant={STATUS[c.status].variante}>{integracao.id === 'mercado_pago' && c.status === 'conectado' ? 'Conta conectada' : STATUS[c.status].rotulo}</Badge>}
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

      <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar {aberta?.integracao.nome}</DialogTitle>
            <DialogDescription>Campos secretos ficam em branco por segurança: preencha de novo para trocar a credencial.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {aberta?.integracao.campos.map((campo) => (
              <div key={campo.id} className="space-y-1.5">
                <Label htmlFor={`int-${campo.id}`}>{campo.rotulo}{campo.obrigatorio && ' *'}</Label>
                {campo.tipo === 'selecao' ? (
                  <Select value={valores[campo.id] ?? ''} onValueChange={(v) => setValores((s) => ({ ...s, [campo.id]: v }))}>
                    <SelectTrigger id={`int-${campo.id}`}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{campo.opcoes?.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input id={`int-${campo.id}`} type={campo.tipo === 'segredo' ? 'password' : 'text'} autoComplete="off"
                    value={valores[campo.id] ?? ''} onChange={(e) => setValores((s) => ({ ...s, [campo.id]: e.target.value }))} />
                )}
                {campo.ajuda && <p className="text-xs text-muted-foreground">{campo.ajuda}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberta(null)}>Cancelar</Button>
            <Button onClick={conectar} disabled={salvando || !camposObrigatoriosPreenchidos}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar credencial</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
