 /**
  * LGPD Compliance Module
  * Lei Geral de Proteção de Dados (Brasil)
  * Direitos: acesso, portabilidade, exclusão, correção
  */

import { friendlyErrorMessage } from '@/components/ErrorState';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { buscarTodasAsPaginas } from '@/lib/prontuarioAuditExport';

/**
 * As tabelas lgpd_* ainda não constam no types.ts gerado. Usamos este alias em
 * vez de @ts-nocheck no arquivo inteiro, para que o resto do módulo continue
 * verificado pelo TypeScript.
 *
 * Elas passaram a existir em 20260729140000_tabelas_lgpd_de_verdade.sql. Antes
 * dessa migration não existiam, e como o supabase-js não lança em erro de API,
 * cada gravação daqui falhava em silêncio. A migration antiga citada no
 * comentário anterior (20260414140000) nunca foi aplicada.
 */
const db = supabase as any;
const lgpdAuditRpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, string>) => Promise<{ error: { message: string } | null }>;
};

export interface PatientDataExport {
  [key: string]: unknown;
  paciente: Record<string, unknown>;
  agendamentos: Array<Record<string, unknown>>;
  prontuarios: Array<Record<string, unknown>>;
  prescricoes: Array<Record<string, unknown>>;
  memed_prescricoes: Array<Record<string, unknown>>;
  exames: Array<Record<string, unknown>>;
  triagens: Array<Record<string, unknown>>;
  atestados: Array<Record<string, unknown>>;
  encaminhamentos: Array<Record<string, unknown>>;
  lancamentos: Array<Record<string, unknown>>;
  retornos: Array<Record<string, unknown>>;
  lista_espera: Array<Record<string, unknown>>;
  paciente_comorbidades: Array<Record<string, unknown>>;
  prontuario_adendos: Array<Record<string, unknown>>;
  lgpd_access_request_log: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  audit_log: Array<Record<string, unknown>>;
  consent_log: Array<Record<string, unknown>>;
  consentimentos_lgpd: Array<Record<string, unknown>>;
  pedidos_laboratorio: Array<Record<string, unknown>>;
  coletas_laboratorio: Array<Record<string, unknown>>;
  resultados_laboratorio: Array<Record<string, unknown>>;
  prontuario_diagnosticos: Array<Record<string, unknown>>;
  prontuario_acessos: Array<Record<string, unknown>>;
  prontuario_assinaturas: Array<Record<string, unknown>>;
  guias_externas: Array<Record<string, unknown>>;
  whatsapp_conversations: Array<Record<string, unknown>>;
  whatsapp_messages: Array<Record<string, unknown>>;
  whatsapp_agent_actions: Array<Record<string, unknown>>;
  pagamentos_mercadopago: Array<Record<string, unknown>>;
  pagamentos: Array<Record<string, unknown>>;
  assinaturas_mercadopago: Array<Record<string, unknown>>;
  paciente_portal_tokens: Array<Record<string, unknown>>;
  interoperability_exports: Array<Record<string, unknown>>;
  tarefas: Array<Record<string, unknown>>;
  retornos_agendados: Array<Record<string, unknown>>;
  notificacoes_agendadas: Array<Record<string, unknown>>;
  notas_fiscais: Array<Record<string, unknown>>;
  autorizacoes_convenio: Array<Record<string, unknown>>;
  avaliacoes_atendimento: Array<Record<string, unknown>>;
  vitais_historico: Array<Record<string, unknown>>;
  predicoes_no_show: Array<Record<string, unknown>>;
  feedbacks_nps: Array<Record<string, unknown>>;
  lancamento_itens: Array<Record<string, unknown>>;
  movimentacoes_estoque: Array<Record<string, unknown>>;
  fila_atendimento: Array<Record<string, unknown>>;
}

