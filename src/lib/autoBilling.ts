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

function isReturnConsultationType(value?: string | null): boolean {
  const normalized = normalizeServiceName(value);
  return normalized === 'retorno' ||
    normalized === 'consulta retorno' ||
    normalized === 'consulta de retorno';
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

function findPriceRow<T>(
  rows: T[],
  requestedName: string,
  getName: (row: T) => unknown,
  getCode: (row: T) => unknown,
  source: string,
): T | null {
  const candidates = serviceNameCandidates(requestedName);
  const requestedCode = requestedName.trim().replace(/^exame\s*:\s*/i, '').match(/^([a-z]{2,}\d{3,}|\d{5,})/i)?.[1];
  const normalizeCode = (value: unknown) => String(value || '').toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '');

  if (requestedCode) {
    const byCode = rows.filter(row => normalizeCode(getCode(row)) === normalizeCode(requestedCode));
    if (byCode.length > 1) throw new Error(`Há mais de um preço com o código ${requestedCode} em ${source}. Revise a tabela antes de cobrar.`);
    if (byCode.length === 1) return byCode[0];
  }

  const exact = rows.filter(row => candidates.includes(normalizeServiceName(getName(row))));
  if (exact.length > 1) throw new Error(`Há mais de um preço exato para "${requestedName}" em ${source}. Revise a tabela antes de cobrar.`);
  if (exact.length === 1) return exact[0];

  // Short names can be substrings of several distinct procedures. Only use a
  // fuzzy match when it identifies one row; choosing the first database row
  // could silently charge the wrong amount.
  const approximate = rows.filter(row => {
    const normalizedRow = normalizeServiceName(getName(row));
    return normalizedRow && candidates.some(candidate =>
      candidate.length >= 4 && (normalizedRow.includes(candidate) || candidate.includes(normalizedRow)),
    );
  });
  if (approximate.length > 1) throw new Error(`O exame "${requestedName}" combina com vários preços em ${source}. Informe o nome ou código TUSS exato e revise a tabela.`);
  return approximate[0] ?? null;
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

  // A convenio price is more specific than the private price. The convenio
  // itself is clinic-scoped, so this also works with older rows whose
  // clinica_id was not populated yet.
  if (params.convenioId) {
    const { data: convenioRows, error: convenioError } = await (supabase as any)
      .from('precos_exames_convenio')
      .select('tipo_exame, codigo_tuss, valor_total, valor_tabela')
      .eq('convenio_id', params.convenioId)
      .eq('ativo', true);
    if (convenioError) throw convenioError;

    const matched = findPriceRow(
      convenioRows || [], examName,
      (row: any) => row.tipo_exame,
      (row: any) => row.codigo_tuss,
      'tabela do convênio',
    );
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
    const matched = findPriceRow(
      internalPrices, examName,
      (row: any) => row?.nome,
      (row: any) => row?.codigo_tuss,
      'tabela particular',
    );
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

    const matched = findPriceRow(
      catalogRows || [], examName,
      (row: any) => row.nome,
      (row: any) => row.codigo_tuss,
      'catálogo de exames',
    );
    const catalogPrice = priceFromExamRow(matched);
    if (catalogPrice > 0) return catalogPrice;
  }

  throw new Error(`Não há preço cadastrado para o exame "${examName}". Cadastre o valor antes do check-in.`);
}

export type AutoBillingOutcome = 'created' | 'repaired' | 'already_exists' | 'free';

export async function createAutoBillingDetailed(params: AutoBillingParams): Promise<AutoBillingOutcome> {
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
    .select('id, valor, categoria, status')
    .eq('agendamento_id', agendamentoId);
  if (resolvedClinicaId) existingQuery = existingQuery.eq('clinica_id', resolvedClinicaId);
  const { data: existing, error: existingError } = await existingQuery.limit(1);
  if (existingError) throw existingError;

  if (existing && existing.length > 0) {
    const existingBilling = existing[0];
    if (['cancelado', 'estornado'].includes(String(existingBilling.status))) {
      throw new Error('A cobrança anterior deste agendamento foi cancelada ou estornada. Regularize-a no financeiro antes do check-in.');
    }
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
      const { data: repaired, error: repairError } = await (supabase as any).rpc('reparar_cobranca_exame_atomica', {
        p_lancamento_id: existingBilling.id,
        p_clinica_id: resolvedClinicaId,
        p_descricao: `Exame: ${examName} - ${pacienteNome}`,
        p_valor: examValue,
      });
      if (repairError) throw repairError;
      if (repaired !== true) throw new Error('A cobrança do exame mudou ou não pode ser corrigida. Atualize o financeiro e tente novamente.');
      return 'repaired';
    }

    return 'already_exists';
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
    // The return workflow may store "consulta de retorno", while the standard
    // catalog entry is simply named "Retorno". They are the same service.
    const catalogName = isReturnConsultationType(tipoConsulta) ? 'Retorno' : tipoConsulta;
    let tcQuery = (supabase as any)
      .from('tipos_consulta')
      .select('id, nome, valor_particular')
      // `ilike` sem curinga é igualdade sem diferenciar maiúsculas. O
      // agendamento guarda o tipo em minúsculas ("retorno") e o catálogo tem
      // "Retorno" — com `eq` a busca não achava nada, e os 17 agendamentos de
      // retorno caíam no erro de "preço não cadastrado".
      .ilike('nome', catalogName)
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
  if (valor === 0 && convenioId && !precoCadastrado) {
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
      return 'free';
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

  const { data: billingResult, error } = await (supabase as any).rpc('criar_cobranca_checkin_atomica', {
    p_agendamento_id: agendamentoId,
    p_clinica_id: resolvedClinicaId,
    p_paciente_id: pacienteId,
    p_categoria: categoria,
    p_descricao: fullDescricao,
    p_valor: valor,
    p_data: data,
  });

  if (error) {
    console.error('Auto-billing insert error:', error);
    throw error;
  }
  if (billingResult === 'already_exists') return 'already_exists';
  if (billingResult !== 'created') throw new Error('Não foi possível confirmar a criação da cobrança.');

  return 'created';
}

/** Backward-compatible boolean result for existing callers outside check-in. */
export async function createAutoBilling(params: AutoBillingParams): Promise<boolean> {
  const outcome = await createAutoBillingDetailed(params);
  return outcome === 'created' || outcome === 'repaired';
}
