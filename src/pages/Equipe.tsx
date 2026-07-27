import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Stethoscope, UserCog, Mail } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { ConvitesList } from '@/components/ConvitesList';

const Medicos = lazy(() => import('./Medicos'));
const Funcionarios = lazy(() => import('./Funcionarios'));

export default function Equipe() {
  const [tab, setTab] = useState('medicos');

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3 mx-auto">
          <TabsTrigger value="medicos" className="gap-2">
            <Stethoscope className="h-4 w-4" />
            Equipe Médica
          </TabsTrigger>
          <TabsTrigger value="funcionarios" className="gap-2">
            <UserCog className="h-4 w-4" />
            Funcionários
          </TabsTrigger>
          <TabsTrigger value="convites" className="gap-2">
            <Mail className="h-4 w-4" />
            Convites
          </TabsTrigger>
        </TabsList>

        <TabsContent value="medicos" className="mt-4">
          <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
            <Medicos />
          </Suspense>
        </TabsContent>

        <TabsContent value="funcionarios" className="mt-4">
          <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
            <Funcionarios />
          </Suspense>
        </TabsContent>

        <TabsContent value="convites" className="mt-4">
          <ConvitesList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
