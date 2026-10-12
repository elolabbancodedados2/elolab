import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MonitorSmartphone, HandCoins } from 'lucide-react';
import Recepcao from './Recepcao';
import CaixaDiario from './CaixaDiario';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { canAccessReceptionTab, getReceptionCashTab } from '@/lib/cashierAccess';

export default function RecepcaoCaixa() {
  const { profile } = useSupabaseAuth();
  const roles = [...new Set([...(profile?.roles ?? []), ...(profile?.role ? [profile.role] : [])])];
  const podeAcessarRecepcao = canAccessReceptionTab(roles);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getReceptionCashTab(searchParams.get('tab'), roles);
  const setActiveTab = (value: string) => {
    if (value === 'recepcao' && !podeAcessarRecepcao) return;
    setSearchParams(value === 'caixa' ? { tab: 'caixa' } : {}, { replace: true });
  };

  return (
    <div className="space-y-5">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`mx-auto grid h-auto w-full max-w-md ${podeAcessarRecepcao ? 'grid-cols-2' : 'grid-cols-1'} rounded-2xl border border-[#D8E8F4] bg-[#EAF4FF] p-1.5 shadow-sm`}>
          {podeAcessarRecepcao && <TabsTrigger value="recepcao" className="min-h-11 gap-2 rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0C1F54] data-[state=active]:shadow-sm">
            <MonitorSmartphone className="h-4 w-4" />
            Recepção
          </TabsTrigger>}
          <TabsTrigger value="caixa" className="min-h-11 gap-2 rounded-xl data-[state=active]:bg-white data-[state=active]:text-[#0C1F54] data-[state=active]:shadow-sm">
            <HandCoins className="h-4 w-4" />
            Caixa Diário
          </TabsTrigger>
        </TabsList>

        {podeAcessarRecepcao && <TabsContent value="recepcao" className="mt-4">
          <Recepcao onOpenCaixa={() => setActiveTab('caixa')} />
        </TabsContent>}

        <TabsContent value="caixa" className="mt-4">
          <CaixaDiario />
        </TabsContent>
      </Tabs>
    </div>
  );
}
