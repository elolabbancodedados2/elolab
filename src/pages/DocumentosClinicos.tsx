import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BookMarked, FileBarChart, Stethoscope } from 'lucide-react';
import { SectionFallback } from '@/components/ui/loading-skeleton';

const Prescricoes = lazy(() => import('./Prescricoes'));
const Atestados = lazy(() => import('./Atestados'));
const Encaminhamentos = lazy(() => import('./Encaminhamentos'));

const Loader = () => <SectionFallback />;

export default function DocumentosClinicos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = requestedTab === 'atestados' || requestedTab === 'encaminhamentos' ? requestedTab : 'prescricoes';
  const setTab = (value: string) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (value === 'prescricoes') next.delete('tab');
    else next.set('tab', value);
    return next;
  }, { replace: true });

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3 mx-auto">
          <TabsTrigger value="prescricoes" className="gap-2">
            <BookMarked className="h-4 w-4" />
            Prescrições
          </TabsTrigger>
          <TabsTrigger value="atestados" className="gap-2">
            <FileBarChart className="h-4 w-4" />
            Atestados
          </TabsTrigger>
          <TabsTrigger value="encaminhamentos" className="gap-2">
            <Stethoscope className="h-4 w-4" />
            Encaminhamentos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prescricoes" className="mt-4">
          <Suspense fallback={<Loader />}><Prescricoes /></Suspense>
        </TabsContent>
        <TabsContent value="atestados" className="mt-4">
          <Suspense fallback={<Loader />}><Atestados /></Suspense>
        </TabsContent>
        <TabsContent value="encaminhamentos" className="mt-4">
          <Suspense fallback={<Loader />}><Encaminhamentos /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
