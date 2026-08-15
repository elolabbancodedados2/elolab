/**
 * Auto-billing utility: creates a lancamento (billing entry) when
 * an appointment is checked in or finalized. Consultation and exam prices
 * are resolved here so the reception and exam workflows cannot diverge.
 */
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface AutoBillingParams {
  agendamentoId: string;
  pacienteId: string;
  pacienteNome: string;
  convenioId?: string | null;
  tipoConsulta?: string | null;
  /** Name of the exam when tipoConsulta is the generic value "exame". */
  tipoExame?: string | null;
  data?: string; // YYYY-MM-DD, defaults to today
  clinicaId?: string | null;
}

const GENERIC_EXAM_TYPES = new Set(['exame', 'exames']);

function isGenericExamType(value?: string | null): boolean {
  return GENERIC_EXAM_TYPES.has((value || '').trim().toLocaleLowerCase('pt-BR'));
}

function toMoney(value: unknown): number {
  const normalized = typeof value === 'string'
    ? value.trim().replace(/\s/g, '').includes(',')
      ? value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
      : value.trim().replace(/\s/g, '')
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeServiceName(value: unknown): string {
  return String(value || '')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\s*\d+[\s-]*\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function serviceNameCandidates(value: string): string[] {
  const candidates = [value.trim()];
  const pieces = value.split(' - ');
  if (pieces.length > 1) candidates.push(pieces[pieces.length - 1].trim());
  return [...new Set(candidates.map(normalizeServiceName).filter(Boolean))];
}

function matchesServiceName(rowName: unknown, requestedName: string): boolean {
  const row = normalizeServiceName(rowName);
  if (!row) return false;
  const candidates = serviceNameCandidates(requestedName);
  if (candidates.includes(row)) return true;

  // Allow a catalog entry such as "Hemograma completo" to match the short
  // description typed in the appointment, without accepting tiny fragments.
  return candidates.some(candidate =>
    candidate.length >= 4 && (row.includes(candidate) || candidate.includes(row)),
  );
}

function priceFromExamRow(row: any): number {
  // `valor_total` is generated for convenio rows, but old/imported rows can
  // contain zero or null there while the source price is still populated.
  return [row?.valor_total, row?.valor_tabela, row?.preco_venda, row?.valor]
    .map(toMoney)
    .find(value => value > 0) || 0;
}

/**
 * Resolve the price of an exam from the same catalogs used by Caixa Diário.
 * The convenio price wins; private/internal prices are the fallback.
 *
 * A missing price is an error by design. Creating a pending lancamento with
 * zero would make the reception screen offer a false R$ 0,00 charge.
 */
export async function resolveExamPrice(params: {
  tipoExame: string;
  convenioId?: string | null;
  clinicaId?: string | null;
  userId?: string | null;
}): Promise<number> {
  const examName = params.tipoExame.trim();
  if (!examName) throw new Error('Informe o nome do exame antes de enviar o paciente ao balcão.');

  const requestedNames = serviceNameCandidates(examName);

  // A convenio price is more specific than the private price. The convenio
  // itself is clinic-scoped, so this also works with older rows whose
  // clinica_id was not populated yet.
  if (params.convenioId) {
    const { data: convenioRows, error: convenioError } = await (supabase as any)
      .from('precos_exames_convenio')
      .select('tipo_exame, valor_total, valor_tabela')
      .eq('convenio_id', params.convenioId)
      .eq('ativo', true);
    if (convenioError) throw convenioError;

    const matched = (convenioRows || []).find((row: any) => matchesServiceName(row.tipo_exame, examName));
    const convenioPrice = priceFromExamRow(matched);
    if (convenioPrice > 0) return convenioPrice;
  }

  // Prices entered in the "Preços internos" screen are stored as a JSON
  // array in configuracoes_clinica. Prefer a clinic row, then fall back to
  // the user's legacy row for installations created before clinic scoping.
  const userId = params.userId || null;
  let internalRows: any[] | null = null;
  if (params.clinicaId) {
    const { data, error } = await (supabase as any)
      .from('configuracoes_clinica')
      .select('valor')
      .eq('chave', 'precos_exames_internos')
      .eq('clinica_id', params.clinicaId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    internalRows = data;
  }
  if ((!internalRows || internalRows.length === 0) && userId) {
    const { data, error } = await (supabase as any)
      .from('configuracoes_clinica')
      .select('valor')
      .eq('chave', 'precos_exames_internos')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    internalRows = data;
  }

  const internalPrices = internalRows?.[0]?.valor;
  if (Array.isArray(internalPrices)) {
    const matched = internalPrices.find((row: any) => matchesServiceName(row?.nome, examName));
    const internalPrice = priceFromExamRow(matched);
    if (internalPrice > 0) return internalPrice;
  }

  // The structured exam catalog also has a sale price and is useful for
  // clinics that do not maintain the JSON internal-price list.
  if (params.clinicaId) {
    const { data: catalogRows, error: catalogError } = await (supabase as any)
      .from('tipo_exames_catalog')
      .select('nome, codigo_tuss, preco_venda')
      .eq('clinica_id', params.clinicaId)
      .eq('ativo', true);
    if (catalogError) throw catalogError;

    const matched = (catalogRows || []).find((row: any) =>
      matchesServiceName(row.nome, examName) ||
      (row.codigo_tuss && requestedNames.includes(normalizeServiceName(`${row.codigo_tuss} - ${row.nome}`))),
    );
    const catalogPrice = priceFromExamRow(matched);
    if (catalogPrice > 0) return catalogPrice;
  }

  throw new Error(`Não há preço cadastrado para o exame "${examName}". Cadastre o valor antes do check-in.`);
}

export async function createAutoBilling(params: AutoBillingParams): Promise<boolean> {
  const {
    agendamentoId,
    pacienteId,
    pacienteNome,
    convenioId,
    tipoConsulta,
    tipoExame,
    data = format(new Date(), 'yyyy-MM-dd'),
    clinicaId,
  } = params;

  // Resolve clinica_id: use param, or fetch from user profile
  let resolvedClinicaId = clinicaId || null;
  let authUserId: string | null = null;
  if (!resolvedClinicaId || tipoExame || isGenericExamType(tipoConsulta)) {
    const { data: { user } } = await supabase.auth.getUser();
    authUserId = user?.id || null;
    if (user && !resolvedClinicaId) {
      const { data: prof, error: profileError } = await supabase
        .from('profiles')
        .select('clinica_id')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      resolvedClinicaId = prof?.clinica_id || null;
    }
  }

  // Check if lancamento already exists for this agendamento (bypass RLS issue by also checking without clinica filter)
  let existingQuery = (supabase as any)
    .from('lancamentos')
    .select('id, valor, categoria')
    .eq('agendamento_id', agendamentoId);
  if (resolvedClinicaId) existingQuery = existingQuery.eq('clinica_id', resolvedClinicaId);
  const { data: existing, error: existingError } = await existingQuery.limit(1);
  if (existingError) throw existingError;

  if (existing && existing.length > 0) {
    const existingBilling = existing[0];
    const existingIsExam = Boolean(tipoExame?.trim()) || isGenericExamType(tipoConsulta);

    // Repair rows created by the old flow, which inserted an exam with zero
    // before the exam catalog was consulted.
    if (existingIsExam && toMoney(existingBilling.valor) <= 0) {
      const examName = tipoExame?.trim() || '';
      if (!examName) {
        throw new Error('Informe o nome do exame antes de enviar o paciente ao balcão.');
      }
      const examValue = await resolveExamPrice({
        tipoExame: examName,
        convenioId,
        clinicaId: resolvedClinicaId,
        userId: authUserId,
      });
      let repairQuery = (supabase as any)
        .from('lancamentos')
        .update({
          categoria: 'exame',
          descricao: `Exame: ${examName} - ${pacienteNome}`,
          valor: examValue,
        })
        .eq('id', existingBilling.id);
      if (resolvedClinicaId) repairQuery = repairQuery.eq('clinica_id', resolvedClinicaId);
      const { error: repairError } = await repairQuery;
      if (repairError) throw repairError;
      return true;
    }

    return false; // Already billed
  }

  let valor = 0;
  let descricao = 'Consulta';
  let categoria = 'consulta';
  /**
   * O tipo foi encontrado no catálogo `tipos_consulta`?
   *
   * Distingue as duas origens possíveis de um valor zero: atendimento que a
   * clínica cadastrou como gratuito (retorno, coleta) versus preço que ninguém
   * cadastrou. O primeiro não gera cobrança; o segundo é erro.
   */
  let precoCadastrado = false;
  const isExam = Boolean(tipoExame?.trim()) || isGenericExamType(tipoConsulta);

  if (isExam) {
    const examName = tipoExame?.trim() || (!isGenericExamType(tipoConsulta) ? tipoConsulta?.trim() : '');
    if (!examName) {
      throw new Error('Informe o nome do exame antes de enviar o paciente ao balcão.');
    }
    valor = await resolveExamPrice({
      tipoExame: examName,
      convenioId,
      clinicaId: resolvedClinicaId,
      userId: authUserId,
    });
    descricao = `Exame: ${examName}`;
    categoria = 'exame';
  }

  // Try to find price from tipos_consulta
  if (tipoConsulta && !isExam) {
    let tcQuery = (supabase as any)
      .from('tipos_consulta')
      .select('id, nome, valor_particular')
      // `ilike` sem curinga é igualdade sem diferenciar maiúsculas. O
      // agendamento guarda o tipo em minúsculas ("retorno") e o catálogo tem
      // "Retorno" — com `eq` a busca não achava nada, e os 17 agendamentos de
      // retorno caíam no erro de "preço não cadastrado".
      .ilike('nome', tipoConsulta)
      .eq('ativo', true);
    if (resolvedClinicaId) tcQuery = tcQuery.eq('clinica_id', resolvedClinicaId);
    const { data: tc, error: tcError } = await tcQuery.limit(1).maybeSingle();

    if (tcError) throw tcError;
    if (tc) {
      valor = toMoney(tc.valor_particular);
      descricao = tc.nome;
      // O tipo existe no catálogo — então zero é decisão da clínica, não
      // esquecimento. Ver `precoCadastrado` abaixo.
      precoCadastrado = true;

      // Check for convenio-specific price
      if (convenioId && tc.id) {
        let precoConvQuery = (supabase as any)
          .from('precos_consulta_convenio')
          .select('valor')
          .eq('convenio_id', convenioId)
          .eq('tipo_consulta_id', tc.id)
          .eq('ativo', true);
        if (resolvedClinicaId) precoConvQuery = precoConvQuery.eq('clinica_id', resolvedClinicaId);
        const { data: precoConv, error: precoConvError } = await precoConvQuery.maybeSingle();
        if (precoConvError) throw precoConvError;
        if (precoConv) valor = toMoney(precoConv.valor);
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
    if (conv?.valor_consulta) valor = toMoney(conv.valor_consulta);
  }

  // ─── Zero cadastrado é diferente de preço esquecido ───
  //
  // Havia aqui um `throw` para todo valor <= 0, para impedir cobrança de R$ 0
  // criada por preço não cadastrado. A intenção é certa, mas o efeito era
  // barrar o check-in de atendimento que é gratuito DE PROPÓSITO: hoje três
  // tipos ativos têm valor zero — "Retorno" e as duas coletas de laboratório.
  // Nenhum paciente de retorno conseguiria ser atendido.
  //
  // A distinção honesta é pela origem do zero:
  //   tipo encontrado no catálogo com valor 0  → gratuito, não gera cobrança
  //   tipo não encontrado                      → preço esquecido, erro
  if (valor <= 0) {
    if (precoCadastrado) {
      // Sem cobrança e sem erro. Como não há lançamento, também não há saldo
      // devedor — é assim que retorno gratuito atravessa a trava de pagamento
      // da etapa 4 sem precisar de exceção escrita em lugar nenhum.
      return false;
    }
    throw new Error(
      isExam
        ? `Não há preço cadastrado para o exame "${tipoExame || tipoConsulta}".`
        : `Não há preço cadastrado para a consulta "${tipoConsulta || 'atendimento'}".`
    );
  }

  // Build full description with patient name and type
  const fullDescricao = tipoConsulta
    ? `${descricao} - ${pacienteNome} - ${tipoConsulta}`
    : `${descricao} — ${pacienteNome}`;

  const { error } = await (supabase as any).from('lancamentos').insert({
    tipo: 'receita',
    categoria,
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