/** Categorias que o titular pode pedir; precisam coincidir com o CHECK da migration. */
export const ESCOPOS_EXPORTACAO_LGPD = [
  { id: 'cadastro', rotulo: 'Cadastro e consentimentos', chaves: ['paciente', 'consentimentos_lgpd', 'consent_log', 'lgpd_access_request_log', 'paciente_portal_tokens'] },
  { id: 'agenda', rotulo: 'Agenda, fila e retornos', chaves: ['agendamentos', 'retornos', 'retornos_agendados', 'lista_espera', 'fila_atendimento', 'notificacoes_agendadas', 'tarefas', 'avaliacoes_atendimento', 'feedbacks_nps', 'predicoes_no_show'] },
  { id: 'clinico', rotulo: 'Prontuário, documentos e exames', chaves: ['prontuarios', 'prontuario_adendos', 'prontuario_diagnosticos', 'prontuario_acessos', 'prontuario_assinaturas', 'prescricoes', 'memed_prescricoes', 'exames', 'triagens', 'atestados', 'encaminhamentos', 'paciente_comorbidades', 'vitais_historico', 'pedidos_laboratorio', 'coletas_laboratorio', 'resultados_laboratorio', 'guias_externas', 'movimentacoes_estoque', 'interoperability_exports'] },
  { id: 'anexos', rotulo: 'Arquivos anexos do prontuário', chaves: ['attachments'] },
  { id: 'financeiro', rotulo: 'Financeiro e convênio', chaves: ['lancamentos', 'lancamento_itens', 'pagamentos', 'pagamentos_mercadopago', 'assinaturas_mercadopago', 'notas_fiscais', 'autorizacoes_convenio'] },
  { id: 'comunicacao', rotulo: 'Conversas de WhatsApp', chaves: ['whatsapp_conversations', 'whatsapp_messages', 'whatsapp_agent_actions'] },
  { id: 'auditoria', rotulo: 'Trilha de auditoria', chaves: ['audit_log'] },
] as const;

export type EscopoExportacaoLgpd = typeof ESCOPOS_EXPORTACAO_LGPD[number]['id'];

/** Mantém só categorias conhecidas, em ordem fixa; cadastro é sempre incluído. Sem escolha = tudo. */
export function normalizarEscopoExportacao(escopo?: readonly string[]): EscopoExportacaoLgpd[] {
  if (!escopo) return ESCOPOS_EXPORTACAO_LGPD.map(e => e.id);
  return ESCOPOS_EXPORTACAO_LGPD.map(e => e.id).filter(id => id === 'cadastro' || escopo.includes(id));
}

export function filtrarEscopoExportacao<T extends Record<string, unknown>>(pacote: T, escopo?: readonly string[]): Partial<T> {
  const permitidas = new Set<string>(ESCOPOS_EXPORTACAO_LGPD
    .filter(e => normalizarEscopoExportacao(escopo).includes(e.id))
    .flatMap(e => [...e.chaves]));
  return Object.fromEntries(Object.entries(pacote).filter(([chave]) => permitidas.has(chave))) as Partial<T>;
}

export async function concluirExportacaoLgpd(pedidoId: string, evidencia: string): Promise<{ protocolo: string }> {
  const { data, error } = await supabase.rpc('concluir_exportacao_lgpd_paciente', { p_id: pedidoId, p_evidencia: evidencia.trim() });
  if (error) throw error;
  const resultado = data as { protocolo?: string; status?: string } | null;
  if (resultado?.status !== 'fulfilled' || !resultado.protocolo) throw new Error('O servidor não confirmou a conclusão do pedido.');
  return { protocolo: resultado.protocolo };
}

const MAX_ATTACHMENT_EXPORT_BYTES = 30 * 1024 * 1024;

