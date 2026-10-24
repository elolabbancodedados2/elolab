import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ErrorState } from '@/components/ErrorState';
import { usePlanLimits } from '@/hooks/usePlanLimits';

/** Uso dos limites do plano, contado pelo servidor com a mesma regra que valida convites. */
export function UsoDoPlano() {
  const { data, isLoading, isError, isFetching, error, refetch } = usePlanLimits();

  return (
    <Card className="rounded-2xl border-border/60 shadow-xs">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Uso do plano</CardTitle>
          <CardDescription>
            {data?.plano_nome ? `Limites do ${data.plano_nome}.` : 'Nenhum plano vigente vinculado à clínica.'}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar uso
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">Consultando o uso do plano…</p>
        ) : isError || !data ? (
          <ErrorState compact title="Não foi possível consultar o uso do plano" error={error} onRetry={() => void refetch()} />
        ) : (
          <>
            {data.recursos.map((recurso) => (
              <div key={recurso.chave} className="space-y-1.5">
                <div className="flex justify-between gap-3 text-sm">
                  <span>{recurso.rotulo}</span>
                  <span className="text-muted-foreground">
                    {recurso.limite === null
                      ? `${recurso.usado} · sem limite do plano`
                      : `${recurso.usado} de ${recurso.limite} · ${recurso.restante ? `restam ${recurso.restante}` : 'limite atingido'}`}
                  </span>
                </div>
                {recurso.limite !== null && (
                  <Progress value={recurso.limite > 0 ? Math.min(100, (recurso.usado / recurso.limite) * 100) : 100} aria-label={`${recurso.rotulo}: ${recurso.usado} de ${recurso.limite}`} />
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Verificado pelo servidor em {new Date(data.verificadoEm).toLocaleString('pt-BR')}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
