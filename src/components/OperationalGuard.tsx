import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Lock, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';

type OperationalState = {
  bloqueio_emergencial: boolean;
  somente_leitura: boolean;
  mensagem: string | null;
};

export function OperationalGuard({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading, isPlatformAdmin } = useSupabaseAuth();
  const query = useQuery({
    queryKey: ['estado-operacional'],
    enabled: !!user && !authLoading,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('estado_operacional');
      if (error) throw error;
      if (!data || typeof data !== 'object') throw new Error('Estado operacional indisponível.');
      if (typeof data.bloqueio_emergencial !== 'boolean' || typeof data.somente_leitura !== 'boolean') {
        throw new Error('Resposta operacional inválida.');
      }
      return data as OperationalState;
    },
    refetchInterval: 30_000,
  });

  if (!user) return <>{children}</>;

  if (authLoading) {
    return <main className="grid min-h-screen place-items-center p-6"><div role="status" className="text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" /><p className="mt-4 text-muted-foreground">Verificando sua sessão e o estado da plataforma…</p></div></main>;
  }

  if (!isPlatformAdmin && (query.isLoading || query.isError || !query.data)) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div role={query.isError ? 'alert' : 'status'} className="max-w-lg text-center">
          {query.isError ? <Lock className="mx-auto h-12 w-12 text-destructive" /> : <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />}
          <h1 className="mt-4 text-2xl font-bold">{query.isError ? 'Acesso temporariamente suspenso' : 'Verificando o estado da plataforma'}</h1>
          <p className="mt-2 text-muted-foreground">
            {query.isError
              ? 'Não foi possível confirmar se a plataforma está liberada. Tente novamente em instantes.'
              : 'Aguarde enquanto confirmamos se a plataforma está disponível.'}
          </p>
          {query.isError && <Button className="mt-4" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Tentar novamente
          </Button>}
        </div>
      </main>
    );
  }

  const state = query.data;
  if (state?.bloqueio_emergencial && !isPlatformAdmin) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div role="alert" className="max-w-lg text-center">
          <Lock className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-4 text-2xl font-bold">Acesso temporariamente suspenso</h1>
          <p className="mt-2 text-muted-foreground">{state.mensagem || 'A plataforma está passando por uma intervenção operacional.'}</p>
        </div>
      </main>
    );
  }

  return (
    <>
      {query.isError && isPlatformAdmin && <div role="alert" className="flex items-center justify-center gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4" />Não foi possível confirmar o estado operacional. O painel administrativo continua disponível para recuperação.
        <Button variant="link" className="h-auto p-0 text-destructive" onClick={() => void query.refetch()}>Tentar novamente</Button>
      </div>}
      {state?.somente_leitura && <div role="status" className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4" />Modo somente leitura: {state.mensagem || 'alterações estão suspensas'}
      </div>}
      {children}
    </>
  );
}
