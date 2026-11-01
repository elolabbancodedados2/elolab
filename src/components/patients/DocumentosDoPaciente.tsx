import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { autorizarLeituraHistoricoPaciente } from '@/lib/prontuarioAudit';
import { formatDateTimeSaoPaulo } from '@/lib/dateOnly';

interface Props {
  pacienteId: string;
  /** Anexos clínicos seguem a regra do prontuário: admin e médico. */
  podeVerDocumentosClinicos: boolean;
}

const CATEGORIA: Record<string, string> = {
  exame: 'Exame', laudo: 'Laudo', imagem: 'Imagem médica', receita: 'Receita',
  atestado: 'Atestado', documento: 'Documento', outro: 'Outro',
};

/** Aba "Documentos": os arquivos anexados aos atendimentos deste paciente. */
export function DocumentosDoPaciente({ pacienteId, podeVerDocumentosClinicos }: Props) {
  const { profile } = useSupabaseAuth();
  const consulta = useQuery({
    queryKey: ['documentos-paciente', profile?.clinica_id ?? null, pacienteId],
    enabled: podeVerDocumentosClinicos && Boolean(profile?.clinica_id),
    queryFn: async () => {
      // Mesma trilha do histórico clínico: ler anexos é ler o prontuário.
      await autorizarLeituraHistoricoPaciente(pacienteId);
      const { data, error } = await (supabase as any)
        .from('anexos_prontuario')
        .select('id, nome_arquivo, categoria, tipo_arquivo, created_at, prontuario_id')
        .eq('paciente_id', pacienteId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome_arquivo: string | null; categoria: string | null; tipo_arquivo: string | null; created_at: string; prontuario_id: string }>;
    },
  });

  return (
    <section aria-labelledby="documentos-paciente-titulo" className="space-y-3">
      <h3 id="documentos-paciente-titulo" className="flex items-center gap-2 text-sm font-semibold">
        <FileText aria-hidden="true" className="h-4 w-4" />Documentos anexados
      </h3>
      {!podeVerDocumentosClinicos ? (
        <p className="text-sm text-muted-foreground">Os documentos clínicos ficam disponíveis para médicos e administradores.</p>
      ) : consulta.isLoading ? (
        <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-14" />)}</div>
      ) : consulta.error ? (
        <ErrorState compact title="Não foi possível carregar os documentos" error={consulta.error} onRetry={() => { void consulta.refetch(); }} />
      ) : !consulta.data?.length ? (
        <p className="text-sm text-muted-foreground">Nenhum documento anexado aos atendimentos deste paciente.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {consulta.data.map(doc => (
            <li key={doc.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{doc.nome_arquivo || 'Documento'}</p>
                <p className="text-xs text-muted-foreground">
                  <Badge variant="outline" className="mr-2 text-[11px]">{CATEGORIA[doc.categoria ?? ''] ?? 'Documento'}</Badge>
                  {formatDateTimeSaoPaulo(doc.created_at)}
                </p>
              </div>
              <Button asChild variant="outline" className="h-11 shrink-0 gap-1.5">
                <Link to={`/prontuarios/${encodeURIComponent(doc.prontuario_id)}/anexos/${encodeURIComponent(doc.id)}/visualizar`}>
                  <ExternalLink aria-hidden="true" className="h-4 w-4" />Abrir
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
