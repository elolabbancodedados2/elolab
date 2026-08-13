/**
 * Auto-billing utility: creates a lancamento (billing entry) when
 * an appointment is checked in or finalized, with price lookup from tipos_consulta
 * and convenio-specific pricing.
 */
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface AutoBillingParams {
  agendamentoId: string;
  pacienteId: string;
  pacienteNome: string;
  convenioId?: string | null;
  tipoConsulta?: string | null;
  data?: string; // YYYY-MM-DD, defaults to today
  clinicaId?: string | null;
}

export async function createAutoBilling(params: AutoBillingParams): Promise<boolean> {
  const {
    agendamentoId,
    pacienteId,
    pacienteNome,
    convenioId,
    tipoConsulta,
    data = format(new Date(), 'yyyy-MM-dd'),
    clinicaId,
  } = params;

  // Resolve clinica_id: use param, or fetch from user profile
  let resolvedClinicaId = clinicaId || null;
  if (!resolvedClinicaId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('clinica_id')
        .eq('id', user.id)
        .maybeSingle();
      resolvedClinicaId = prof?.clinica_id || null;
    }
  }

  // Check if lancamento already exists for this agendamento (bypass RLS issue by also checking without clinica filter)
  let existingQuery = (supabase as any)
    .from('lancamentos')
    .select('id')
    .eq('agendamento_id', agendamentoId);
  if (resolvedClinicaId) existingQuery = existingQuery.eq('clinica_id', resolvedClinicaId);
  const { data: existing, error: existingError } = await existingQuery.limit(1);
  if (existingError) throw existingError;

  if (existing && existing.length > 0) return false; // Already billed

  let valor = 0;
  let descricao = 'Consulta';

  // Try to find price from tipos_consulta
  if (tipoConsulta) {
    const { data: tc, error: tcError } = await supabase
      .from('tipos_consulta')
      .select('id, nome, valor_particular')
      .eq('nome', tipoConsulta)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle();

    if (tcError) throw tcError;
    if (tc) {
      valor = tc.valor_particular || 0;
      descricao = tc.nome;

      // Check for convenio-specific price
      if (convenioId && tc.id) {
        const { data: precoConv, error: precoConvError } = await supabase
          .from('precos_consulta_convenio')
          .select('valor')
          .eq('convenio_id', convenioId)
          .eq('tipo_consulta_id', tc.id)
          .eq('ativo', true)
          .maybeSingle();
        if (precoConvError) throw precoConvError;
        if (precoConv) valor = precoConv.valor;
      }
    }
  }

  // Fallback: use convenio default value
  if (valor === 0 && convenioId) {
    const { data: conv, error: convError } = await supabase
      .from('convenios')
      .select('valor_consulta')
      .eq('id', convenioId)
      .maybeSingle();
    if (convError) throw convError;
    if (conv?.valor_consulta) valor = conv.valor_consulta;
  }

  // Build full description with patient name and type
  const fullDescricao = tipoConsulta
    ? `${descricao} - ${pacienteNome} - ${tipoConsulta}`
    : `${descricao} — ${pacienteNome}`;

  const { error } = await (supabase as any).from('lancamentos').insert({
    tipo: 'receita',
    categoria: 'consulta',
    descricao: fullDescricao,
    valor,
    data,
    data_vencimento: data,
    status: 'pendente',
    paciente_id: pacienteId,
    agendamento_id: agendamentoId,
    forma_pagamento: null,
    clinica_id: resolvedClinicaId,
  });

  if (error) {
    // 23505 = unique_violation. O índice lancamentos_um_por_agendamento
    // (migration 20260812130000) fecha a corrida entre dois atendentes fazendo
    // check-in ao mesmo tempo. Perder essa corrida não é erro: significa que a
    // cobrança já foi criada pelo outro, que é exatamente o resultado desejado.
    if ((error as any).code === '23505') {
      return false;
    }
    console.error('Auto-billing insert error:', error);
    throw error;
  }

  return true;
}
