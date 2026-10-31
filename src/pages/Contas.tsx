import { lazy, Suspense, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BadgeDollarSign, CreditCard } from 'lucide-react';
import { SectionFallback } from '@/components/ui/loading-skeleton';
import { normalizeAccountRouteParams } from '@/lib/financeRouteState';

const ContasReceber = lazy(() => import('./ContasReceber'));
const ContasPagar = lazy(() => import('./ContasPagar'));

const Loader = () => <SectionFallback />;

export default function Contas() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchString = searchParams.toString();
  const tab = searchParams.get('tab') === 'pagar' ? 'pagar' : 'receber';

  useEffect(() => {
    const normalized = normalizeAccountRouteParams(searchParams);
    if (normalized.toString() !== searchString) setSearchParams(normalized, { replace: true });
  }, [searchParams, searchString, setSearchParams]);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={value => setSearchParams(current => {
        const next = new URLSearchParams(current);
        if (value === 'pagar') next.set('tab', 'pagar');
        else next.delete('tab');
        return next;
      })} className="w-full">
        <TabsList className="grid w-full max-w-sm grid-cols-2 rounded-lg border border-border bg-secondary p-1">
          <TabsTrigger value="receber" className="gap-2">
            <BadgeDollarSign className="h-4 w-4" />
            A Receber
          </TabsTrigger>
          <TabsTrigger value="pagar" className="gap-2">
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
