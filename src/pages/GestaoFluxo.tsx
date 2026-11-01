import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DoorOpen, ClockAlert, LoaderCircle, LayoutGrid } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const Salas = lazy(() => import('./Salas'));
const ListaEspera = lazy(() => import('./ListaEspera'));
const GradeOcupacaoDia = lazy(() => import('@/components/fluxo/GradeOcupacaoDia').then(m => ({ default: m.GradeOcupacaoDia })));

function WorkspaceFallback({ label }: { label: string }) {
  return (
    <section
      role="status"
      aria-label={`Carregando ${label.toLowerCase()}`}
      aria-busy="true"
      className="space-y-4 py-2"
    >
      <div className="flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
        <span>Carregando {label.toLowerCase()}…</span>
      </div>
      <div aria-hidden="true" className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 border-t border-border/70 pt-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-8 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function GestaoFluxo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pedida = searchParams.get('tab');
  const tab = pedida === 'espera' || pedida === 'ocupacao' ? pedida : 'salas';

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={value => setSearchParams(current => {
        const next = new URLSearchParams(current);
        if (value === 'espera' || value === 'ocupacao') next.set('tab', value);
        else next.delete('tab');
        return next;
      })} className="w-full">
        <TabsList className="grid h-auto w-full max-w-xl grid-cols-3 rounded-lg border border-border bg-secondary p-1.5">
          <TabsTrigger value="salas" className="min-h-11 gap-2 rounded-xl">
            <DoorOpen className="h-4 w-4" />
            Salas
          </TabsTrigger>
          <TabsTrigger value="espera" className="min-h-11 gap-2 rounded-xl">
            <ClockAlert className="h-4 w-4" />
            Lista de espera
          </TabsTrigger>
          <TabsTrigger value="ocupacao" className="min-h-11 gap-2 rounded-xl">
            <LayoutGrid className="h-4 w-4" />
            Ocupação do dia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="salas" className="mt-4">
          <Suspense fallback={<WorkspaceFallback label="salas" />}><Salas /></Suspense>
        </TabsContent>
        <TabsContent value="espera" className="mt-4">
          <Suspense fallback={<WorkspaceFallback label="lista de espera" />}><ListaEspera /></Suspense>
        </TabsContent>
        <TabsContent value="ocupacao" className="mt-4">
          <Suspense fallback={<WorkspaceFallback label="ocupação do dia" />}><GradeOcupacaoDia /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
