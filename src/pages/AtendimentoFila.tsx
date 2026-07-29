import { useState, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ClipboardCheck, Activity } from 'lucide-react';
import { SectionFallback } from '@/components/ui/loading-skeleton';

/**
 * Casca "Fila / Triagem" — mesmo padrão de GestaoFluxo, Contas e RecepcaoCaixa.
 *
 * A Triagem existia como página completa (protocolo de Manchester, sinais
 * vitais, IMC) mas ficou inalcançável quando a rota /triagem passou a
 * redirecionar para /fila, e a Fila não tem triagem. Aqui as duas voltam a
 * conviver, e o menu "Fila / Triagem" passa a entregar o que promete.
 */

const Fila = lazy(() => import('./Fila'));
const Triagem = lazy(() => import('./Triagem'));

const Loader = () => <SectionFallback />;

export default function AtendimentoFila() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Permite abrir direto na triagem (ex.: /fila?tab=triagem), que é para onde
  // a antiga rota /triagem redireciona.
  const [tab, setTab] = useState(searchParams.get('tab') === 'triagem' ? 'triagem' : 'fila');

  const handleTabChange = (value: string) => {
    setTab(value);
    setSearchParams(value === 'triagem' ? { tab: 'triagem' } : {}, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mx-auto">
          <TabsTrigger value="fila" className="gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Fila
          </TabsTrigger>
          <TabsTrigger value="triagem" className="gap-2">
            <Activity className="h-4 w-4" />
            Triagem
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fila" className="mt-4">
          <Suspense fallback={<Loader />}><Fila /></Suspense>
        </TabsContent>
        <TabsContent value="triagem" className="mt-4">
          <Suspense fallback={<Loader />}><Triagem /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
