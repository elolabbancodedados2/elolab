import { useState, lazy, Suspense } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FolderKanban, Mail } from 'lucide-react';
import { SectionFallback } from '@/components/ui/loading-skeleton';

const Templates = lazy(() => import('./Templates'));
const TemplatesEmail = lazy(() => import('./TemplatesEmail'));

const Loader = () => <SectionFallback />;

export default function TemplatesUnificado() {
  const [tab, setTab] = useState('prontuario');

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mx-auto">
          <TabsTrigger value="prontuario" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            Prontuário
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
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
