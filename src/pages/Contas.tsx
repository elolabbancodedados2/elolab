import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BadgeDollarSign, CreditCard } from 'lucide-react';
import { SectionFallback } from '@/components/ui/loading-skeleton';

const ContasReceber = lazy(() => import('./ContasReceber'));
const ContasPagar = lazy(() => import('./ContasPagar'));

const Loader = () => <SectionFallback />;

export default function Contas() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'pagar' ? 'pagar' : 'receber';

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={value => setSearchParams(value === 'pagar' ? { tab: 'pagar' } : {}, { replace: true })} className="w-full">
        <TabsList className="mx-auto grid w-full max-w-sm grid-cols-2 rounded-full border border-border/60 bg-muted/40 p-1 shadow-xs">
          <TabsTrigger value="receber" className="gap-2 rounded-full data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:shadow-sm">
            <BadgeDollarSign className="h-4 w-4" />
            A Receber
          </TabsTrigger>
          <TabsTrigger value="pagar" className="gap-2 rounded-full data-[state=active]:bg-gradient-primary data-[state=active]:text-white data-[state=active]:shadow-sm">
            <CreditCard className="h-4 w-4" />
            A Pagar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="receber" className="mt-4">
          <Suspense fallback={<Loader />}><ContasReceber /></Suspense>
        </TabsContent>
        <TabsContent value="pagar" className="mt-4">
          <Suspense fallback={<Loader />}><ContasPagar /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
