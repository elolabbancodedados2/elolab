import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TestTubes, Stethoscope } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { SectionFallback } from '@/components/ui/loading-skeleton';

const PrecosExames = lazy(() => import('./PrecosExames'));
const TiposConsulta = lazy(() => import('./TiposConsulta'));

export default function PrecosServicos() {
  const [tab, setTab] = useState('precos');

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mx-auto">
          <TabsTrigger value="precos" className="gap-2">
            <TestTubes className="h-4 w-4" />
            Tabela de Preços
          </TabsTrigger>
          <TabsTrigger value="tipos" className="gap-2">
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
