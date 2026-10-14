import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Stethoscope, UserCog, Mail } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { ConvitesList } from '@/components/ConvitesList';
import { SectionFallback } from '@/components/ui/loading-skeleton';

const Medicos = lazy(() => import('./Medicos'));
const Funcionarios = lazy(() => import('./Funcionarios'));

export default function Equipe() {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaSolicitada = searchParams.get('aba');
  const tab = ['medicos', 'funcionarios', 'convites'].includes(abaSolicitada || '') ? abaSolicitada! : 'medicos';
  const setTab = (value: string) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (value === 'medicos') next.delete('aba');
      else next.set('aba', value);
      return next;
    }, { replace: true });
  };

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList
          aria-label="Seções da equipe"
          className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border bg-muted/70 p-1.5 text-muted-foreground"
        >
          <TabsTrigger value="medicos" className="h-10 shrink-0 gap-2 rounded-lg px-4 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm focus-visible:ring-ring">
            <Stethoscope className="h-4 w-4" />
            Equipe Médica
          </TabsTrigger>
          <TabsTrigger value="funcionarios" className="h-10 shrink-0 gap-2 rounded-lg px-4 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm focus-visible:ring-ring">
            <UserCog className="h-4 w-4" />
            Funcionários
          </TabsTrigger>
          <TabsTrigger value="convites" className="h-10 shrink-0 gap-2 rounded-lg px-4 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm focus-visible:ring-ring">
            <Mail className="h-4 w-4" />
            Convites
          </TabsTrigger>
        </TabsList>

        <TabsContent value="medicos" className="mt-5 focus-visible:ring-ring">
          <Suspense fallback={<SectionFallback />}>
            <Medicos />
          </Suspense>
        </TabsContent>

        <TabsContent value="funcionarios" className="mt-5 focus-visible:ring-ring">
          <Suspense fallback={<SectionFallback />}>
            <Funcionarios />
          </Suspense>
        </TabsContent>

        <TabsContent value="convites" className="mt-5 focus-visible:ring-ring">
          <ConvitesList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
