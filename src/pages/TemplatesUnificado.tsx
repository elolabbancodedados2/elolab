import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FolderKanban, Mail } from 'lucide-react';
import { SectionFallback } from '@/components/ui/loading-skeleton';

const Templates = lazy(() => import('./Templates'));
const TemplatesEmail = lazy(() => import('./TemplatesEmail'));

const Loader = () => <SectionFallback />;

export default function TemplatesUnificado() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'email' ? 'email' : 'prontuario';
  const setTab = (value: string) => setSearchParams(value === 'prontuario' ? {} : { tab: value }, { replace: true });

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid h-auto w-full max-w-md grid-cols-2 rounded-lg border border-border bg-secondary p-1.5">
          <TabsTrigger value="prontuario" className="min-h-11 gap-2 rounded-xl">
            <FolderKanban className="h-4 w-4" />
            Clínicos
          </TabsTrigger>
          <TabsTrigger value="email" className="min-h-11 gap-2 rounded-xl">
            <Mail className="h-4 w-4" />
            E-mail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prontuario" className="mt-4">
          <Suspense fallback={<Loader />}><Templates /></Suspense>
        </TabsContent>
        <TabsContent value="email" className="mt-4">
          <Suspense fallback={<Loader />}><TemplatesEmail /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
