import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TestTubes, Stethoscope } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { SectionFallback } from '@/components/ui/loading-skeleton';

const PrecosExames = lazy(() => import('./PrecosExames'));
const TiposConsulta = lazy(() => import('./TiposConsulta'));

export default function PrecosServicos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'tipos' ? 'tipos' : 'precos';
  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-5 pb-8">
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mx-auto inline-flex h-10 w-full max-w-md items-center rounded-full border border-border/60 bg-card p-1 text-muted-foreground">
          <TabsTrigger
            value="precos"
            className="flex-1 gap-2 rounded-full px-4 text-sm font-medium focus-visible:ring-ring data-[state=active]:shadow-sm"
          >
            <TestTubes className="h-4 w-4" />
            Tabela de Preços
          </TabsTrigger>
          <TabsTrigger
            value="tipos"
            className="flex-1 gap-2 rounded-full px-4 text-sm font-medium focus-visible:ring-ring data-[state=active]:shadow-sm"
          >
            <Stethoscope className="h-4 w-4" />
            Tipos de Consulta
          </TabsTrigger>
        </TabsList>

        <TabsContent value="precos" className="mt-4">
          <Suspense fallback={<SectionFallback />}>
            <PrecosExames />
          </Suspense>
        </TabsContent>

        <TabsContent value="tipos" className="mt-4">
          <Suspense fallback={<SectionFallback />}>
            <TiposConsulta />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
