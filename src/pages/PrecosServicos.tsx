import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TestTubes, Stethoscope, Tags } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { SectionFallback } from '@/components/ui/loading-skeleton';
import { PageHeader } from '@/components/PageHeader';

const PrecosExames = lazy(() => import('./PrecosExames'));
const TiposConsulta = lazy(() => import('./TiposConsulta'));

export default function PrecosServicos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'tipos' ? 'tipos' : 'precos';
  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    // A subaba de exames (?sub=) só vale dentro da aba de preços.
    if (value !== 'precos') next.delete('sub');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Um único cabeçalho; as abas embutidas não repetem o próprio título. */}
      <PageHeader
        title="Preços e serviços"
        description="Tabela de exames (particular e por convênio) e tipos de consulta com seus preços."
        icon={<Tags />}
      />
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="inline-flex h-11 w-full max-w-md items-center rounded-lg border border-border bg-secondary p-1 text-muted-foreground">
          <TabsTrigger
            value="precos"
            className="min-h-9 flex-1 gap-2 px-4 text-sm font-medium focus-visible:ring-ring"
          >
            <TestTubes className="h-4 w-4" />
            Tabela de preços
          </TabsTrigger>
          <TabsTrigger
            value="tipos"
            className="min-h-9 flex-1 gap-2 px-4 text-sm font-medium focus-visible:ring-ring"
          >
            <Stethoscope className="h-4 w-4" />
            Tipos de consulta
          </TabsTrigger>
        </TabsList>

        <TabsContent value="precos" className="mt-4">
          <Suspense fallback={<SectionFallback />}>
            <PrecosExames embedded />
          </Suspense>
        </TabsContent>

        <TabsContent value="tipos" className="mt-4">
          <Suspense fallback={<SectionFallback />}>
            <TiposConsulta embedded />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
