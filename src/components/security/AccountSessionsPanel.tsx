import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { describeAccountDevice } from '@/lib/accountSessionDevice';

function formatActivity(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horário indisponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function AccountSessionsPanel() {
  const { data = [], isError, isFetching, isLoading, refetch } = useQuery({
    queryKey: ['account-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_account_sessions');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  return (
    <section aria-labelledby="account-sessions-title" aria-live="polite" className="mt-6 rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h3 id="account-sessions-title" className="font-semibold">Sessões desta conta</h3>
            <p className="mt-1 text-sm text-muted-foreground">Dispositivos aproximados e última atividade conhecida. Sessões antigas podem mostrar a última renovação do Supabase Auth.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" aria-label="Atualizar sessões" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw aria-hidden="true" className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">Carregando sessões…</p>
      ) : isError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">Não foi possível carregar suas sessões. Tente atualizar a lista.</p>
      ) : data.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma sessão ativa encontrada.</p>
      ) : (
        <ul aria-label="Dispositivos com sessão ativa" className="mt-4 divide-y">
          {data.map((session) => (
            <li key={session.session_id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium">{describeAccountDevice(session.user_agent)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span>Atividade/renovação conhecida </span>
                  <time dateTime={session.last_activity_at}>{formatActivity(session.last_activity_at)}</time>
                </p>
              </div>
              <Badge variant={session.is_current ? 'default' : 'secondary'}>
                {session.is_current ? 'Este dispositivo' : 'Outro dispositivo'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
