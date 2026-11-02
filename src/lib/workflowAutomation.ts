import { nomeMedico } from '@/lib/formatters';
import { formatCurrency } from '@/lib/formatters';
/**
 * Centralized Workflow Automation Engine
 * Handles automated transitions across all clinical flows:
 * - Agendamento → Fila → Atendimento → Billing → Pagamento
 * - Exame → Coleta → Análise → Laudo → Billing
 * - Triagem → Fila (with priority mapping)
 * - Prescrição → Dispensação (stock deduction)
 * - Atendimento finalizado → Retorno agendado
 * - Notificações automáticas em pontos-chave
 */
import { supabase } from '@/integrations/supabase/client';
import { resolveExamPrice } from '@/lib/autoBilling';
import { format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import {
  alertaDaEscolha, escolherItemDispensacao, itensCorrespondentes, lerQuantidadeDispensacao,
  loteVencido, ordenarFefo, termoBuscaAmpla, type ItemEstoqueDispensacao,
} from '@/lib/dispensacaoEstoque';

// ─── Types ──────────────────────────────────────────────
interface WorkflowResult {
  success: boolean;
  message: string;
  actions: string[]; // list of automated actions taken
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}

/**
 * Propaga erro do Supabase como exceção.
 *
 * Todas as funções deste arquivo são try/catch que devolvem
 * `{ success: false }` no catch — só que o supabase-js NÃO lança em erro de
 * API: devolve `{ data, error }`. Então o catch nunca disparava e cada função
 * retornava `success: true` mesmo quando nada tinha sido gravado.
 *
 * Como é este arquivo que move check-in, início e fim de atendimento, triagem
 * e progresso de exame, uma falha aqui deixava a tela dizendo "Atendimento
 * iniciado" com a fila parada — e ninguém ficava sabendo.
 *
 * Uso: `await must(atualizacaoDeAgendamento);`
 */
async function must<T extends { error: unknown }>(op: PromiseLike<T>): Promise<T> {
  const res = await op;
  if (res.error) throw res.error;
  return res;
}

// ─── 1. Check-in Automático ─────────────────────────────
/** When a patient arrives, auto check-in and add to queue */
export async function autoCheckin(
  agendamentoId: string,
  clinicaId?: string | null,
): Promise<WorkflowResult> {
  void clinicaId;
  const actions: string[] = [];

  try {
    const { data, error } = await supabase.rpc('realizar_checkin', {
      p_agendamento_id: agendamentoId,
      p_prioridade: 'normal',
    });
    if (error) throw error;
    const resultado = data as any;
    if (!resultado) throw new Error('O check-in nao retornou um resultado.');

    if (resultado.repetido) {
      return { success: true, message: 'Paciente ja esta na fila', actions: [] };
    }

    actions.push('Paciente adicionado a fila');
    actions.push('Status do agendamento atualizado para aguardando');
    return { success: true, message: 'Check-in realizado', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}
// ─── 3. Finalizar Atendimento (completo) ────────────────
/** Finalize: billing + auto-schedule return if applicable */
export async function autoFinalizarAtendimento(params: {
  agendamentoId: string;
  filaId?: string;
  pacienteId: string;
  pacienteNome: string;
  medicoId: string;
  convenioId?: string | null;
  tipoConsulta?: string | null;
  tipoExame?: string | null;
  clinicaId?: string | null;
  agendarRetorno?: boolean;
  diasRetorno?: number;
  /** Older operational recovery must not send a misleading "today" completion email. */
  notificarPaciente?: boolean;
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    const { data: finalizacao, error: finalizacaoError } = await supabase.rpc(
      'finalizar_atendimento_atomico',
      {
        p_agendamento_id: params.agendamentoId,
        p_fila_id: params.filaId || null,
        p_agendar_retorno: Boolean(params.agendarRetorno),
        p_dias_retorno: params.agendarRetorno ? params.diasRetorno || null : null,
        p_tipo_exame: params.tipoExame || null,
      },
    );
    if (finalizacaoError) throw finalizacaoError;

    if (finalizacao?.[0]?.repetido) {
      return {
        success: true,
        message: 'Atendimento já estava finalizado. A fila foi sincronizada.',
        actions: ['Agendamento e fila já estavam finalizados'],
      };
    }

    const statusFinal = finalizacao?.[0]?.status_agendamento || 'finalizado';
    if (finalizacao?.[0]?.cobranca_criada) actions.push('Cobrança gerada atomicamente');
    actions.push(
      statusFinal === 'aguardando_pagamento_adicional'
        ? 'Agendamento → Aguardando pagamento adicional'
        : 'Agendamento → Finalizado',
    );
    if (params.filaId) actions.push('Fila → Finalizado');
    if (params.agendarRetorno && params.diasRetorno) {
      const dataRetorno = new Date();
      dataRetorno.setDate(dataRetorno.getDate() + params.diasRetorno);
      actions.push(`Retorno agendado para ${format(dataRetorno, 'dd/MM/yyyy')}`);
    }

    if (params.notificarPaciente !== false && params.clinicaId) {
      // Auto-queue notification. Scope it to the appointment's clinic and
      // escape the patient controlled name because the worker renders HTML.
      const pac = await supabase
        .from('pacientes')
        .select('email, telefone')
        .eq('id', params.pacienteId)
        .maybeSingle();

      if (pac.data?.email) {
        const { error: notificationError } = await supabase.from('notification_queue').insert({
          tipo: 'email',
          destinatario_id: params.pacienteId,
          destinatario_email: pac.data.email,
          destinatario_nome: params.pacienteNome,
          assunto: 'Consulta finalizada — Resumo do atendimento',
          conteudo: `Olá ${escapeHtml(params.pacienteNome)}, seu atendimento foi concluído. Caso tenha receitas ou exames, eles já estão disponíveis no seu portal.`,
          status: 'pendente',
          clinica_id: params.clinicaId,
        });
        // Notificação é efeito secundário: a fila clínica e a cobrança já foram
        // concluídas. A RLS pode bloquear este insert sem transformar consulta
        // finalizada em erro falso.
        if (notificationError) {
          console.warn('Notificação de conclusão não enfileirada:', notificationError.message);
        } else {
          actions.push('Notificação de conclusão enviada');
        }
      }
    }

    return { success: true, message: 'Atendimento finalizado com sucesso', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 4. Auto Coleta (Exames de Laboratório) ─────────────
/** When a lab exam is created, auto-create coleta record */
export async function autoCreateColeta(params: {
  exameId: string;
  pacienteId: string;
  medicoId: string | null;
  tipoExame: string;
  urgente?: boolean;
  clinicaId?: string | null;
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    // Determine if this is a lab exam (blood, urine, etc.)
    const labKeywords = [
      'hemograma', 'glicemia', 'colesterol', 'trigliceri', 'ureia', 'creatinina',
      'tgo', 'tgp', 'gama', 'bilirrubina', 'tsh', 'pcr', 'vdrl', 'hiv',
      'hepatite', 'eas', 'urina', 'urocultura', 'hemocultura', 'cultura',
      'ferro', 'ferritina', 'vitamina', 'hormonio', 'cortisol', 'insulina',
      'psa', 'cea', 'hemoglobina', 'vhs', 'coagulograma', 'gasometria',
      'anti-', 'fator', 'complemento', 'ige', 'parasitol', 'sangue oculto',
      'calprotectina', 'coprocultura', 'baar', 'd-dimero', 'fibrinogenio',
      'tap', 'ttpa', 'inr', 'reticulocito', 'tipagem', 'eletroforese',
    ];

    const tipoLower = params.tipoExame.toLowerCase();
    const isLab = labKeywords.some(kw => tipoLower.includes(kw));

    if (!isLab) {
      return { success: true, message: 'Exame de imagem — coleta não necessária', actions: ['Exame identificado como não-laboratorial'] };
    }

    // Determine sample type
    let tipoAmostra = 'sangue';
    let tubo = 'EDTA (roxo)';
    if (tipoLower.includes('urina') || tipoLower.includes('eas') || tipoLower.includes('urocultura') || tipoLower.includes('clearance')) {
      tipoAmostra = 'urina';
      tubo = 'Frasco estéril';
    } else if (tipoLower.includes('fezes') || tipoLower.includes('parasitol') || tipoLower.includes('coprocultura') || tipoLower.includes('calprotectina') || tipoLower.includes('sangue oculto')) {
      tipoAmostra = 'fezes';
      tubo = 'Coletor de fezes';
    } else if (tipoLower.includes('coagulograma') || tipoLower.includes('tap') || tipoLower.includes('ttpa') || tipoLower.includes('inr') || tipoLower.includes('fibrinogenio') || tipoLower.includes('d-dimero')) {
      tubo = 'Citrato (azul)';
    } else if (tipoLower.includes('glicemia') || tipoLower.includes('lactato')) {
      tubo = 'Fluoreto (cinza)';
    } else if (tipoLower.includes('vhs')) {
      tubo = 'Citrato (preto)';
    }

    // Check jejum
    const jejumExames = ['glicemia', 'colesterol', 'trigliceri', 'perfil lipidico', 'curva glice', 'insulina'];
    const jejumNecessario = jejumExames.some(kw => tipoLower.includes(kw));

    // Check if coleta already exists
    const { data: existingColeta, error: existingColetaError } = await supabase
      .from('coletas_laboratorio')
      .select('id')
      .eq('exame_id', params.exameId)
      .limit(1);
    if (existingColetaError) throw existingColetaError;

    if (existingColeta && existingColeta.length > 0) {
      if (params.urgente) {
        const { data: coletaAtualizada, error: atualizarErro } = await supabase
          .from('coletas_laboratorio')
          .update({ urgente: true })
          .eq('id', existingColeta[0].id)
          .eq('clinica_id', params.clinicaId || '')
          .select('id')
          .maybeSingle();
        if (atualizarErro) throw atualizarErro;
        if (!coletaAtualizada) throw new Error('Não foi possível aplicar a prioridade urgente à coleta existente.');
        actions.push('Coleta existente marcada como URGENTE');
        return { success: true, message: 'Coleta existente marcada como urgente', actions };
      }
      return { success: true, message: 'Coleta já registrada', actions: [] };
    }

    await must(supabase.from('coletas_laboratorio').insert({
      exame_id: params.exameId,
      paciente_id: params.pacienteId,
      medico_solicitante_id: params.medicoId || null,
      tipo_amostra: tipoAmostra,
      tubo,
      status: 'pendente',
      urgente: params.urgente || false,
      jejum_necessario: jejumNecessario,
      jejum_horas: jejumNecessario ? 8 : null,
      clinica_id: params.clinicaId || null,
    }));
    actions.push(`Coleta de ${tipoAmostra} criada (tubo: ${tubo})`);

    if (jejumNecessario) {
      actions.push('Jejum de 8h necessário — paciente será orientado');
    }

    if (params.urgente) {
      actions.push('⚡ Marcada como URGENTE');
    }

    return { success: true, message: 'Coleta criada automaticamente', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 5. Auto Dispensação (Prescrição → Estoque) ─────────
const CAMPOS_ITEM_DISPENSACAO = 'id, nome, quantidade, quantidade_minima, validade, lote, unidade';

const comoLista = <T,>(data: unknown): T[] => (Array.isArray(data) ? data as T[] : data ? [data as T] : []);

/** Itens com saldo da clínica cujo nome contém a primeira palavra do medicamento (a escolha fina é feita depois). */
export async function buscarCandidatosDispensacao(clinicaId: string, nome: string): Promise<ItemEstoqueDispensacao[]> {
  const termo = termoBuscaAmpla(nome);
  if (!termo) return [];
  const { data, error } = await supabase
    .from('estoque')
    .select(CAMPOS_ITEM_DISPENSACAO)
    .eq('clinica_id', clinicaId)
    .ilike('nome', `%${termo}%`)
    .gt('quantidade', 0)
    .order('validade', { ascending: true })
    .limit(50);
  if (error) throw error;
  return comoLista<ItemEstoqueDispensacao>(data);
}

export interface PlanoDispensacaoItem {
  nome: string;
  quantidadeTexto: string;
  /** null quando a quantidade não é um inteiro positivo. */
  quantidade: number | null;
  /** Lotes dentro da validade que correspondem ao nome, na ordem FEFO. */
  opcoes: ItemEstoqueDispensacao[];
  sugeridoId: string | null;
  alerta: string | null;
}

/** Monta a prévia da dispensação para a pessoa confirmar item, lote e quantidade. */
export async function planejarDispensacao(params: {
  medicamentos: Array<{ nome: string; quantidade: string }>;
  clinicaId: string;
  hoje?: string;
}): Promise<PlanoDispensacaoItem[]> {
  const hoje = params.hoje ?? todaySaoPauloDateOnly();
  const plano: PlanoDispensacaoItem[] = [];
  for (const med of params.medicamentos) {
    const nome = med.nome.trim();
    if (!nome) continue;
    const quantidade = lerQuantidadeDispensacao(med.quantidade);
    const candidatos = await buscarCandidatosDispensacao(params.clinicaId, nome);
    const { itens } = itensCorrespondentes(nome, candidatos);
    const opcoes = ordenarFefo(itens.filter(item => !loteVencido(item, hoje)));
    const escolha = escolherItemDispensacao(nome, quantidade ?? 1, candidatos, hoje);
    plano.push({
      nome,
      quantidadeTexto: med.quantidade,
      quantidade,
      opcoes,
      sugeridoId: escolha.tipo === 'ok' ? escolha.item.id : null,
      alerta: quantidade === null
        ? `${nome}: quantidade "${med.quantidade}" não é um número inteiro; informe quantas unidades saíram`
        : alertaDaEscolha(nome, escolha, quantidade),
    });
  }
  return plano;
}

/** Dispense medications and deduct from stock */
export async function autoDispensarMedicamentos(params: {
  /** `estoqueId` vem da confirmação na tela; sem ele, a escolha é automática e só baixa quando não há dúvida. */
  medicamentos: Array<{ nome: string; quantidade: string; estoqueId?: string | null }>;
  pacienteId: string;
  pacienteNome: string;
  prontuarioId: string;
  clinicaId: string;
  userId?: string;
  hoje?: string;
}): Promise<WorkflowResult> {
  const actions: string[] = [];
  const alertas: string[] = [];
  const avisos: string[] = [];

  try {
    if (!params.prontuarioId) throw new Error('Salve o prontuário antes de registrar a dispensação.');
    if (!params.clinicaId) throw new Error('Clínica não identificada para registrar a dispensação.');
    const hoje = params.hoje ?? todaySaoPauloDateOnly();

    for (const med of params.medicamentos) {
      if (!med.nome || !med.quantidade) continue;
      const qty = lerQuantidadeDispensacao(med.quantidade);
      if (qty === null) {
        alertas.push(`${med.nome}: quantidade "${med.quantidade}" não é um número inteiro; nada foi baixado`);
        continue;
      }

      let stockItem: ItemEstoqueDispensacao | null = null;
      if (med.estoqueId) {
        const { data, error } = await supabase
          .from('estoque')
          .select(CAMPOS_ITEM_DISPENSACAO)
          .eq('id', med.estoqueId)
          .eq('clinica_id', params.clinicaId)
          .maybeSingle();
        if (error) throw error;
        const item = comoLista<ItemEstoqueDispensacao>(data)[0] ?? null;
        if (!item) { alertas.push(`${med.nome}: item escolhido não está mais no estoque desta clínica`); continue; }
        if (loteVencido(item, hoje)) { alertas.push(`${item.nome}: o lote escolhido está vencido; nada foi baixado`); continue; }
        if (Number(item.quantidade) < qty) {
          alertas.push(`${item.nome}: estoque insuficiente (${item.quantidade} disponível, ${qty} solicitado)`);
          continue;
        }
        stockItem = item;
      } else {
        const candidatos = await buscarCandidatosDispensacao(params.clinicaId, med.nome);
        const escolha = escolherItemDispensacao(med.nome, qty, candidatos, hoje);
        if (escolha.tipo !== 'ok') {
          alertas.push(alertaDaEscolha(med.nome, escolha, qty)!);
          continue;
        }
        stockItem = escolha.item;
      }

      // O RPC bloqueia o item e grava saldo + movimentação na mesma
      // transação. Assim uma corrida ou uma falha no log nunca deixa apenas
      // metade da baixa aplicada.
      const { data: baixa, error: baixaError } = await (supabase as any).rpc(
        'registrar_baixa_estoque',
        {
          p_item_id: stockItem.id,
          p_quantidade: qty,
          p_prontuario_id: params.prontuarioId,
          p_usuario_id: params.userId || null,
          p_motivo: `Dispensação — ${params.pacienteNome}`,
        },
      );
      if (baixaError) throw baixaError;
      if (baixa?.[0]?.ja_baixado) continue;

      actions.push(`${stockItem.nome}${stockItem.lote ? ` (lote ${stockItem.lote})` : ''}: -${qty} unidade(s)`);

      // Alert if below minimum
      const newQty = stockItem.quantidade - qty;
      if (newQty <= (stockItem.quantidade_minima || 0)) {
        avisos.push(`⚠️ ${stockItem.nome}: estoque crítico (${newQty} restantes)`);
      }
    }

    const message = alertas.length > 0
      ? `Dispensação parcial: ${actions.length} item(s) dispensado(s), ${alertas.length} alerta(s)`
      : `${actions.length} medicamento(s) dispensado(s) com sucesso`;

    return { success: true, message, actions: [...actions, ...alertas, ...avisos] };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 7. Auto Billing Exame ──────────────────────────────
/** Generate billing when exam report is released */
export async function autoBillingExame(params: {
  exameId: string;
  pacienteId: string;
  pacienteNome: string;
  tipoExame: string;
  convenioId?: string | null;
  clinicaId?: string | null;
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    const { data: { user } } = await supabase.auth.getUser();
    let clinicaId: string | null = params.clinicaId || null;
    if (!clinicaId && user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('clinica_id')
        .eq('id', user.id)
        .maybeSingle();
      clinicaId = profile?.clinica_id || null;
    }
    if (!clinicaId) throw new Error('Clínica não identificada para enfileirar o aviso do resultado.');

    // Check if already billed
    let existingQuery = supabase
      .from('lancamentos')
      .select('id')
      .eq('categoria', 'exame')
      .ilike('descricao', `%${params.exameId.slice(0, 8)}%`);
    if (clinicaId) existingQuery = existingQuery.eq('clinica_id', clinicaId);
    const { data: existing, error: existingError } = await existingQuery.limit(1);
    if (existingError) throw existingError;

    if (existing && existing.length > 0) {
      return { success: true, message: 'Exame já faturado', actions: [] };
    }

    // Use the same resolver as the reception check-in. Previously this path
    // only looked at convenio rows and silently inserted R$ 0,00 otherwise.
    const valor = await resolveExamPrice({
      tipoExame: params.tipoExame,
      convenioId: params.convenioId,
      clinicaId,
    });

    await must(supabase.from('lancamentos').insert({
      tipo: 'receita',
      categoria: 'exame',
      descricao: `Exame: ${params.tipoExame} — ${params.pacienteNome} [${params.exameId.slice(0, 8)}]`,
      valor,
      data: format(new Date(), 'yyyy-MM-dd'),
      data_vencimento: format(new Date(), 'yyyy-MM-dd'),
      status: 'pendente',
      paciente_id: params.pacienteId,
      clinica_id: clinicaId,
    }));
    actions.push(`Cobrança de ${formatCurrency(valor)} gerada`);

    // Notify patient about result availability
    const { data: pac } = await supabase
      .from('pacientes')
      .select('email')
      .eq('id', params.pacienteId)
      .maybeSingle();

    if (pac?.email) {
      await must(supabase.from('notification_queue').insert({
        tipo: 'email',
        destinatario_id: params.pacienteId,
        destinatario_email: pac.email,
        destinatario_nome: params.pacienteNome,
        assunto: `Resultado de exame disponível — ${params.tipoExame}`,
        conteudo: `Olá ${params.pacienteNome}, o resultado do seu exame "${params.tipoExame}" já está disponível. Acesse pelo portal do paciente ou retire na clínica.`,
        status: 'pendente',
        clinica_id: clinicaId,
      }));
      actions.push('Notificação de resultado enviada ao paciente');
    }

    return { success: true, message: 'Faturamento de exame concluído', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 8. Fluxo Completo de Triagem → Fila ───────────────
/** Save triage and auto-add to queue with Manchester priority */
export async function autoTriagemParaFila(params: {
  agendamentoId: string;
  classificacaoRisco: 'vermelho' | 'laranja' | 'amarelo' | 'verde' | 'azul';
  clinicaId?: string | null;
}): Promise<WorkflowResult> {
  const actions: string[] = [];
  const prioridadeMap: Record<string, string> = {
    vermelho: 'urgente',
    laranja: 'urgente',
    amarelo: 'preferencial',
    verde: 'normal',
    azul: 'normal',
  };
  const prioridade = prioridadeMap[params.classificacaoRisco];

  try {
    const { data, error } = await supabase.rpc('realizar_checkin', {
      p_agendamento_id: params.agendamentoId,
      p_prioridade: prioridade,
    });
    if (error) throw error;
    const resultado = data as any;
    if (!resultado) throw new Error('O check-in da triagem não retornou um resultado.');

    if (resultado.repetido) {
      actions.push('Paciente já estava na fila; prioridade: ' + prioridade);
    } else {
      actions.push('Paciente adicionado à fila (prioridade: ' + prioridade + ')');
      actions.push('Agendamento atualizado para aguardando');
    }

    return {
      success: true,
      message: resultado.repetido
        ? 'Prioridade de triagem confirmada na fila'
        : 'Paciente adicionado à fila com prioridade',
      actions,
    };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

export async function autoConfirmarPagamento(params: {
  lancamentoId: string;
  formaPagamento: string;
  desconto?: number;
  acrescimo?: number;
  observacoes?: string;
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    await must(supabase.from('lancamentos').update({
      status: 'pago',
      forma_pagamento: params.formaPagamento,
      observacoes: params.observacoes || null,
    }).eq('id', params.lancamentoId));
    actions.push('Pagamento confirmado');

    const { data: lanc } = await supabase
      .from('lancamentos')
      .select('valor, paciente_id, agendamento_id, descricao')
      .eq('id', params.lancamentoId)
      .maybeSingle();

    if (lanc) {
      const valorFinal = lanc.valor - (params.desconto || 0) + (params.acrescimo || 0);

      await must(supabase.from('pagamentos_mercadopago').insert({
        valor: valorFinal,
        valor_pago: valorFinal,
        status: 'aprovado',
        tipo: 'consulta',
        metodo_pagamento: params.formaPagamento,
        paciente_id: lanc.paciente_id,
        agendamento_id: lanc.agendamento_id,
        lancamento_id: params.lancamentoId,
        descricao: lanc.descricao,
        data_aprovacao: new Date().toISOString(),
        desconto: params.desconto || 0,
        acrescimo: params.acrescimo || 0,
      } as any));
      actions.push(`Registro de pagamento: ${formatCurrency(valorFinal)}`);
    }

    return { success: true, message: 'Pagamento processado com sucesso', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 11. Cancelar / No-Show + Convocar Lista de Espera ──
/** Cancel or mark no-show, then auto-notify waiting list */
export async function autoCancelarAgendamento(params: {
  agendamentoId: string;
  motivo: 'cancelado' | 'faltou';
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    // Get appointment details before cancelling
    const { data: ag } = await supabase
      .from('agendamentos')
      .select('data, hora_inicio, medico_id, paciente_id, clinica_id, updated_at')
      .eq('id', params.agendamentoId)
      .maybeSingle();

    if (!ag?.clinica_id) throw new Error('Agendamento sem clínica ou não encontrado.');

    const { data: resultado, error } = await supabase.rpc('alterar_status_agendamento_com_fila', {
      p_agendamento_id: params.agendamentoId,
      p_clinica_id: ag.clinica_id,
      p_status: params.motivo,
      p_updated_at: ag.updated_at ?? null,
    });
    if (error) throw error;
    const atualizado = resultado as any;
    if (!atualizado?.atualizado) throw new Error('A consulta mudou ou foi finalizada. Atualize a agenda e tente novamente.');

    actions.push(`Agendamento marcado como ${params.motivo === 'faltou' ? 'falta' : 'cancelado'}`);
    actions.push('Removido da fila (se estava)');

    // Cancelled appointments trigger the database waitlist workflow atomically.
    // A no-show does not trigger that workflow, so keep the legacy invitation here.
    if (params.motivo === 'faltou') {
      const { data: espera } = await supabase
        .from('lista_espera')
        .select('id, paciente_id, medico_id')
        .eq('status', 'aguardando')
        .or(`medico_id.eq.${ag.medico_id},medico_id.is.null`)
        .order('prioridade', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(3);

      if (espera && espera.length > 0) {
        for (const item of espera) {
          const { data: pacEspera } = await supabase
            .from('pacientes')
            .select('nome, email, telefone')
            .eq('id', item.paciente_id)
            .maybeSingle();

          if (pacEspera?.telefone || pacEspera?.email) {
            const { data: med } = await supabase
              .from('medicos')
              .select('nome')
              .eq('id', ag.medico_id)
              .maybeSingle();

            const msg = `Olá ${pacEspera.nome}! Uma vaga abriu na agenda de ${nomeMedico(med?.nome || '')} para o dia ${format(new Date(ag.data + 'T12:00:00'), 'dd/MM/yyyy')} às ${ag.hora_inicio?.slice(0, 5)}. Deseja agendar? Responda SIM para confirmar.`;

            if (pacEspera.telefone) {
              await must(supabase.from('notification_queue').insert({
                tipo: 'whatsapp',
                destinatario_id: item.paciente_id,
                destinatario_telefone: pacEspera.telefone,
                destinatario_nome: pacEspera.nome,
                assunto: 'Vaga Disponível',
                conteudo: msg,
                status: 'pendente',
              }));
            }
            if (pacEspera.email) {
              await must(supabase.from('notification_queue').insert({
                tipo: 'email',
                destinatario_id: item.paciente_id,
                destinatario_email: pacEspera.email,
                destinatario_nome: pacEspera.nome,
                assunto: 'Vaga disponível na agenda',
                conteudo: msg,
                status: 'pendente',
              }));
            }

            await must(supabase.from('lista_espera').update({ status: 'notificado' }).eq('id', item.id));
            actions.push(`Lista de espera: ${pacEspera.nome} notificado sobre vaga`);
          }
        }
      }
    }

    return { success: true, message: 'Agendamento cancelado e lista de espera notificada', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 12. Progresso automático de Exame ──────────────────
/** Advance exam through pipeline and trigger side effects */
export async function autoProgressExame(params: {
  exameId: string;
  novoStatus: string;
  statusAtual: Database['public']['Enums']['status_exame'];
  pacienteId: string;
  pacienteNome: string;
  medicoId: string | null;
  tipoExame: string;
  convenioId?: string | null;
  resultado?: string;
  clinicaId: string;
}): Promise<WorkflowResult> {
  const actions: string[] = [];
  let exameAtualizado = false;

  try {
    const updateData: any = { status: params.novoStatus };
    if (params.novoStatus === 'realizado') {
      updateData.data_realizacao = format(new Date(), 'yyyy-MM-dd');
    }
    if (params.novoStatus === 'laudo_disponivel' && params.resultado) {
      updateData.resultado = params.resultado;
    }

    if (!params.clinicaId || !params.statusAtual) {
      throw new Error('Clínica e situação atual são necessárias para avançar o exame. Atualize a lista e tente novamente.');
    }

    const { data: atualizado, error: erroAtualizacao } = await supabase
      .from('exames')
      .update(updateData)
      .eq('id', params.exameId)
      .eq('clinica_id', params.clinicaId)
      .eq('status', params.statusAtual)
      .select('id')
      .maybeSingle();
    if (erroAtualizacao) throw erroAtualizacao;
    if (!atualizado) throw new Error('Exame não encontrado para atualização. Atualize a lista e tente novamente.');
    exameAtualizado = true;
    actions.push(`Status do exame → ${params.novoStatus}`);

    // Auto-create coleta when exam is ordered
    if (params.novoStatus === 'solicitado') {
      const coletaResult = await autoCreateColeta({
        exameId: params.exameId,
        pacienteId: params.pacienteId,
        medicoId: params.medicoId,
        tipoExame: params.tipoExame,
        clinicaId: params.clinicaId,
      });
      if (!coletaResult.success) throw new Error(coletaResult.message);
      actions.push(...coletaResult.actions);
    }

    // Auto-update coleta status when exam progresses
    if (params.novoStatus === 'realizado') {
      await must(supabase
        .from('coletas_laboratorio')
        .update({ status: 'em_analise' })
        .eq('exame_id', params.exameId)
        .in('status', ['pendente', 'coletado']));
      actions.push('Coleta → Em Análise');
    }

    // Auto-billing + notify when report is ready
    if (params.novoStatus === 'laudo_disponivel') {
      await must(supabase
        .from('coletas_laboratorio')
        .update({ status: 'liberado' })
        .eq('exame_id', params.exameId));
      actions.push('Coleta → Liberada');

      const billingResult = await autoBillingExame({
        exameId: params.exameId,
        pacienteId: params.pacienteId,
        pacienteNome: params.pacienteNome,
        tipoExame: params.tipoExame,
        convenioId: params.convenioId,
        clinicaId: params.clinicaId,
      });
      if (!billingResult.success) {
        actions.push(`Cobrança não gerada: ${billingResult.message}`);
      }
      actions.push(...billingResult.actions);
    }

    // Log automation
    await must(supabase.from('automation_logs').insert({
      tipo: 'exame',
      nome: `Progresso Exame: ${params.tipoExame}`,
      status: 'sucesso',
      registros_processados: 1,
      registros_sucesso: 1,
      detalhes: { exame_id: params.exameId, novo_status: params.novoStatus },
    }));

    return { success: true, message: `Exame atualizado para ${params.novoStatus}`, actions };
  } catch (e: any) {
    if (exameAtualizado) {
      return {
        success: true,
        message: 'Status do exame atualizado; uma etapa complementar falhou.',
        actions: [...actions, `Atenção: ${e?.message || 'uma automação complementar falhou'}`],
      };
    }
    return { success: false, message: e.message, actions };
  }
}

// ─── 14. Auto Notificar Médico ──────────────────────────
/** Notify the doctor when patient is ready (triage done or called) */
export async function autoNotificarMedico(params: {
  medicoId: string;
  pacienteNome: string;
  motivo: string;
  sala?: string;
  clinicaId: string;
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    if (!params.clinicaId) throw new Error('Clínica não identificada para enfileirar a notificação do profissional.');
    const { data: med, error: medicoError } = await (supabase as any)
      .rpc('buscar_contato_medico_notificacao', { p_medico_id: params.medicoId })
      .maybeSingle();
    if (medicoError) throw medicoError;

    if (med?.email) {
      await must(supabase.from('notification_queue').insert({
        tipo: 'email',
        destinatario_id: med.user_id || params.medicoId,
        destinatario_email: med.email,
        destinatario_nome: med.nome || 'Médico',
        assunto: `Paciente pronto: ${params.pacienteNome}`,
        conteudo: `${nomeMedico(med.nome)}, o paciente ${params.pacienteNome} está pronto para atendimento. ${params.motivo}${params.sala ? ` Sala: ${params.sala}.` : ''}`,
        status: 'pendente',
        clinica_id: params.clinicaId,
      }));
      actions.push(`Médico ${med.nome} notificado por e-mail`);
    }

    return { success: true, message: 'Médico notificado', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

