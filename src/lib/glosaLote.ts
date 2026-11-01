/**
 * Ações de recurso em várias glosas de uma vez. Cada glosa passa pelas mesmas
 * RPCs da tela individual, uma de cada vez, para que uma falha não esconda as
 * outras: o resultado diz quais deram certo e quais precisam de nova tentativa.
 */

export interface GlosaSelecionavel {
  id: string;
  status: string;
  recurso_justificativa?: string | null;
  recurso_prazo?: string | null;
  recurso_responsavel_id?: string | null;
}

/** Glosas que aceitam preparar (ou revisar) o recurso. */
export const podePrepararRecurso = (glosa: GlosaSelecionavel) => ['pendente', 'recurso_preparacao'].includes(glosa.status);

/** Glosas prontas para "marcar enviado": em preparação, com justificativa, prazo e responsável. */
export const prontaParaEnvio = (glosa: GlosaSelecionavel) => glosa.status === 'recurso_preparacao'
  && String(glosa.recurso_justificativa ?? '').trim().length >= 10 && !!glosa.recurso_prazo && !!glosa.recurso_responsavel_id;

export interface ResultadoLote { concluidas: string[]; falhas: { id: string; erro: unknown }[] }

export async function executarEmSequencia(ids: ReadonlyArray<string>, acao: (id: string) => Promise<void>): Promise<ResultadoLote> {
  const resultado: ResultadoLote = { concluidas: [], falhas: [] };
  for (const id of ids) {
    try {
      await acao(id);
      resultado.concluidas.push(id);
    } catch (erro) {
      resultado.falhas.push({ id, erro });
    }
  }
  return resultado;
}
