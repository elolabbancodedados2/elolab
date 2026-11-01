import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Lock, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { BrandLoadingScreen } from '@/components/BrandLoadingScreen';

type OperationalState = {
  bloqueio_emergencial: boolean;
  somente_leitura: boolean;
  mensagem: string | null;
};

const OPERATIONAL_CHECK_TIMEOUT_MS = 12_000;

function parseOperationalState(data: unknown): OperationalState {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Estado operacional indisponível.');
  const value = data as Record<string, unknown>;
  if (typeof value.bloqueio_emergencial !== 'boolean' || typeof value.somente_leitura !== 'boolean') {
    throw new Error('Resposta operacional inválida.');
  }
  return {
    bloqueio_emergencial: value.bloqueio_emergencial,
    somente_leitura: value.somente_leitura,
    mensagem: typeof value.mensagem === 'string' ? value.mensagem : null,
  };
}

export function OperationalGuard({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading, isPlatformAdmin } = useSupabaseAuth();
  const query = useQuery({
    queryKey: ['estado-operacional'],
    enabled: !!user && !authLoading,
    queryFn: async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('A verificação operacional demorou mais que o esperado.')), OPERATIONAL_CHECK_TIMEOUT_MS);
      });
      try {
        const { data, error } = await Promise.race([supabase.rpc('estado_operacional'), timeout]);
        if (error) throw error;
        return parseOperationalState(data);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    refetchInterval: 30_000,
    // Oscilação de rede não pode trocar o app inteiro por uma tela de bloqueio:
    // duas novas tentativas antes de considerar a verificação indisponível.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    // A própria tela informa a falha; o toast global seria repetido a cada 30 s.
    meta: { suppressGlobalErrorToast: true },
  });

  if (!user) return <>{children}</>;

  if (authLoading) {
    return <BrandLoadingScreen message="Verificando sua sessão" detail="Estamos preparando seu acesso ao EloLab." />;
  }

  const state = query.data;

  if (!isPlatformAdmin && !state) {
    // Sem nenhuma verificação concluída não dá para saber se a plataforma está
    // liberada: falha fechada, com opção de tentar de novo.
    if (query.isError && !query.isFetching) {
      return (
        <main className="grid min-h-screen place-items-center bg-background p-6">
          <div role="alert" className="max-w-lg text-center">
            <Lock aria-hidden="true" className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-2xl font-bold">Acesso temporariamente suspenso</h1>
            <p className="mt-2 text-muted-foreground">
              Não foi possível confirmar se a plataforma está liberada. Verifique a conexão e tente novamente.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
              <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />Tentar novamente
            </Button>
          </div>
        </main>
      );
    }
    return <BrandLoadingScreen message="Confirmando o estado da plataforma" detail="Isso leva só um instante." />;
  }

  if (state?.bloqueio_emergencial && !isPlatformAdmin) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <div role="alert" className="max-w-lg text-center">
          <Lock aria-hidden="true" className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-4 text-2xl font-bold">Acesso temporariamente suspenso</h1>
          <p className="mt-2 text-muted-foreground">{state.mensagem || 'A plataforma está passando por uma intervenção operacional.'}</p>
        </div>
      </main>
    );
  }

  // Falha numa verificação posterior: mantém o último estado conhecido e avisa.
  const falhaComUltimoEstado = query.isError && !!state && !isPlatformAdmin;

  return (
    <>
      {query.isError && isPlatformAdmin && <div role="alert" className="flex items-center justify-center gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive">
        <AlertTriangle aria-hidden="true" className="h-4 w-4" />Não foi possível confirmar o estado operacional. O painel administrativo continua disponível para recuperação.
        <Button variant="link" className="h-auto p-0 text-destructive" onClick={() => void query.refetch()}>Tentar novamente</Button>
      </div>}
      {falhaComUltimoEstado && <div role="status" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-foreground">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 text-warning" />
        Sem conexão para confirmar o estado da plataforma. Seguimos com a última verificação.
        <Button variant="link" className="h-auto p-0 text-foreground underline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? 'Verificando…' : 'Tentar novamente'}
        </Button>
      </div>}
      {state?.somente_leitura && <div role="status" className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-sm font-medium">
        <AlertTriangle aria-hidden="true" className="h-4 w-4" />Modo somente leitura: {state.mensagem || 'alterações estão suspensas'}
      </div>}
      {children}
    </>
  );
}
