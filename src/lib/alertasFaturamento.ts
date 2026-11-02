/**
 * Prazos do faturamento de convênios que precisam de atenção agora:
 * recursos de glosa vencendo, autorizações perto do fim da validade e lotes
 * de competências passadas ainda em rascunho. Cada alerta já traz os dados
 * para virar tarefa na tela de Tarefas.
 */
import { classificarAutorizacoes, type AutorizacaoFila } from '@/lib/autorizacaoConvenio';
import { situacaoPrazoRecurso } from '@/lib/recursoGlosa';
import { formatarCompetencia, formatarDataCurta } from '@/lib/tissStatus';

export interface GlosaAlerta { id: string; status: string; codigo_glosa: string; recurso_prazo: string | null; lotes_tiss?: { numero_lote?: string | null } | null }
export interface LoteAlerta { id: string; status: string; numero_lote: string; competencia: string; convenios?: { nome?: string | null } | null }
export interface AutorizacaoAlerta extends AutorizacaoFila { numero_autorizacao?: string | null; paciente_nome?: string | null }

export interface AlertaFaturamento {
  id: string;
  gravidade: 'erro' | 'aviso';
  texto: string;
  tarefa: { titulo: string; descricao: string; data_vencimento: string; prioridade: 'alta' | 'urgente'; categoria: 'Financeiro' };
}

export function alertasFaturamento(dados: {
  glosas: ReadonlyArray<GlosaAlerta>;
  lotes: ReadonlyArray<LoteAlerta>;
  autorizacoes: ReadonlyArray<AutorizacaoAlerta>;
  hoje: string;
}): AlertaFaturamento[] {
  const alertas: AlertaFaturamento[] = [];
  for (const glosa of dados.glosas) {
    if (!['pendente', 'recurso_preparacao'].includes(glosa.status)) continue;
    const situacao = situacaoPrazoRecurso(glosa.recurso_prazo, dados.hoje);
    if (situacao !== 'vencido' && situacao !== 'vence_em_breve') continue;
    const prazo = formatarDataCurta(glosa.recurso_prazo);
    const lote = glosa.lotes_tiss?.numero_lote ? ` do lote ${glosa.lotes_tiss.numero_lote}` : '';
    alertas.push({
      id: `glosa-${glosa.id}`,
      gravidade: situacao === 'vencido' ? 'erro' : 'aviso',
      texto: situacao === 'vencido'
        ? `Recurso da glosa ${glosa.codigo_glosa}${lote} venceu em ${prazo}.`
        : `Recurso da glosa ${glosa.codigo_glosa}${lote} vence em ${prazo}.`,
      tarefa: {
        titulo: `Enviar recurso da glosa ${glosa.codigo_glosa}${lote}`,
        descricao: `Prazo do recurso: ${prazo}. Prepare a justificativa e registre o envio no Faturamento de convênios.`,
        data_vencimento: glosa.recurso_prazo ?? dados.hoje,
        prioridade: situacao === 'vencido' ? 'urgente' : 'alta',
        categoria: 'Financeiro',
      },
    });
  }
  const fila = classificarAutorizacoes(dados.autorizacoes, dados.hoje);
  for (const item of fila.vencendo) {
    const validade = formatarDataCurta(item.data_expiracao);
    const quem = item.paciente_nome ? ` de ${item.paciente_nome}` : '';
    alertas.push({
      id: `autorizacao-${item.id}`,
      gravidade: 'aviso',
      texto: `Autorização ${item.numero_autorizacao || 'sem senha'}${quem} vence em ${validade}.`,
      tarefa: {
        titulo: `Usar ou renovar a autorização${quem}`,
        descricao: `A senha ${item.numero_autorizacao || '(sem número)'} vale até ${validade}.`,
        data_vencimento: (item.data_expiracao ?? dados.hoje).slice(0, 10),
        prioridade: 'alta',
        categoria: 'Financeiro',
      },
    });
  }
  const mesAtual = dados.hoje.slice(0, 7);
  for (const lote of dados.lotes) {
    if (lote.status !== 'rascunho' || lote.competencia.slice(0, 7) >= mesAtual) continue;
    const competencia = formatarCompetencia(lote.competencia);
    alertas.push({
      id: `lote-${lote.id}`,
      gravidade: 'aviso',
      texto: `Lote ${lote.numero_lote} (${competencia}) ainda está em rascunho.`,
      tarefa: {
        titulo: `Enviar o lote ${lote.numero_lote} de ${competencia}`,
        descricao: `Lote${lote.convenios?.nome ? ` do ${lote.convenios.nome}` : ''} ainda não foi enviado à operadora.`,
        data_vencimento: dados.hoje,
        prioridade: 'alta',
        categoria: 'Financeiro',
      },
    });
  }
  return alertas.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === 'erro' ? -1 : 1));
}