function storagePathForPatientAttachment(stored: string): string {
  if (!stored.startsWith('http')) return stored;
  const marker = '/storage/v1/object/';
  const markerIndex = stored.indexOf(marker);
  if (markerIndex < 0) throw new Error('O anexo aponta para um armazenamento externo e não pode ser incluído automaticamente.');
  const objectPath = stored.slice(markerIndex + marker.length).split('?')[0];
  const bucketMarker = 'medical-attachments/';
  const bucketIndex = objectPath.indexOf(bucketMarker);
  if (bucketIndex < 0) throw new Error('Não foi possível identificar o caminho privado do anexo.');
  return decodeURIComponent(objectPath.slice(bucketIndex + bucketMarker.length));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/**
 * Exportar todos os dados de um paciente (direito à portabilidade)
 */
export async function exportPatientData(pacienteId: string, escopo?: readonly string[]): Promise<PatientDataExport> {
  const escopoFinal = normalizarEscopoExportacao(escopo);
  try {
    const { data: paciente, error: pacienteError } = await supabase
      .from('pacientes')
      .select('*')
      .eq('id', pacienteId)
      .single();
    if (pacienteError) throw pacienteError;

    const { data: pedidoExportacao, error: erroPedidoExportacao } = await db
      .from('lgpd_access_request_log')
      .insert({ paciente_id: pacienteId, request_type: 'export', status: 'pending', escopo: escopoFinal })
      .select('id,requested_at,protocolo')
      .single();
    if (erroPedidoExportacao || !pedidoExportacao?.id) {
      throw new Error(
        `Não foi possível registrar o pedido de exportação; o arquivo não foi gerado${erroPedidoExportacao ? `: ${friendlyErrorMessage(erroPedidoExportacao, 'erro do servidor')}` : '.'}`
      );
    }

    // Signed charts/files require an explicit audit event before their RLS
    // policies allow a read. Never synthesize a visualizacao event for export.
    const { error: erroAuditoriaExportacao } = await lgpdAuditRpc.rpc('registrar_exportacao_lgpd_paciente', {
      p_paciente_id: pacienteId,
    });
    if (erroAuditoriaExportacao) {
      throw new Error(`Não foi possível registrar o acesso clínico da exportação: ${erroAuditoriaExportacao.message}`);
    }

    const data = { paciente } as unknown as PatientDataExport;
    const buscar = async (chave: string, tabela: string, coluna: string, campos = '*') => {
      try {
        const registros = await buscarTodasAsPaginas((inicio, fim) => db
          .from(tabela)
          .select(campos)
          .eq(coluna, pacienteId)
          .order('id', { ascending: true })
          .range(inicio, fim));
        data[chave] = registros;
        return registros;
      } catch (error) {
        throw new Error(`Falha ao exportar ${chave}: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      }
    };

    const buscarEmLotes = async (consultas: Array<[string, string, string, string?]>) => {
      const tamanhoLote = 5;
      for (let inicio = 0; inicio < consultas.length; inicio += tamanhoLote) {
        const lote = consultas.slice(inicio, inicio + tamanhoLote);
        await Promise.all(lote.map(([chave, tabela, coluna, campos]) => buscar(chave, tabela, coluna, campos)));
      }
    };

    await buscarEmLotes([
      ['agendamentos', 'agendamentos', 'paciente_id'],
      ['prontuarios', 'prontuarios', 'paciente_id'],
      ['triagens', 'triagens', 'paciente_id'],
      ['atestados', 'atestados', 'paciente_id'],
      ['encaminhamentos', 'encaminhamentos', 'paciente_id'],
      ['lancamentos', 'lancamentos', 'paciente_id'],
      ['retornos', 'retornos', 'paciente_id'],
      ['lista_espera', 'lista_espera', 'paciente_id'],
      ['paciente_comorbidades', 'paciente_comorbidades', 'paciente_id'],
      ['consentimentos_lgpd', 'consentimentos_lgpd', 'paciente_id',
        'id,paciente_id,tipo_consentimento,versao_termo,aceito,data_aceite,ip_aceite,revogado,data_revogacao,motivo_revogacao,documento_assinado_url,created_at,updated_at'],
      ['pedidos_laboratorio', 'pedidos_laboratorio', 'paciente_id'],
      ['coletas_laboratorio', 'coletas_laboratorio', 'paciente_id'],
      ['resultados_laboratorio', 'resultados_laboratorio', 'paciente_id'],
      ['guias_externas', 'guias_externas', 'paciente_id',
        'id,clinica_id,origem,status,paciente_id,paciente_nome,paciente_cpf,paciente_nascimento,paciente_telefone,paciente_email,paciente_sexo,medico_externo_nome,medico_externo_crm,medico_externo_uf,medico_externo_especialidade,medico_externo_contato,convenio_id,convenio_nome,numero_autorizacao,validade_autorizacao,exames_solicitados,observacoes,anexo_nome,data_recebimento,data_agendamento,hora_agendamento,agendamento_id,registrado_por,created_at,updated_at'],
      ['autorizacoes_convenio', 'autorizacoes_convenio', 'paciente_id'],
      ['retornos_agendados', 'retornos_agendados', 'paciente_id'],
      ['notificacoes_agendadas', 'notificacoes_agendadas', 'paciente_id',
        'id,paciente_id,tipo,conteudo,data_envio,status,tentativas,created_at'],
      ['notas_fiscais', 'notas_fiscais', 'paciente_id',
        'id,numero_nf,serie_nf,lancamento_id,paciente_id,valor,xml_nfe,status,data_emissao,data_autorizacao,created_at'],
      ['avaliacoes_atendimento', 'avaliacoes_atendimento', 'paciente_id'],
      ['vitais_historico', 'vitais_historico', 'paciente_id'],
      ['predicoes_no_show', 'predicoes_no_show', 'paciente_id'],
      ['feedbacks_nps', 'feedbacks_nps', 'paciente_id'],
      ['tarefas', 'tarefas', 'paciente_id'],
      ['interoperability_exports', 'interoperability_exports', 'paciente_id',
        'id,clinica_id,paciente_id,formato,quantidade_recursos,exportado_por,created_at'],
      ['pagamentos_mercadopago', 'pagamentos_mercadopago', 'paciente_id',
        'id,lancamento_id,paciente_id,agendamento_id,mp_payment_id,mp_preference_id,mp_external_reference,valor,valor_pago,moeda,status,tipo,metodo_pagamento,data_criacao,data_aprovacao,data_vencimento,data_expiracao,descricao,parcelas,created_at,updated_at'],
      ['assinaturas_mercadopago', 'assinaturas_mercadopago', 'paciente_id',
        'id,paciente_id,mp_preapproval_id,mp_plan_id,nome_plano,descricao,valor,frequencia,dia_cobranca,status,data_inicio,data_fim,proximo_pagamento,created_at,updated_at'],
      ['paciente_portal_tokens', 'paciente_portal_tokens', 'paciente_id',
        'id,paciente_id,ativo,ultimo_acesso,created_at,expires_at'],
    ]);
    const agendamentos = data.agendamentos as Array<{ id: string }>;
    const prontuarios = data.prontuarios as Array<{ id: string }>;
    const lancamentos = data.lancamentos as Array<{ id: string }>;
    const prontuarioIds = (prontuarios as Array<{ id: string }>).map((p) => p.id);
    data.exames = await buscarTodasAsPaginas((inicio, fim) => {
      let query = db.from('exames').select('*');
      query = prontuarioIds.length > 0
        ? query.or(`paciente_id.eq.${pacienteId},prontuario_id.in.(${prontuarioIds.join(',')})`)
        : query.eq('paciente_id', pacienteId);
      return query.order('id', { ascending: true }).range(inicio, fim);
    });

    // Memed prescriptions are service-role-only; retrieve them through a
    // clinic-scoped Edge Function instead of weakening table RLS for the browser.
    const { data: memedExport, error: memedExportError } = await supabase.functions.invoke(
      'patient-lgpd-memed-export',
      { body: { pacienteId } },
    );
    if (memedExportError || !Array.isArray(memedExport?.memed_prescricoes)) {
      throw new Error(`Falha ao exportar prescrições Memed${memedExportError?.message ? `: ${memedExportError.message}` : '.'}`);
    }
    data.memed_prescricoes = memedExport.memed_prescricoes as Array<Record<string, unknown>>;
    const lancamentoIds = (lancamentos as Array<{ id: string }>).map((lancamento) => lancamento.id);
    if (lancamentoIds.length > 0) {
      data.lancamento_itens = await buscarTodasAsPaginas((inicio, fim) => db
        .from('lancamento_itens').select('*').in('lancamento_id', lancamentoIds)
        .order('id', { ascending: true }).range(inicio, fim));
      data.pagamentos = await buscarTodasAsPaginas((inicio, fim) => db.from('pagamentos')
        .select('id,lancamento_id,forma_pagamento,valor,parcelas,data_pagamento,observacoes,estornado_em,motivo_estorno,created_at')
        .in('lancamento_id', lancamentoIds).order('id', { ascending: true }).range(inicio, fim));
    } else data.lancamento_itens = [];
    const agendamentoIds = (agendamentos as Array<{ id: string }>).map((agendamento) => agendamento.id);
    if (lancamentoIds.length === 0) data.pagamentos = [];
    if (agendamentoIds.length > 0) {
      data.fila_atendimento = await buscarTodasAsPaginas((inicio, fim) => db.from('fila_atendimento')
        .select('*').in('agendamento_id', agendamentoIds)
        .order('id', { ascending: true }).range(inicio, fim));
    } else data.fila_atendimento = [];
    const pagamentosMp = data.pagamentos_mercadopago as Array<Record<string, unknown>>;
    if (lancamentoIds.length > 0 || agendamentoIds.length > 0) {
      const filtrosPagamento = [
        ...(lancamentoIds.length > 0 ? [`lancamento_id.in.(${lancamentoIds.join(',')})`] : []),
        ...(agendamentoIds.length > 0 ? [`agendamento_id.in.(${agendamentoIds.join(',')})`] : []),
      ];
      const pagamentosRelacionados = await buscarTodasAsPaginas((inicio, fim) => db
        .from('pagamentos_mercadopago')
        .select('id,lancamento_id,paciente_id,agendamento_id,mp_payment_id,mp_preference_id,mp_external_reference,valor,valor_pago,moeda,status,tipo,metodo_pagamento,data_criacao,data_aprovacao,data_vencimento,data_expiracao,descricao,parcelas,created_at,updated_at')
        .or(filtrosPagamento.join(',')).order('id', { ascending: true }).range(inicio, fim));
      const idsPagamento = new Set(pagamentosMp.map((pagamento) => pagamento.id));
      for (const pagamento of pagamentosRelacionados as Array<Record<string, unknown>>) {
        if (!idsPagamento.has(pagamento.id)) pagamentosMp.push(pagamento);
      }
    }

    const buscarPorProntuarios = async (chave: string, tabela: string) => {
      if (prontuarioIds.length === 0) {
        data[chave] = [];
        return;
      }
      data[chave] = await buscarTodasAsPaginas((inicio, fim) => db
        .from(tabela).select('*').in('prontuario_id', prontuarioIds)
        .order('id', { ascending: true }).range(inicio, fim));
    };
    data.prescricoes = await buscarTodasAsPaginas((inicio, fim) => {
      let query = db.from('prescricoes').select('*');
      query = prontuarioIds.length > 0
        ? query.or(`paciente_id.eq.${pacienteId},prontuario_id.in.(${prontuarioIds.join(',')})`)
        : query.eq('paciente_id', pacienteId);
      return query.order('id', { ascending: true }).range(inicio, fim);
    });
    const anexos = await buscarTodasAsPaginas((inicio, fim) => {
      let query = db.from('anexos_prontuario').select('*');
      query = prontuarioIds.length > 0
        ? query.or(`paciente_id.eq.${pacienteId},prontuario_id.in.(${prontuarioIds.join(',')})`)
        : query.eq('paciente_id', pacienteId);
      return query.order('id', { ascending: true }).range(inicio, fim);
    });
    const prontuariosComAnexoAssinado = [...new Set((anexos as Array<{ prontuario_id?: string | null }>)
      .map((anexo) => anexo.prontuario_id).filter((id): id is string => Boolean(id)))];
    if (prontuariosComAnexoAssinado.length > 0) {
      const { error: erroAuditoriaArquivos } = await lgpdAuditRpc.rpc('registrar_exportacao_lgpd_paciente', {
        p_paciente_id: pacienteId,
      });
      if (erroAuditoriaArquivos) {
        throw new Error(`Não foi possível renovar a autorização auditada dos anexos: ${erroAuditoriaArquivos.message}`);
      }
    }
    const anexosComConteudo: Array<Record<string, unknown>> = [];
    let totalAttachmentBytes = 0;
    // Sem a categoria de anexos, nenhum arquivo é baixado do Storage.
    for (const anexo of (escopoFinal.includes('anexos') ? anexos || [] : []) as Array<Record<string, unknown>>) {
      const storedPath = String(anexo.url_arquivo || '');
      if (!storedPath) throw new Error(`O anexo ${String(anexo.nome_arquivo || anexo.id)} não possui caminho de arquivo.`);
      const path = storagePathForPatientAttachment(storedPath);
      const { data: arquivo, error: erroArquivo } = await supabase.storage
        .from('medical-attachments')
        .download(path);
      if (erroArquivo || !arquivo) {
        throw new Error(`Falha ao incluir o anexo "${String(anexo.nome_arquivo || anexo.id)}" na exportação${erroArquivo?.message ? `: ${erroArquivo.message}` : '.'}`);
      }
      totalAttachmentBytes += arquivo.size;
      if (totalAttachmentBytes > MAX_ATTACHMENT_EXPORT_BYTES) {
        throw new Error('Os anexos ultrapassam 30 MB. A exportação foi interrompida para evitar um arquivo incompleto; solicite a preparação assistida ao suporte.');
      }
      const { url_arquivo: _caminhoInterno, ...metadados } = anexo;
      anexosComConteudo.push({
        ...metadados,
        nome_arquivo: anexo.nome_arquivo,
        tipo_arquivo: anexo.tipo_arquivo || arquivo.type || 'application/octet-stream',
        tamanho_bytes: arquivo.size,
        conteudo_base64: bytesToBase64(new Uint8Array(await arquivo.arrayBuffer())),
      });
    }
    data.attachments = anexosComConteudo;
    await buscarPorProntuarios('prontuario_adendos', 'prontuario_adendos');
    await buscarPorProntuarios('prontuario_diagnosticos', 'prontuario_diagnosticos');
    await buscarPorProntuarios('prontuario_assinaturas', 'prontuario_assinaturas');
    await buscarPorProntuarios('movimentacoes_estoque', 'movimentacoes_estoque');
    if (prontuarioIds.length > 0) {
      data.prontuario_acessos = await buscarTodasAsPaginas((inicio, fim) => db
        .from('prontuario_acessos').select('*')
        .or(`paciente_id.eq.${pacienteId},prontuario_id.in.(${prontuarioIds.join(',')})`)
        .order('id', { ascending: true }).range(inicio, fim));
    } else {
      await buscar('prontuario_acessos', 'prontuario_acessos', 'paciente_id');
    }

    const whatsappConversations = await buscar('whatsapp_conversations', 'whatsapp_conversations', 'paciente_id',
      'id,paciente_id,remote_jid,status,ultima_mensagem_at,created_at,updated_at');
    const whatsappConversationIds = (whatsappConversations as Array<{ id: string }>).map((conversation) => conversation.id);
    if (whatsappConversationIds.length > 0) {
      data.whatsapp_messages = await buscarTodasAsPaginas((inicio, fim) => db.from('whatsapp_messages')
        .select('id,conversation_id,message_id,direcao,tipo,conteudo,status,created_at')
        .in('conversation_id', whatsappConversationIds).order('id', { ascending: true }).range(inicio, fim));
      data.whatsapp_agent_actions = await buscarTodasAsPaginas((inicio, fim) => db.from('whatsapp_agent_actions')
        .select('id,conversation_id,tipo_acao,dados_entrada,dados_saida,sucesso,erro_mensagem,duracao_ms,created_at')
        .in('conversation_id', whatsappConversationIds).order('id', { ascending: true }).range(inicio, fim));
    } else {
      data.whatsapp_messages = [];
      data.whatsapp_agent_actions = [];
    }
    if (agendamentoIds.length > 0) {
      const avaliacoesAgendamento = await buscarTodasAsPaginas((inicio, fim) => db.from('feedbacks_nps')
        .select('*').in('agendamento_id', agendamentoIds)
        .order('id', { ascending: true }).range(inicio, fim));
      const nps = data.feedbacks_nps as Array<Record<string, unknown>>;
      const npsIds = new Set(nps.map((item) => item.id));
      for (const avaliacao of avaliacoesAgendamento as Array<Record<string, unknown>>) {
        if (!npsIds.has(avaliacao.id)) nps.push(avaliacao);
      }
    }

    // Include audit events for the patient and the related records in this export.
    const relatedRecordIds = [...new Set([
      pacienteId,
      ...agendamentoIds,
      ...prontuarioIds,
      ...lancamentoIds,
      ...(data.exames as Array<{ id: string }>).map((item) => item.id),
      ...(data.prescricoes as Array<{ id: string }>).map((item) => item.id),
      ...(data.attachments as Array<{ id: string }>).map((item) => item.id),
    ])];
    const auditRows: Array<Record<string, unknown>> = [];
    for (let start = 0; start < relatedRecordIds.length; start += 100) {
      const batchIds = relatedRecordIds.slice(start, start + 100);
      const auditBatch = await buscarTodasAsPaginas((inicio, fim) => supabase
        .from('audit_log').select('*').in('record_id', batchIds)
        .order('id', { ascending: true }).range(inicio, fim));
      auditRows.push(...auditBatch as Array<Record<string, unknown>>);
    }
    data.audit_log = [...new Map(auditRows.map((item) => [item.id, item])).values()];

    // Consentimentos LGPD
    data.consent_log = await buscarTodasAsPaginas((inicio, fim) => db
      .from('lgpd_consent_log').select('*').eq('paciente_id', pacienteId)
      .order('id', { ascending: true }).range(inicio, fim));
    data.lgpd_access_request_log = await buscarTodasAsPaginas((inicio, fim) => db
      .from('lgpd_access_request_log').select('*').eq('paciente_id', pacienteId)
      .order('id', { ascending: true }).range(inicio, fim));

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user?.id) {
      throw new Error('Não foi possível identificar o responsável; o arquivo não foi gerado. O pedido segue registrado para análise.');
    }

    const preparadoEm = new Date().toISOString();
    const { data: pedidoPreparado, error: erroPreparacao } = await db
      .from('lgpd_access_request_log')
      .update({
        responsavel_id: authData.user.id,
        evidencia: 'Pacote JSON preparado e download iniciado no navegador; escopo e entrega formal ao titular ainda precisam de conferência.',
        updated_at: preparadoEm,
      })
      .eq('id', pedidoExportacao.id)
      .eq('status', 'pending')
      .select('id,status,responsavel_id,evidencia')
      .maybeSingle();
    if (erroPreparacao || !pedidoPreparado) {
      throw new Error(
        `Os dados foram reunidos, mas a auditoria não confirmou a preparação; o arquivo não foi gerado${erroPreparacao ? `: ${friendlyErrorMessage(erroPreparacao, 'erro do servidor')}` : '.'}`
      );
    }

    const requestLog = data.lgpd_access_request_log as Array<Record<string, unknown>>;
    const existingRequestIndex = requestLog.findIndex((request) => request.id === pedidoExportacao.id);
    const pendingRequest = {
      ...(existingRequestIndex >= 0 ? requestLog[existingRequestIndex] : {}),
      paciente_id: pacienteId,
      request_type: 'export',
      requested_at: pedidoExportacao.requested_at,
      ...pedidoPreparado,
    };
    if (existingRequestIndex >= 0) requestLog[existingRequestIndex] = pendingRequest;
    else requestLog.push(pendingRequest);

    return {
      ...filtrarEscopoExportacao(data, escopoFinal),
      exportacao: { protocolo: pedidoExportacao.protocolo ?? null, escopo: escopoFinal, gerado_em: preparadoEm },
    } as PatientDataExport;
  } catch (error) {
    console.error('Error exporting patient data:', error);
    throw error;
  }
}

/**
 * Registrar consentimento LGPD
 */
export async function logLGPDConsent(
  pacienteId: string,
  consentType: 'data_processing' | 'marketing' | 'third_party' | 'revocation',
  accepted: boolean,
  ipAddress?: string
): Promise<void> {
  // O try/catch anterior não pegava nada: o supabase-js devolve { error } em vez
  // de lançar, então o consentimento sumia sem ninguém saber.
  const { error } = await db.from('lgpd_consent_log').insert({
    paciente_id: pacienteId,
    consent_type: consentType,
    accepted,
    timestamp: new Date().toISOString(),
    ip_address: ipAddress,
    user_agent: navigator.userAgent,
  });

  if (error) {
    throw new Error(`Não foi possível registrar o consentimento: ${error.message}`);
  }
}

/**
 * Obter histórico de consentimentos
 */
export async function getConsentHistory(pacienteId: string) {
  const { data, error } = await db
    .from('lgpd_consent_log')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Error fetching consent history:', error);
    throw error;
  }
  return data || [];
}

/**
 * Revogar consentimento de processamento de dados
 */
export async function revokeDataProcessingConsent(pacienteId: string): Promise<void> {
  await logLGPDConsent(pacienteId, 'revocation', false);
}

/**
 * Check se paciente revogou consentimento
 */
export async function hasRevokedConsent(pacienteId: string): Promise<boolean> {
  const history = await getConsentHistory(pacienteId);

  // Última revogação é mais recente que última aceitação?
  const lastRevocation = history.find(h => h.consent_type === 'revocation' && !h.accepted);
  const lastAcceptance = history.find(h => h.consent_type === 'data_processing' && h.accepted);

  if (!lastRevocation) return false;
  if (!lastAcceptance) return true;

  return new Date(lastRevocation.timestamp) > new Date(lastAcceptance.timestamp);
}

/**
 * Corrigir dados pessoais do paciente
 */
export async function correctPatientData(
  pacienteId: string,
  updates: Record<string, Json>
): Promise<void> {
  try {
    // Log de correção para auditoria
    const { data: user } = await supabase.auth.getUser();

    // Este insert falhava silenciosamente e a correção não era auditada:
    // `details` não existe em audit_log (a coluna é `changes`) e 'DATA_CORRECTION'
    // viola o CHECK action IN ('create','update','delete'). Correção de dado de
    // paciente sem registro de auditoria é falha de conformidade LGPD.
    const { error: auditError } = await supabase.from('audit_log').insert({
      action: 'update',
      collection: 'pacientes',
      record_id: pacienteId,
      user_id: user.user?.id,
      changes: {
        motivo: 'DATA_CORRECTION',
        alteracoes: updates,
        timestamp: new Date().toISOString(),
      },
    });

    if (auditError) throw auditError;

    // Aplicar correção
    const { error: updateError } = await db
      .from('pacientes')
      .update(updates)
      .eq('id', pacienteId);
    if (updateError) throw updateError;
  } catch (error) {
    console.error('Error correcting patient data:', error);
    throw error;
  }
}

/**
 * Gerar relatório de conformidade LGPD
 */
export async function generateLGPDComplianceReport(clinicaId: string) {
  try {
    if (!clinicaId) throw new Error('Clínica obrigatória para gerar relatório LGPD');

    const { data: deletionLogs, error: deletionError } = await db
      .from('lgpd_deletion_log')
      .select('*')
      .eq('clinica_id', clinicaId)
      .order('deleted_at', { ascending: false });
    if (deletionError) throw deletionError;

    const { data: consentLogs, error: consentError } = await db
      .from('lgpd_consent_log')
      .select('*')
      .eq('clinica_id', clinicaId)
      .order('timestamp', { ascending: false });
    if (consentError) throw consentError;

    return {
      totalDeletionRequests: deletionLogs?.length || 0,
      totalConsentRecords: consentLogs?.length || 0,
      deletionRequests: deletionLogs || [],
      consentRecords: consentLogs || [],
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating LGPD report:', error);
    throw error;
  }
}
