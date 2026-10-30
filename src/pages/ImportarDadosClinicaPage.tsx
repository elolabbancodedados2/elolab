import { ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ImportadorDePlanilha } from '@/components/importacao/ImportadorDePlanilha';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

export default function ImportarDadosClinicaPage() {
  return <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
    <PageHeader
      title="Importar dados"
      description="Traga pacientes ou agendamentos de outro sistema, confira os vínculos e revise as linhas antes de gravar."
      icon={<FileSpreadsheet />}
      actions={<Button variant="outline" asChild><Link to="/configuracoes?tab=backup"><ArrowLeft className="mr-2 h-4 w-4" />Voltar às configurações</Link></Button>}
    />
    <ImportadorDePlanilha />
  </main>;
}
