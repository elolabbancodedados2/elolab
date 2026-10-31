import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BookMarked, FileBarChart, FolderSearch, Stethoscope } from 'lucide-react';
import { SectionFallback } from '@/components/ui/loading-skeleton';
import { BuscaAnexosClinicos } from '@/components/clinical/BuscaAnexosClinicos';

const Prescricoes = lazy(() => import('./Prescricoes'));
const Atestados = lazy(() => import('./Atestados'));
const Encaminhamentos = lazy(() => import('./Encaminhamentos'));

const Loader = () => <SectionFallback />;

export default function DocumentosClinicos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = requestedTab === 'atestados' || requestedTab === 'encaminhamentos' || requestedTab === 'anexos' ? requestedTab : 'prescricoes';
  const setTab = (value: string) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (value === 'prescricoes') next.delete('tab');
    else next.set('tab', value);
    return next;
  }, { replace: true });

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid h-auto w-full max-w-2xl grid-cols-2 rounded-lg border border-border bg-secondary p-1.5 sm:grid-cols-4">
          <TabsTrigger value="prescricoes" className="min-h-11 gap-2 rounded-xl">
            <BookMarked className="h-4 w-4" />
            Prescrições
          </TabsTrigger>
          <TabsTrigger value="atestados" className="min-h-11 gap-2 rounded-xl">
            <FileBarChart className="h-4 w-4" />
            Atestados
          </TabsTrigger>
          <TabsTrigger value="encaminhamentos" className="min-h-11 gap-2 rounded-xl">
            <Stethoscope className="h-4 w-4" />
            Encaminhamentos
          </TabsTrigger>
          <TabsTrigger value="anexos" className="min-h-11 gap-2 rounded-xl">
            <FolderSearch className="h-4 w-4" />
            Anexos
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
        <TabsContent value="anexos" className="mt-4">
          <BuscaAnexosClinicos />
        </TabsContent>
      </Tabs>
    </div>
  );
}
