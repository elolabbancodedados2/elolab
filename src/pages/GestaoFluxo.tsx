import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DoorOpen, ClockAlert } from 'lucide-react';
import { SectionFallback } from '@/components/ui/loading-skeleton';

const Salas = lazy(() => import('./Salas'));
const ListaEspera = lazy(() => import('./ListaEspera'));

const Loader = () => <SectionFallback />;

export default function GestaoFluxo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'espera' ? 'espera' : 'salas';

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={value => setSearchParams(value === 'espera' ? { tab: 'espera' } : {}, { replace: true })} className="w-full">
        <TabsList className="mx-auto grid w-full max-w-md grid-cols-2 rounded-xl border border-border bg-muted/70 p-1 text-muted-foreground">
          <TabsTrigger value="salas" className="min-h-10 gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm focus-visible:ring-ring">
            <DoorOpen className="h-4 w-4" />
            Salas
          </TabsTrigger>
          <TabsTrigger value="espera" className="min-h-10 gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm focus-visible:ring-ring">
            <ClockAlert className="h-4 w-4" />
            Lista de Espera
          </TabsTrigger>
        </TabsList>

        <TabsContent value="salas" className="mt-4">
          <Suspense fallback={<Loader />}><Salas /></Suspense>
        </TabsContent>
        <TabsContent value="espera" className="mt-4">
          <Suspense fallback={<Loader />}><ListaEspera /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
