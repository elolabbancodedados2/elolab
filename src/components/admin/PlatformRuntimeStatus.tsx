import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from '@/integrations/supabase/client';
import { checkPlatformRuntime, type PlatformRuntimeStatus, type RuntimeCheck } from '@/lib/platformRuntimeStatus';

const statusLabel: Record<RuntimeCheck, string> = { ok: 'Disponível', error: 'Indisponível' };

function StatusPill({ status }: { status: RuntimeCheck }) {
  return <Badge variant={status === 'ok' ? 'outline' : 'destructive'} role="status">{statusLabel[status]}</Badge>;
}

export function PlatformRuntimeStatus() {
  const [status, setStatus] = useState<PlatformRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const pendingCheck = useRef<Promise<void> | null>(null);

  const runChecks = useCallback(() => {
    if (pendingCheck.current) return pendingCheck.current;
    setLoading(true);
    const request = checkPlatformRuntime({
      appUrl: window.location.origin,
      supabaseUrl: SUPABASE_URL,
      publishableKey: SUPABASE_PUBLISHABLE_KEY,
      databaseCheck: (signal) => supabase.rpc('public_availability_check').abortSignal(signal),
    }).then((result) => {
      setStatus(result);
    }).finally(() => {
      setLoading(false);
      pendingCheck.current = null;
    });
    pendingCheck.current = request;
    return request;
  }, []);

  useEffect(() => { void runChecks(); }, [runChecks]);

  const builtAt = status?.builtAt
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(status.builtAt))
    : 'Indisponível';
  const checkedAt = status?.checkedAt
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(status.checkedAt))
    : null;

  return (
    <Card role="region" aria-labelledby="runtime-status-title">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle id="runtime-status-title" className="flex items-center gap-2"><Activity className="h-5 w-5" /> Versão e disponibilidade
          </CardTitle>
          <CardDescription>Build publicado e checagens públicas dos serviços essenciais.</CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void runChecks()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !status ? (
          <div role="status" aria-label="Verificando disponibilidade" className="space-y-3">
            <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
          </div>
        ) : status ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3" aria-label="Checagens de disponibilidade">
              <div className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span>Aplicação EloLab</span><StatusPill status={status.app} />
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span>Autenticação</span><StatusPill status={status.auth} />
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span>API e banco de dados</span><StatusPill status={status.database} />
              </div>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0 rounded-lg bg-muted/40 p-3">
                <dt className="text-muted-foreground">SHA do build</dt>
                <dd className="mt-1 break-all font-mono text-xs" data-testid="platform-build-id">{status.buildId ?? 'Indisponível'}</dd>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <dt className="text-muted-foreground">Build em</dt>
                <dd className="mt-1 font-medium">{builtAt}</dd>
              </div>
            </dl>
            {checkedAt && <p className="text-right text-xs text-muted-foreground">Checado em {checkedAt}</p>}
          </>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">Não foi possível executar as checagens.</p>
        )}
      </CardContent>
    </Card>
  );
}
