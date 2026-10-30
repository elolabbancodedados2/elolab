import { situacaoPrazoRecurso } from '@/lib/recursoGlosa';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

export interface DocumentoRecurso { id: string; glosa_id: string; storage_path: string; file_name: string; created_at: string }

const ROTULO_PRAZO = {
  vencido: { texto: 'Prazo vencido', className: 'text-destructive' },
  vence_em_breve: { texto: 'Vence em até 3 dias', className: 'text-warning-foreground' },
  no_prazo: { texto: 'No prazo', className: 'text-muted-foreground' },
} as const;

/** Prazo, responsável e quantidade de anexos exibidos junto à linha da glosa. */
export function ResumoRecurso({ glosa, responsavel, documentos }: {
  glosa: { status: string; recurso_prazo: string | null };
  responsavel?: string | null;
  documentos: number;
}) {
  if (!glosa.recurso_prazo && !responsavel && documentos === 0) return null;
  const situacao = ['pendente', 'recurso_preparacao'].includes(glosa.status)
    ? situacaoPrazoRecurso(glosa.recurso_prazo, todaySaoPauloDateOnly()) : null;
  return <p className="mt-1 text-xs text-muted-foreground">
    {glosa.recurso_prazo && <>Prazo {glosa.recurso_prazo.split('-').reverse().join('/')}{situacao && <span className={`ml-1 font-medium ${ROTULO_PRAZO[situacao].className}`}>({ROTULO_PRAZO[situacao].texto})</span>} · </>}
    {responsavel && <>Responsável: {responsavel} · </>}
    {documentos} documento(s)
  </p>;
}
