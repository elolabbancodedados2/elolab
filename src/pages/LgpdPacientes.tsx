import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Search, FileJson, AlertTriangle, Users, LifeBuoy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useBuscaPacientes } from '@/hooks/useBuscaPacientes';
import { LoadingButton } from '@/components/ui/loading-button';
import { ListSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { exportPatientData } from '@/lib/lgpdCompliance';
import { pacienteCorresponde } from '@/lib/buscaPaciente';

type PacienteLGPD = { id: string; nome: string; cpf: string | null; email: string | null };

export default function LgpdPacientes() {
  const [searchTerm, setSearchTerm] = useState('');
  const { data: resultadoBusca, refetch, isLoading, error, isDebouncing } = useBuscaPacientes(searchTerm, {
    limite: 30,
    select: 'id,nome,cpf,email',
  });
  const pacientes = resultadoBusca?.pacientes ?? [];
  const [isProcessing, setIsProcessing] = useState(false);
  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null);

  const filtered = pacientes.filter((p: PacienteLGPD) => {
    // O titular que pede seus dados pela LGPD informa o CPF do próprio
    // documento, sem máscara. Não achá-lo aqui é descumprir prazo legal.
    return pacienteCorresponde(p, searchTerm);
  });

  const handleExport = async (paciente: PacienteLGPD) => {
    setIsProcessing(true);
    setAcaoEmCurso(paciente.id);
    try {
      const data = await exportPatientData(paciente.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lgpd-export-${paciente.nome.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`JSON de ${paciente.nome} preparado`, { description: 'O download foi iniciado. A solicitação segue pendente até a conferência do escopo e a entrega ao titular.' });
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar dados');
    } finally {
      setIsProcessing(false);
      setAcaoEmCurso(null);
    }
  };

  return (
    <div className="space-y-6 p-2 sm:p-6">
      <PageHeader
        title="Direitos do Titular (LGPD)"
        description={searchTerm.trim() && !isLoading && !isDebouncing && !error
          ? `${filtered.length} titular${filtered.length === 1 ? '' : 'es'} encontrado${filtered.length === 1 ? '' : 's'} · Lei 13.709/2018`
          : 'Consultar dados e orientar o atendimento a solicitações do titular (Lei 13.709/2018)'}
        icon={<Shield />}
        actions={(
          <>
            <Button asChild variant="outline" className="gap-2 rounded-full">
              <Link to="/pacientes"><Users aria-hidden="true" className="h-4 w-4" /> Pacientes</Link>
            </Button>
            <Button asChild className="gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
              <Link to="/suporte"><LifeBuoy aria-hidden="true" className="h-4 w-4" /> Solicitar análise ao suporte</Link>
            </Button>
          </>
        )}
      />

      <Alert className="rounded-2xl border-[#BFD8EE] bg-[#F3F8FC]">
        <AlertTriangle className="h-4 w-4 !text-[#1080CA]" />
        <AlertDescription>
          Cada exportação gera um registro de auditoria da clínica antes de preparar o arquivo JSON para download. O pedido continua pendente até a clínica conferir o escopo e confirmar a entrega ao titular. Anexos do prontuário de até 30 MB no total são incluídos no JSON em Base64; arquivos externos e outros documentos vinculados por módulos específicos ainda exigem conferência manual. Confira o escopo antes de responder ao titular. Armazene o arquivo em local seguro e compartilhe apenas com pessoas autorizadas.
          <span className="mt-2 block font-medium">A exclusão de dados não pode ser concluída por esta tela neste momento. Solicite análise ao suporte antes de confirmar o atendimento ao titular.</span>
        </AlertDescription>
      </Alert>

      <Card aria-busy={isLoading || isDebouncing} className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base">Buscar Paciente</CardTitle>
          <CardDescription>Por nome, CPF ou email</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
              aria-label="Buscar paciente por nome, CPF ou e-mail"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Digite nome, CPF ou email..."
              className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
            />
          </div>

          <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
            {(isLoading || isDebouncing) && <ListSkeleton items={4} />}
            {!isLoading && !isDebouncing && error && (
              <ErrorState compact error={error} onRetry={() => refetch()} />
            )}
            {!isLoading && !isDebouncing && !error && !searchTerm && pacientes.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                  <Users className="h-6 w-6" />
                </span>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Nenhum paciente cadastrado ainda. Cadastre uma ficha antes de atender uma solicitação do titular.
                </p>
                <Button asChild className="rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
                  <Link to="/pacientes">Ir para Pacientes</Link>
                </Button>
              </div>
            )}
            {!isLoading && !isDebouncing && !error && searchTerm && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum paciente encontrado para "{searchTerm}". Verifique a grafia ou tente pelo CPF.
              </p>
            )}
            {!isLoading && !isDebouncing && !error && resultadoBusca?.incompleta && (
              <p className="text-xs text-muted-foreground" role="status">
                Há mais de 30 resultados. Refine a busca para localizar outro titular.
              </p>
            )}
            {!isLoading && !isDebouncing && !error && filtered.map((p: PacienteLGPD) => (
              <div
                key={p.id}
                className="flex flex-col gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-[#9CC7EC] hover:bg-[#F3F8FC] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.cpf || 'sem CPF'} {p.email ? ` · ${p.email}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <LoadingButton
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 rounded-full text-xs"
                    onClick={() => handleExport(p)}
                    disabled={isProcessing}
                    isLoading={acaoEmCurso === p.id}
                    loadingText="Exportando..."
                    title="Exportar dados (portabilidade)"
                  >
                    <FileJson aria-hidden="true" className="h-4 w-4" />
                    Exportar
                  </LoadingButton>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
