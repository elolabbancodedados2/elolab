export const TIPOS_DOCUMENTO_RECURSO = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const LIMITE_DOCUMENTO_RECURSO = 10 * 1024 * 1024;

export function validarDocumentoRecurso(arquivo: { name: string; type: string; size: number }): string | null {
  if (!(TIPOS_DOCUMENTO_RECURSO as readonly string[]).includes(arquivo.type)) return 'Envie documentos em PDF, JPEG ou PNG.';
  if (arquivo.size <= 0) return 'O arquivo está vazio.';
  if (arquivo.size > LIMITE_DOCUMENTO_RECURSO) return 'O documento deve ter no máximo 10 MB.';
  return null;
}

/** `<clinica>/<glosa>/<id>-<nome>`: as políticas do bucket conferem os dois primeiros níveis. */
export function caminhoDocumentoRecurso(clinicaId: string, glosaId: string, nome: string, id: string) {
  const seguro = nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^.*[\\/]/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').slice(-120) || 'documento';
  return `${clinicaId}/${glosaId}/${id}-${seguro}`;
}

export type SituacaoPrazoRecurso = 'vencido' | 'vence_em_breve' | 'no_prazo';

export function situacaoPrazoRecurso(prazo: string | null, hoje: string): SituacaoPrazoRecurso | null {
  if (!prazo) return null;
  const dias = (Date.parse(`${prazo}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000;
  if (dias < 0) return 'vencido';
  return dias <= 3 ? 'vence_em_breve' : 'no_prazo';
}
