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
import { createAutoBilling, resolveExamPrice } from '@/lib/autoBilling';
import { format } from 'date-fns';

// ─── Types ──────────────────────────────────────────────
interface WorkflowResult {
  success: boolean;
  message: string;
  actions: string[]; // list of automated actions taken
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
 * Uso: `await must(supabase.from('x').update({...}).eq('id', y));`
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
  const actions: string[] = [];

  try {
    // Check if already in queue
    const { data: existing } = await supabase
      .from('fila_atendimento')
      .select('id')
      .eq('agendamento_id', agendamentoId)
      .neq('status', 'finalizado')
      .limit(1);

    if (existing && existing.length > 0) {
      return { success: true, message: 'Paciente já está na fila', actions: [] };
    }

    // ORDEM IMPORTA. Antes o status do agendamento era atualizado primeiro e a
    // fila depois: se o insert na fila falhasse, o agendamento ficava
    // "aguardando" sem existir item na fila. A recepção via o paciente como
    // aguardando, mas ele não aparecia no painel e não podia ser chamado.
    //
    // Agora a fila — que é o artefato visível — vem primeiro. Se ela falhar,
    // nada mudou. Se o status falhar depois, desfazemos a entrada na fila.

    // Get next position
    const { data: lastFila } = await supabase
      .from('fila_atendimento')
      .select('posicao')
      .order('posicao', { ascending: false })
      .limit(1);
    const nextPos = (lastFila?.[0]?.posicao || 0) + 1;

    // Add to queue
    const { data: filaCriada, error: erroFila } = await supabase
      .from('fila_atendimento')
      .insert({
        agendamento_id: agendamentoId,
        posicao: nextPos,
        status: 'aguardando',
        prioridade: 'normal',
        horario_chegada: new Date().toISOString(),
        clinica_id: clinicaId || null,
      })
      .select('id')
      .single();

    if (erroFila) throw erroFila;
    actions.push('Paciente adicionado à fila');

    // Update agendamento status
    const { error: erroStatus } = await supabase
      .from('agendamentos').update({ status: 'aguardando' }).eq('id', agendamentoId);

    if (erroStatus) {
      // Compensação: sem o status certo, o item na fila viraria um fantasma que
      // ninguém consegue chamar. Melhor voltar ao estado anterior e pedir para
      // tentar de novo do que deixar o balcão com uma fila inconsistente.
      if (filaCriada?.id) {
        await supabase.from('fila_atendimento').delete().eq('id', filaCriada.id);
      }
      throw erroStatus;
    }
    actions.push('Status do agendamento → Aguardando');

    return { success: true, message: 'Check-in automático realizado', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 2. Iniciar Atendimento ─────────────────────────────
/** Start consultation: update only the operational statuses.
 * The medical user creates the chart when opening the consultation.
 */
export async function autoIniciarAtendimento(
  agendamentoId: string,
  filaId: string,
  pacienteId: string,
  medicoId: string,
): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    // A fila visível é atualizada primeiro. Se o agendamento falhar, desfazemos
    // a fila para não deixar o painel médico em um estado diferente do agenda.
    const { data: filaAtual, error: filaLeituraError } = await supabase
      .from('fila_atendimento')
      .select('status')
      .eq('id', filaId)
      .maybeSingle();
    if (filaLeituraError) throw filaLeituraError;
    if (!filaAtual) throw new Error('Item da fila não encontrado. Atualize a tela e tente novamente.');

    await must(supabase.from('fila_atendimento')
      .update({ status: 'em_atendimento' })
      .eq('id', filaId)
      .select('id')
      .single());

    try {
      await must(supabase.from('agendamentos')
        .update({ status: 'em_atendimento' })
        .eq('id', agendamentoId)
        .select('id')
        .single());
    } catch (agendamentoError) {
      await supabase.from('fila_atendimento').update({ status: filaAtual.status }).eq('id', filaId);
      throw agendamentoError;
    }
    actions.push('Status → Em Atendimento');

    return { success: true, message: 'Atendimento iniciado', actions };
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
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    // Atualiza os dois registros como uma operação compensável. Sem isso, um
    // erro de RLS na fila podia finalizar o agendamento e deixar o paciente
    // preso em atendimento no painel.
    let filaStatusAnterior: string | null = null;
    if (params.filaId) {
      const { data: filaAtual, error: filaLeituraError } = await supabase
        .from('fila_atendimento')
        .select('status')
        .eq('id', params.filaId)
        .maybeSingle();
      if (filaLeituraError) throw filaLeituraError;
      if (!filaAtual) throw new Error('Item da fila não encontrado. Atualize a tela e tente novamente.');
      filaStatusAnterior = filaAtual.status;

      await must(supabase.from('fila_atendimento')
        .update({ status: 'finalizado' })
        .eq('id', params.filaId)
        .select('id')
        .single());
    }

    try {
      await must(supabase.from('agendamentos')
        .update({ status: 'finalizado' })
        .eq('id', params.agendamentoId)
        .select('id')
        .single());
    } catch (agendamentoError) {
      if (params.filaId && filaStatusAnterior) {
        await supabase.from('fila_atendimento').update({ status: filaStatusAnterior }).eq('id', params.filaId);
      }
      throw agendamentoError;
    }
    actions.push('Agendamento → Finalizado');
    if (params.filaId) actions.push('Fila → Finalizado');

    // Auto-billing is part of finalization. If it fails, restore the two
    // operational statuses so the patient can be corrected and finalized
    // again instead of disappearing from the payment flow.
    try {
      const billed = await createAutoBilling({
        agendamentoId: params.agendamentoId,
        pacienteId: params.pacienteId,
        pacienteNome: params.pacienteNome,
        convenioId: params.convenioId,
        tipoConsulta: params.tipoConsulta,
        tipoExame: params.tipoExame,
        data: format(new Date(), 'yyyy-MM-dd'),
        clinicaId: params.clinicaId,
      });
      if (billed) actions.push('Cobrança gerada automaticamente');
    } catch (billingError) {
      if (params.filaId && filaStatusAnterior) {
        await supabase.from('fila_atendimento')
          .update({ status: filaStatusAnterior })
          .eq('id', params.filaId);
      }
      await supabase.from('agendamentos')
        .update({ status: 'em_atendimento' })
        .eq('id', params.agendamentoId);
      throw billingError;
    }

    // Auto-schedule return if requested
    if (params.agendarRetorno && params.diasRetorno) {
      const dataRetorno = new Date();
      dataRetorno.setDate(dataRetorno.getDate() + params.diasRetorno);
      
      await must(supabase.from('retornos').insert({
        paciente_id: params.pacienteId,
        medico_id: params.medicoId,
        data_retorno_prevista: format(dataRetorno, 'yyyy-MM-dd'),
        data_consulta_origem: format(new Date(), 'yyyy-MM-dd'),
        motivo: `Retorno de ${params.tipoConsulta || 'consulta'}`,
        status: 'pendente',
        agendamento_id: params.agendamentoId,
      }));
      actions.push(`Retorno agendado para ${format(dataRetorno, 'dd/MM/yyyy')}`);
    }

    // Auto-queue notification
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
        conteudo: `Olá ${params.pacienteNome}, seu atendimento foi concluído. Caso tenha receitas ou exames, eles já estão disponíveis no seu portal.`,
        status: 'pendente',
      });
      // Notificação é efeito secundário: a fila clínica e a cobrança já foram
      // concluídas. A RLS pode bloquear este insert para médico/recepção sem
      // transformar uma consulta finalizada em erro falso.
      if (notificationError) {
        console.warn('Notificação de conclusão não enfileirada:', notificationError.message);
      } else {
        actions.push('Notificação de conclusão enviada');
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
  medicoId: string;
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
    const { data: existingColeta } = await supabase
      .from('coletas_laboratorio')
      .select('id')
      .eq('exame_id', params.exameId)
      .limit(1);

    if (existingColeta && existingColeta.length > 0) {
      return { success: true, message: 'Coleta já registrada', actions: [] };
    }

    await must(supabase.from('coletas_laboratorio').insert({
      exame_id: params.exameId,
      paciente_id: params.pacienteId,
      medico_solicitante_id: params.medicoId,
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
/** Dispense medications and deduct from stock */
export async function autoDispensarMedicamentos(params: {
  medicamentos: Array<{ nome: string; quantidade: string }>;
  pacienteId: string;
  pacienteNome: string;
  userId?: string;
}): Promise<WorkflowResult> {
  const actions: string[] = [];
  const alertas: string[] = [];

  try {
    for (const med of params.medicamentos) {
      if (!med.nome || !med.quantidade) continue;
      const qty = parseInt(med.quantidade) || 1;

      // Find in stock by name match
      const { data: stockItem } = await supabase
        .from('estoque')
        .select('id, quantidade, nome, quantidade_minima')
        .ilike('nome', `%${med.nome.split(' ')[0]}%`)
        .gt('quantidade', 0)
        .order('validade', { ascending: true }) // Use closest to expiry first (FEFO)
        .limit(1)
        .maybeSingle();

      if (!stockItem) {
        alertas.push(`${med.nome}: não encontrado no estoque`);
        continue;
      }

      if (stockItem.quantidade < qty) {
        alertas.push(`${stockItem.nome}: estoque insuficiente (${stockItem.quantidade} disponível, ${qty} solicitado)`);
        continue;
      }

      // Deduct
      await must(supabase.from('estoque').update({
        quantidade: stockItem.quantidade - qty,
      }).eq('id', stockItem.id));

      // Log movement
      await must(supabase.from('movimentacoes_estoque').insert({
        item_id: stockItem.id,
        tipo: 'saida',
        quantidade: qty,
        motivo: `Dispensação — ${params.pacienteNome}`,
        usuario_id: params.userId || null,
      }));

      actions.push(`${stockItem.nome}: -${qty} unidade(s)`);

      // Alert if below minimum
      const newQty = stockItem.quantidade - qty;
      if (newQty <= (stockItem.quantidade_minima || 0)) {
        alertas.push(`⚠️ ${stockItem.nome}: estoque crítico (${newQty} restantes)`);
      }
    }

    const message = alertas.length > 0
      ? `Dispensação parcial: ${actions.length} item(s) dispensado(s), ${alertas.length} alerta(s)`
      : `${actions.length} medicamento(s) dispensado(s) com sucesso`;

    return { success: true, message, actions: [...actions, ...alertas] };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 6. Auto Notificação Retorno ────────────────────────
/** Check and notify patients about upcoming returns */
export async function autoNotificarRetornos(): Promise<WorkflowResult> {
  const actions: string[] = [];
  try {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const amanhaStr = format(amanha, 'yyyy-MM-dd');

    const { data: retornos } = await supabase
      .from('retornos')
      .select('*, pacientes(nome, email, telefone)')
      .eq('data_retorno_prevista', amanhaStr)
      .eq('status', 'pendente');

    if (!retornos || retornos.length === 0) {
      return { success: true, message: 'Sem retornos para amanhã', actions: [] };
    }

    for (const ret of retornos as any[]) {
      if (ret.pacientes?.email) {
        await must(supabase.from('notification_queue').insert({
          tipo: 'email',
          destinatario_id: ret.paciente_id,
          destinatario_email: ret.pacientes.email,
          destinatario_nome: ret.pacientes.nome,
          assunto: 'Lembrete de Retorno — Amanhã',
          conteudo: `Olá ${ret.pacientes.nome}, lembramos que seu retorno está agendado para amanhã. Entre em contato para confirmar.`,
          status: 'pendente',
        }));
        actions.push(`Notificação enviada: ${ret.pacientes.nome}`);
      }
    }

    return { success: true, message: `${actions.length} notificação(ões) de retorno enviada(s)`, actions };
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

    // Check if already billed
    let existingQuery = supabase
      .from('lancamentos')
      .select('id')
      .eq('categoria', 'exame')
      .ilike('descricao', `%${params.exameId.slice(0, 8)}%`);
    if (clinicaId) existingQuery = existingQuery.eq('clinica_id', clinicaId);
    const { data: existing } = await existingQuery.limit(1);

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
    actions.push(`Cobrança de R$ ${valor.toFixed(2)} gerada`);

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

  try {
    const prioridadeMap: Record<string, string> = {
      vermelho: 'urgente', laranja: 'urgente', amarelo: 'preferencial',
      verde: 'normal', azul: 'normal',
    };

    // Check if already in queue
    const { data: existing } = await supabase
      .from('fila_atendimento')
      .select('id, prioridade')
      .eq('agendamento_id', params.agendamentoId)
      .neq('status', 'finalizado')
      .limit(1);

    const novaPrioridade = prioridadeMap[params.classificacaoRisco];

    if (existing && existing.length > 0) {
      // Update priority if already in queue
      if (existing[0].prioridade !== novaPrioridade) {
        await must(supabase.from('fila_atendimento')
          .update({ prioridade: novaPrioridade })
          .eq('id', existing[0].id));
        actions.push(`Prioridade atualizada para ${novaPrioridade}`);
      }
      return { success: true, message: 'Prioridade atualizada na fila', actions };
    }

    // Add to queue
    const { data: lastFila } = await supabase
      .from('fila_atendimento')
      .select('posicao')
      .order('posicao', { ascending: false })
      .limit(1);
    const nextPos = (lastFila?.[0]?.posicao || 0) + 1;

    // Urgent patients go to front
    const isUrgent = params.classificacaoRisco === 'vermelho' || params.classificacaoRisco === 'laranja';
    const posicao = isUrgent ? 0 : nextPos;

    const { data: filaCriada, error: filaError } = await supabase
      .from('fila_atendimento')
      .insert({
        agendamento_id: params.agendamentoId,
        posicao,
        status: 'aguardando',
        prioridade: novaPrioridade,
        horario_chegada: new Date().toISOString(),
        clinica_id: params.clinicaId || null,
      })
      .select('id')
      .single();
    if (filaError) throw filaError;
    actions.push(`Adicionado à fila (prioridade: ${novaPrioridade})`);

    try {
      await must(supabase.from('agendamentos')
        .update({ status: 'aguardando' })
        .eq('id', params.agendamentoId)
        .select('id')
        .single());
    } catch (agendamentoError) {
      // O item recém-criado não pode ficar órfão na fila se a atualização do
      // agendamento for rejeitada por RLS ou por um id inválido.
      if (filaCriada?.id) {
        await supabase.from('fila_atendimento').delete().eq('id', filaCriada.id);
      }
      throw agendamentoError;
    }
    actions.push('Agendamento → Aguardando');

    if (isUrgent) {
      actions.push('⚡ Paciente posicionado no início da fila');
    }

    return { success: true, message: 'Paciente adicionado à fila com prioridade', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 9. Confirmar Pagamento Completo ────────────────────
/** Confirm payment and auto-close the flow */
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
      actions.push(`Registro de pagamento: R$ ${valorFinal.toFixed(2)}`);
    }

    return { success: true, message: 'Pagamento processado com sucesso', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 10. Confirmar Agendamento + Notificar ──────────────
/** Confirm appointment and send notification to patient */
export async function autoConfirmarAgendamento(agendamentoId: string): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    await must(supabase.from('agendamentos').update({ status: 'confirmado' }).eq('id', agendamentoId));
    actions.push('Agendamento confirmado');

    // Get patient info for notification
    const { data: ag } = await supabase
      .from('agendamentos')
      .select('data, hora_inicio, paciente_id, medico_id')
      .eq('id', agendamentoId)
      .maybeSingle();

    if (ag) {
      const { data: pac } = await supabase
        .from('pacientes')
        .select('nome, email, telefone')
        .eq('id', ag.paciente_id)
        .maybeSingle();
      const { data: med } = await supabase
        .from('medicos')
        .select('nome')
        .eq('id', ag.medico_id)
        .maybeSingle();

      if (pac?.email) {
        await must(supabase.from('notification_queue').insert({
          tipo: 'email',
          destinatario_id: ag.paciente_id,
          destinatario_email: pac.email,
          destinatario_nome: pac.nome,
          assunto: `Consulta confirmada — ${format(new Date(ag.data + 'T12:00:00'), 'dd/MM/yyyy')}`,
          conteudo: `Olá ${pac.nome}, sua consulta com Dr(a). ${med?.nome || 'médico'} no dia ${format(new Date(ag.data + 'T12:00:00'), 'dd/MM/yyyy')} às ${ag.hora_inicio?.slice(0, 5)} está confirmada.`,
          status: 'pendente',
        }));
        actions.push('Notificação de confirmação enviada por e-mail');
      }

      if (pac?.telefone) {
        await must(supabase.from('notification_queue').insert({
          tipo: 'whatsapp',
          destinatario_id: ag.paciente_id,
          destinatario_telefone: pac.telefone,
          destinatario_nome: pac.nome,
          assunto: 'Confirmação de Consulta',
          conteudo: `Olá ${pac.nome}! Sua consulta do dia ${format(new Date(ag.data + 'T12:00:00'), 'dd/MM/yyyy')} às ${ag.hora_inicio?.slice(0, 5)} com Dr(a). ${med?.nome || ''} está confirmada. ✅`,
          status: 'pendente',
        }));
        actions.push('Notificação WhatsApp enfileirada');
      }
    }

    return { success: true, message: 'Agendamento confirmado com notificação', actions };
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
      .select('data, hora_inicio, medico_id, paciente_id')
      .eq('id', params.agendamentoId)
      .maybeSingle();

    await must(supabase.from('agendamentos').update({ status: params.motivo }).eq('id', params.agendamentoId));
    actions.push(`Agendamento marcado como ${params.motivo === 'faltou' ? 'falta' : 'cancelado'}`);

    // Remove from queue if present
    await must(supabase.from('fila_atendimento').delete().eq('agendamento_id', params.agendamentoId));
    actions.push('Removido da fila (se estava)');

    // Auto-convoke waiting list
    if (ag) {
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

            const msg = `Olá ${pacEspera.nome}! Uma vaga abriu na agenda de Dr(a). ${med?.nome || ''} para o dia ${format(new Date(ag.data + 'T12:00:00'), 'dd/MM/yyyy')} às ${ag.hora_inicio?.slice(0, 5)}. Deseja agendar? Responda SIM para confirmar.`;

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
  pacienteId: string;
  pacienteNome: string;
  medicoId: string;
  tipoExame: string;
  convenioId?: string | null;
  resultado?: string;
  clinicaId?: string | null;
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    const updateData: any = { status: params.novoStatus };
    if (params.novoStatus === 'realizado') {
      updateData.data_realizacao = format(new Date(), 'yyyy-MM-dd');
    }
    if (params.novoStatus === 'laudo_disponivel' && params.resultado) {
      updateData.resultado = params.resultado;
    }

    await must(supabase.from('exames').update(updateData).eq('id', params.exameId));
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
    return { success: false, message: e.message, actions };
  }
}

// ─── 13. Vincular Resultado ao Prontuário ───────────────
/** Auto-attach exam result to patient's latest prontuario */
export async function autoVincularResultadoProntuario(params: {
  exameId: string;
  pacienteId: string;
  tipoExame: string;
  resultado: string;
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    // Find the latest prontuario for this patient
    const { data: prontuario } = await supabase
      .from('prontuarios')
      .select('id, observacoes_internas')
      .eq('paciente_id', params.pacienteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prontuario) {
      const novaObs = (prontuario.observacoes_internas || '') +
        `\n\n--- Resultado de Exame (${format(new Date(), 'dd/MM/yyyy HH:mm')}) ---\n` +
        `Exame: ${params.tipoExame}\n${params.resultado}`;

      await must(supabase.from('prontuarios').update({
        observacoes_internas: novaObs,
      }).eq('id', prontuario.id));

      actions.push(`Resultado vinculado ao prontuário ${prontuario.id.slice(0, 8)}`);
    } else {
      actions.push('Nenhum prontuário encontrado — resultado não vinculado');
    }

    return { success: true, message: 'Resultado vinculado ao prontuário', actions };
  } catch (e: any) {
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
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    const { data: med } = await supabase
      .from('medicos')
      .select('email, nome, user_id')
      .eq('id', params.medicoId)
      .maybeSingle();

    if (med?.email) {
      await must(supabase.from('notification_queue').insert({
        tipo: 'email',
        destinatario_id: med.user_id || params.medicoId,
        destinatario_email: med.email,
        destinatario_nome: med.nome || 'Médico',
        assunto: `Paciente pronto: ${params.pacienteNome}`,
        conteudo: `Dr(a). ${med.nome}, o paciente ${params.pacienteNome} está pronto para atendimento. ${params.motivo}${params.sala ? ` Sala: ${params.sala}.` : ''}`,
        status: 'pendente',
      }));
      actions.push(`Médico ${med.nome} notificado por e-mail`);
    }

    return { success: true, message: 'Médico notificado', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 15. Auto Agendar a partir da Lista de Espera ───────
/** Convert a waiting list entry into a real appointment */
export async function autoAgendarListaEspera(params: {
  listaEsperaId: string;
  pacienteId: string;
  medicoId: string;
  data: string;
  horaInicio: string;
  horaFim?: string;
}): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    // Create appointment
    const { data: ag, error } = await supabase.from('agendamentos').insert({
      paciente_id: params.pacienteId,
      medico_id: params.medicoId,
      data: params.data,
      hora_inicio: params.horaInicio,
      hora_fim: params.horaFim || null,
      status: 'agendado',
      observacoes: 'Agendado a partir da lista de espera',
    }).select('id').single();

    if (error) throw error;
    actions.push('Agendamento criado');

    // Update waiting list status
    await must(supabase.from('lista_espera').update({ status: 'agendado' }).eq('id', params.listaEsperaId));
    actions.push('Lista de espera → Agendado');

    // Notify patient
    const { data: pac } = await supabase
      .from('pacientes')
      .select('nome, email, telefone')
      .eq('id', params.pacienteId)
      .maybeSingle();

    if (pac?.email) {
      const { data: med } = await supabase
        .from('medicos')
        .select('nome')
        .eq('id', params.medicoId)
        .maybeSingle();

      await must(supabase.from('notification_queue').insert({
        tipo: 'email',
        destinatario_id: params.pacienteId,
        destinatario_email: pac.email,
        destinatario_nome: pac.nome,
        assunto: 'Sua consulta foi agendada!',
        conteudo: `Olá ${pac.nome}! Sua consulta com Dr(a). ${med?.nome || ''} foi agendada para ${format(new Date(params.data + 'T12:00:00'), 'dd/MM/yyyy')} às ${params.horaInicio.slice(0, 5)}. Nos vemos lá! 🎉`,
        status: 'pendente',
      }));
      actions.push('Paciente notificado por e-mail');
    }

    return { success: true, message: 'Paciente agendado a partir da lista de espera', actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}

// ─── 16. Auto No-Show em Lote ───────────────────────────
/** Mark all past unconfirmed appointments as no-show */
export async function autoMarcarFaltasHoje(): Promise<WorkflowResult> {
  const actions: string[] = [];

  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const agora = format(new Date(), 'HH:mm');

    const { data: faltas } = await supabase
      .from('agendamentos')
      .select('id, paciente_id, hora_inicio')
      .eq('data', today)
      .in('status', ['agendado'])
      .lt('hora_inicio', agora);

    if (!faltas || faltas.length === 0) {
      return { success: true, message: 'Nenhuma falta detectada', actions: [] };
    }

    for (const ag of faltas) {
      await autoCancelarAgendamento({
        agendamentoId: ag.id,
        motivo: 'faltou',
      });
      actions.push(`Falta registrada: ${ag.hora_inicio}`);
    }

    await must(supabase.from('automation_logs').insert({
      tipo: 'agenda',
      nome: 'Auto No-Show',
      status: 'sucesso',
      registros_processados: faltas.length,
      registros_sucesso: faltas.length,
      detalhes: { data: today, total_faltas: faltas.length },
    }));

    return { success: true, message: `${faltas.length} falta(s) registrada(s)`, actions };
  } catch (e: any) {
    return { success: false, message: e.message, actions };
  }
}
