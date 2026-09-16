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
        <TabsList className="grid w-full max-w-md grid-cols-2 mx-auto">
          <TabsTrigger value="receber" className="gap-2">
            <BadgeDollarSign className="h-4 w-4" />
            Contas a Receber
          </TabsTrigger>
          <TabsTrigger value="pagar" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Contas a Pagar
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
