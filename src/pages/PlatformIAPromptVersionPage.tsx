import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bot, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

type PromptVersion = { id: string; versao: number; prompt: string; modelo: string; criado_por: string | null; created_at: string };

function formatDate(value: string | null | undefined) {
  if (!value) return 'Data indisponível';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

export default function PlatformIAPromptVersionPage() {
  const { versionId } = useParams();
  const version = useQuery({
    queryKey: ['platform-ai-prompt-version', versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_ai_prompt_versions')
        .select('id,versao,prompt,modelo,criado_por,created_at')
        .eq('id', versionId)
        .maybeSingle();
      if (error) throw error;
      return data as PromptVersion | null;
    },
  });

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 pb-24 sm:px-6 md:pb-6">
      <PageHeader
        title={version.data ? `Prompt da versão ${version.data.versao}` : 'Versão do prompt'}
        description={version.data ? `${version.data.modelo} · Publicada em ${formatDate(version.data.created_at)}` : 'Histórico somente de leitura da configuração da IA.'}
        icon={<Bot />}
        actions={<Button asChild variant="outline" className="gap-2"><Link to="/admin/ia"><ArrowLeft className="h-4 w-4" />Voltar à IA</Link></Button>}
      />

      {version.isLoading && <div role="status" className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full rounded-xl" /></div>}
      {version.isError && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o prompt</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            A versão não foi alterada. Verifique a conexão e tente novamente.
            <Button type="button" variant="outline" size="sm" onClick={() => void version.refetch()} className="gap-2"><RefreshCw className="h-4 w-4" />Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      )}
      {!version.isLoading && !version.isError && !version.data && (
        <Alert>
          <AlertTitle>Versão não encontrada</AlertTitle>
          <AlertDescription>Esta versão não está disponível no histórico da plataforma.</AlertDescription>
        </Alert>
      )}
      {version.data && (
        <Card>
          <CardHeader><CardTitle className="text-base">Prompt completo · somente leitura</CardTitle></CardHeader>
          <CardContent>
            <pre className="max-w-full whitespace-pre-wrap break-words rounded-xl border border-border bg-background p-4 text-sm leading-6 text-foreground sm:p-6">{version.data.prompt}</pre>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
