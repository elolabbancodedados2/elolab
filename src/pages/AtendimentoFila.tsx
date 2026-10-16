import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ClipboardCheck, Activity } from 'lucide-react';
import { SectionFallback } from '@/components/ui/loading-skeleton';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

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
  const { hasAnyRole } = useSupabaseAuth();
  const podeAcessarTriagem = hasAnyRole(['admin', 'medico', 'enfermagem']);
  // Permite abrir direto na triagem (ex.: /fila?tab=triagem), que é para onde
  // a antiga rota /triagem redireciona.
  const tab = podeAcessarTriagem && searchParams.get('tab') === 'triagem' ? 'triagem' : 'fila';

  const handleTabChange = (value: string) => {
    setSearchParams(value === 'triagem' ? { tab: 'triagem' } : {}, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className={`grid w-full max-w-md ${podeAcessarTriagem ? 'grid-cols-2' : 'grid-cols-1'} mx-auto rounded-xl border border-[#E2DEF3] bg-[#F0EDFF] p-1`}>
          <TabsTrigger value="fila" className="min-h-10 gap-2 rounded-lg">
            <ClipboardCheck className="h-4 w-4" />
            Fila
          </TabsTrigger>
          {podeAcessarTriagem && <TabsTrigger value="triagem" className="min-h-10 gap-2 rounded-lg">
            <Activity className="h-4 w-4" />
            Triagem
          </TabsTrigger>}
        </TabsList>

        <TabsContent value="fila" className="mt-4">
          <Suspense fallback={<Loader />}><Fila /></Suspense>
        </TabsContent>
        {podeAcessarTriagem && <TabsContent value="triagem" className="mt-4">
          <Suspense fallback={<Loader />}><Triagem /></Suspense>
        </TabsContent>}
      </Tabs>
    </div>
  );
}
