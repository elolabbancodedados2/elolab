import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, History, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { ReauthDialog } from '@/components/ReauthDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { chaveDaClinica, lerConfigsClinicaComVersoes } from '@/lib/configClinica';
import { compararConfiguracoes, formatarValorConfiguracao } from '@/lib/configHistory';
import { exigeReautenticacao } from '@/lib/reautenticacao';

interface ConfigVersion {
  id: string;
  valor: unknown;
  criado_em: string;
  operacao: 'inicial' | 'salvar' | 'restaurar';
  restaurada_de: string | null;
}

interface HistoryData {
  versions: ConfigVersion[];
  current: unknown;
  expectedVersion: string | null;
}

const RETURN_TABS = ['clinica', 'plano', 'horarios', 'salas', 'financeiro', 'notificacoes', 'integracoes', 'impressao', 'seguranca', 'backup', 'historico'];

function dataCurta(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function operacaoLabel(value: ConfigVersion['operacao']) {
  return value === 'inicial' ? 'Versão inicial' : value === 'restaurar' ? 'Restauração' : 'Alteração salva';
}

export default function ConfiguracaoHistoricoPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile, user } = useSupabaseAuth();
  const configKeyParam = searchParams.get('chave') ?? '';
  const configKey = chaveDaClinica(configKeyParam) ? configKeyParam : null;
  const requestedTab = searchParams.get('origem') ?? 'clinica';
  const returnTab = RETURN_TABS.includes(requestedTab) ? requestedTab : 'clinica';
  const returnTo = `/configuracoes?tab=${returnTab}`;
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const restoreLock = useRef(false);

  const loadHistory = useCallback(async (active: () => boolean) => {
    if (!profile?.clinica_id || !configKey) {
      setLoading(false);
      setError(new Error(!profile?.clinica_id ? 'Clínica não identificada.' : 'A configuração solicitada não é válida.'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [versionsResult, currentResult] = await Promise.all([
        supabase.from('configuracoes_clinica_versoes')
          .select('id,valor,criado_em,operacao,restaurada_de')
          .eq('clinica_id', profile.clinica_id)
          .eq('chave', configKey)
          .order('criado_em', { ascending: false })
          .limit(50),
        lerConfigsClinicaComVersoes(profile.clinica_id, [configKey]),
      ]);
      if (versionsResult.error) throw versionsResult.error;
      if (!active()) return;
      const versions = (versionsResult.data ?? []) as ConfigVersion[];
      const current = currentResult.configs[configKey] ?? null;
      setHistory({ versions, current, expectedVersion: currentResult.updatedAtByKey[configKey] ?? null });
      setSelectedId(versions.find(version => JSON.stringify(version.valor) !== JSON.stringify(current))?.id ?? versions[0]?.id ?? null);
    } catch (cause) {
      if (active()) setError(cause);
    } finally {
      if (active()) setLoading(false);
    }
  }, [profile?.clinica_id, configKey]);

  useEffect(() => {
    let active = true;
    void loadHistory(() => active);
    return () => { active = false; };
  }, [loadHistory, retryCount]);

  const selectedVersion = history?.versions.find(version => version.id === selectedId) ?? null;
  const differences = useMemo(() => history?.current !== null && history?.current !== undefined && selectedVersion
    ? compararConfiguracoes(history.current, selectedVersion.valor)
    : [], [history?.current, selectedVersion]);

  const restore = async () => {
    if (restoreLock.current || restoring || !configKey || !selectedVersion || !history?.expectedVersion || differences.length === 0) return;
    restoreLock.current = true;
    setRestoring(true);
    try {
      const { error: restoreError } = await supabase.rpc('restaurar_configuracao_clinica_versao', {
        p_versao_id: selectedVersion.id,
        p_versao_esperada: history.expectedVersion,
      });
      if (restoreError) throw restoreError;
      toast.success('Versão restaurada e registrada no histórico.');
      navigate(returnTo, { replace: true });
    } catch (cause) {
      if (exigeReautenticacao(cause)) setReauthOpen(true);
      else toast.error('Não foi possível restaurar esta versão', { description: cause instanceof Error ? cause.message : 'Atualize o histórico e compare novamente.' });
    } finally {
      restoreLock.current = false;
      setRestoring(false);
    }
  };

  return <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader
      title="Histórico de versões"
      description="Compare os valores salvos com a configuração atual antes de restaurar uma versão."
      icon={<History />}
      actions={<Button variant="outline" onClick={() => navigate(returnTo)} disabled={restoring}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às configurações</Button>}
    />

    <div role="note" className="rounded-lg border border-[#DFE7F0] bg-[#F5F8FC] p-3 text-sm text-[#172B4D]">
      Restaurar grava uma nova versão para esta clínica. O sistema verifica a versão atual antes de aplicar a mudança para evitar sobrescrever uma edição simultânea.
    </div>

    {!configKey ? <Card><CardContent className="pt-6"><p role="alert" className="text-sm text-destructive">A configuração solicitada não é válida. Volte às configurações e abra o histórico pelo item correspondente.</p></CardContent></Card>
      : loading ? <div role="status" aria-busy="true" className="space-y-4"><div className="h-9 w-64 animate-pulse rounded bg-muted" /><div className="h-72 animate-pulse rounded-xl bg-muted" /></div>
        : error ? <ErrorState title="Não foi possível carregar o histórico" error={error} onRetry={() => setRetryCount(value => value + 1)} />
          : <div className="grid gap-5 lg:grid-cols-[minmax(15rem,0.72fr)_minmax(0,1.5fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Versões salvas</CardTitle>
                <CardDescription>{history?.versions.length ? `${history.versions.length} versões recentes disponíveis` : 'As próximas gravações da configuração aparecerão aqui.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {history?.versions.length ? <div className="max-h-[min(62vh,38rem)] space-y-2 overflow-y-auto pr-1">
                  {history.versions.map((version, index) => <button
                    key={version.id}
                    type="button"
                    aria-pressed={version.id === selectedId}
                    onClick={() => setSelectedId(version.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${version.id === selectedId ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                  >
                    <span className="flex items-center justify-between gap-3"><span className="font-medium">{operacaoLabel(version.operacao)}</span>{index === 0 && <Badge variant="outline">Mais recente</Badge>}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{dataCurta(version.criado_em)}</span>
                  </button>)}
                </div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Ainda não há versões disponíveis. As próximas gravações serão registradas automaticamente.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Comparação antes de restaurar</CardTitle>
                <CardDescription>{selectedVersion ? `${operacaoLabel(selectedVersion.operacao)} · ${dataCurta(selectedVersion.criado_em)}` : 'Selecione uma versão na lista para revisar as diferenças.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedVersion ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma versão selecionada.</p>
                  : history?.current === null || history?.current === undefined ? <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">Não há configuração atual salva para comparar. Atualize a configuração antes de restaurar uma versão.</p>
                    : differences.length === 0 ? <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">A versão selecionada é igual à configuração atual.</p>
                      : <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader><TableRow><TableHead>Campo</TableHead><TableHead>Atual</TableHead><TableHead>Versão escolhida</TableHead></TableRow></TableHeader>
                          <TableBody>{differences.map(item => <TableRow key={item.campo}>
                            <TableCell className="min-w-32 font-medium">{item.campo}</TableCell>
                            <TableCell className="max-w-56 break-all text-muted-foreground">{formatarValorConfiguracao(item.atual)}</TableCell>
                            <TableCell className="max-w-56 break-all">{formatarValorConfiguracao(item.versao)}</TableCell>
                          </TableRow>)}</TableBody>
                        </Table>
                      </div>}
                {selectedVersion?.restaurada_de && <p className="text-xs text-muted-foreground">Esta versão foi criada ao restaurar outra configuração.</p>}
                {selectedVersion && <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">A restauração mantém o registro atual no histórico e grava uma nova versão.</p>
                  <Button onClick={() => void restore()} disabled={restoring || loading || !history?.expectedVersion || differences.length === 0}>
                    {restoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {restoring ? 'Restaurando…' : 'Restaurar versão comparada'}
                  </Button>
                </div>}
              </CardContent>
            </Card>
          </div>}

    <ReauthDialog
      open={reauthOpen}
      email={user?.email ?? ''}
      title="Confirme sua identidade"
      description="Esta restauração altera configurações compartilhadas da clínica. Confirme sua identidade para continuar."
      onOpenChange={setReauthOpen}
      onConfirmed={restore}
    />
  </div>;
}
