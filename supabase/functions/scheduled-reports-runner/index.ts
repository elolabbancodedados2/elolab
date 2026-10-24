import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronOrUserOk, cronForbidden, clinicaDoChamador, cronSecretOk } from "../_shared/cronAuth.ts";
import { corsPadrao } from '../_shared/cors.ts';
import { sendBrevoEmail } from '../_shared/brevoEmail.ts';
import { dateRangeInTimeZoneIso } from '../_shared/reportDateRange.ts';
import { buildDailySummaryEmail, dailySummaryDue, dailySummaryRecipient, dailySummarySections } from '../_shared/dailySummary.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let corsHeaders: Record<string, string> = {};
const CLAIM_LEASE_MS = 30 * 60 * 1000;

function claimAindaAtiva(relatorio: any, agora = Date.now()) {
  const ultimaExecucao = Date.parse(relatorio.ultima_execucao ?? "");
  const proximaExecucao = Date.parse(relatorio.proxima_execucao ?? "");
  return Number.isFinite(ultimaExecucao)
    && Number.isFinite(proximaExecucao)
    && proximaExecucao > agora
    && Math.abs(proximaExecucao - ultimaExecucao - CLAIM_LEASE_MS) < 1000;
}

;

const DATASET_TABLES: Record<string, {
  table: string; dateField: string; select: string; columns: string[]; allowedRoles: string[];
  statusField?: string; statusOptions?: string[]; medicoField?: string; convenioField?: string;
  textSearchFields?: string[]; valueField?: string;
}> = {
  pacientes: { table: "pacientes", dateField: "created_at", select: "id,nome,nome_social,cpf,data_nascimento,sexo,telefone,email,cidade,estado,convenio_id,created_at,convenios(nome)", columns: ["nome", "nome_social", "cpf", "data_nascimento", "sexo", "telefone", "email", "cidade", "estado", "convenios.nome", "created_at"], convenioField: "convenio_id", textSearchFields: ["nome", "nome_social", "cpf", "email", "telefone"], allowedRoles: ["admin"] },
  agendamentos: { table: "agendamentos", dateField: "data", select: "id,data,hora_inicio,hora_fim,tipo,status,observacoes,paciente_id,medico_id,pacientes(nome),medicos(nome)", columns: ["data", "hora_inicio", "pacientes.nome", "medicos.nome", "tipo", "status", "observacoes"], statusField: "status", statusOptions: ["agendado", "confirmado", "em_atendimento", "finalizado", "cancelado", "faltou"], medicoField: "medico_id", textSearchFields: ["observacoes", "tipo"], allowedRoles: ["admin", "medico", "enfermagem", "recepcao"] },
  lancamentos: { table: "lancamentos", dateField: "data", select: "id,tipo,categoria,descricao,valor,data,data_vencimento,status,forma_pagamento,paciente_id,pacientes(nome)", columns: ["data", "data_vencimento", "tipo", "categoria", "descricao", "pacientes.nome", "forma_pagamento", "status", "valor"], statusField: "status", statusOptions: ["pendente", "pago", "atrasado", "cancelado"], textSearchFields: ["descricao", "categoria"], valueField: "valor", allowedRoles: ["admin", "financeiro"] },
  exames: { table: "exames", dateField: "data_solicitacao", select: "id,tipo_exame,status,data_solicitacao,data_realizacao,observacoes,paciente_id,medico_solicitante_id,pacientes(nome),medicos!exames_medico_solicitante_id_fkey(nome)", columns: ["data_solicitacao", "data_realizacao", "pacientes.nome", "medicos.nome", "tipo_exame", "status", "observacoes"], statusField: "status", statusOptions: ["solicitado", "agendado", "coletado", "em_analise", "laudo_disponivel", "cancelado"], medicoField: "medico_solicitante_id", textSearchFields: ["tipo_exame", "observacoes"], allowedRoles: ["admin", "medico", "enfermagem"] },
  prescricoes: { table: "prescricoes", dateField: "data_emissao", select: "id,data_emissao,medicamento,dosagem,posologia,tipo,paciente_id,medico_id,pacientes(nome),medicos(nome)", columns: ["data_emissao", "pacientes.nome", "medicos.nome", "medicamento", "dosagem", "posologia", "tipo"], medicoField: "medico_id", textSearchFields: ["medicamento", "posologia"], allowedRoles: ["admin", "medico"] },
  atestados: { table: "atestados", dateField: "data_emissao", select: "id,data_emissao,tipo,dias,motivo,paciente_id,medico_id,pacientes(nome),medicos(nome)", columns: ["data_emissao", "pacientes.nome", "medicos.nome", "tipo", "dias", "motivo"], medicoField: "medico_id", textSearchFields: ["motivo", "tipo"], allowedRoles: ["admin", "medico"] },
  prontuarios: { table: "prontuarios", dateField: "data", select: "id,data,queixa_principal,hipotese_diagnostica,conduta,paciente_id,medico_id,pacientes(nome),medicos(nome)", columns: ["data", "pacientes.nome", "medicos.nome", "queixa_principal", "hipotese_diagnostica", "conduta"], medicoField: "medico_id", textSearchFields: ["queixa_principal", "hipotese_diagnostica", "conduta"], allowedRoles: ["admin", "medico"] },
  encaminhamentos: { table: "encaminhamentos", dateField: "data_encaminhamento", select: "id,data_encaminhamento,especialidade_destino,motivo,status,paciente_id,medico_origem_id,pacientes(nome),medicos!encaminhamentos_medico_origem_id_fkey(nome)", columns: ["data_encaminhamento", "pacientes.nome", "medicos.nome", "especialidade_destino", "motivo", "status"], statusField: "status", statusOptions: ["pendente", "realizado", "cancelado"], medicoField: "medico_origem_id", textSearchFields: ["motivo", "especialidade_destino"], allowedRoles: ["admin", "medico"] },
  estoque: { table: "estoque", dateField: "created_at", select: "id,nome,categoria,quantidade,quantidade_minima,unidade,localizacao,validade,valor_unitario,created_at", columns: ["nome", "categoria", "quantidade", "quantidade_minima", "unidade", "localizacao", "validade", "valor_unitario"], textSearchFields: ["nome", "categoria", "localizacao"], allowedRoles: ["admin", "enfermagem", "financeiro"] },
};

const MAX_ROWS = 20_000;
const PAGE_SIZE = 1_000;

function usuarioDoChamador(req: Request): string | null {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const resto = parts[1].length % 4;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(resto ? 4 - resto : 0);
    const claims = JSON.parse(atob(b64));
    return claims?.role === "authenticated" && typeof claims.sub === "string" ? claims.sub : null;
  } catch { return null; }
}

function valorNoCaminho(row: any, path: string): any {
  return path.split(".").reduce((value, key) => value == null ? value : value[key], row);
}

function nextRun(freq: string, hora: string, diaSemana?: number, diaMes?: number, now = new Date()) {
  const [h, m] = (hora || "08:00").split(":").map(Number);
  const partesAgora = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const parte = (partes: Intl.DateTimeFormatPart[], tipo: string) => Number(partes.find((item) => item.type === tipo)?.value);
  const dataLocal = new Date(Date.UTC(parte(partesAgora, "year"), parte(partesAgora, "month") - 1, parte(partesAgora, "day")));
  if (freq === "semanal") {
    dataLocal.setUTCDate(dataLocal.getUTCDate() + ((diaSemana ?? 1) - dataLocal.getUTCDay() + 7) % 7);
  } else if (freq === "mensal") {
    dataLocal.setUTCDate(diaMes ?? 1);
  }

  const paraInstante = () => {
    const asUtc = Date.UTC(dataLocal.getUTCFullYear(), dataLocal.getUTCMonth(), dataLocal.getUTCDate(), h, m);
    const partesAlvo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(asUtc));
    const noRelogioLocal = Date.UTC(
      parte(partesAlvo, "year"), parte(partesAlvo, "month") - 1, parte(partesAlvo, "day"),
      parte(partesAlvo, "hour"), parte(partesAlvo, "minute"), parte(partesAlvo, "second"),
    );
    return new Date(asUtc - (noRelogioLocal - asUtc));
  };

  let proxima = paraInstante();
  if (proxima <= now) {
    if (freq === "semanal") dataLocal.setUTCDate(dataLocal.getUTCDate() + 7);
    else if (freq === "mensal") dataLocal.setUTCMonth(dataLocal.getUTCMonth() + 1);
    else dataLocal.setUTCDate(dataLocal.getUTCDate() + 1);
    proxima = paraInstante();
  }
  return proxima.toISOString();
}

function csvEscape(v: any) {
  if (v === null || v === undefined) return "";
  const raw = String(v);
  const protegido = typeof v !== "number" && /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  const s = protegido.replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function htmlEscape(v: unknown): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(v ?? "").replace(/[&<>"']/g, (char) => entities[char]);
}

async function verificarCanalEmailAtivo(): Promise<boolean> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: { accept: "application/json", "api-key": apiKey },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function enviarResumosDiarios(supabase: any, rolesDoUsuario: (userId: string) => Promise<Set<string>>) {
  const { due, today } = dailySummaryDue();
  if (!due) return { skipped: "before_hour" };
  const { data: prefs, error } = await supabase.from("user_preferences")
    .select("user_id,clinica_id,email_daily_summary,email_daily_summary_sent_on")
    .eq("email_daily_summary", true)
    .or(`email_daily_summary_sent_on.is.null,email_daily_summary_sent_on.lt.${today}`)
    .limit(500);
  if (error) throw error;
  const appUrl = Deno.env.get("APP_URL") || "https://app.elolab.com.br";
  let sent = 0, skipped = 0, failed = 0;
  for (const pref of prefs ?? []) {
    const { data: perfil } = await supabase.from("profiles").select("id,nome,email,ativo,clinica_id").eq("id", pref.user_id).maybeSingle();
    const email = dailySummaryRecipient(pref, perfil);
    const roles = email ? await rolesDoUsuario(pref.user_id) : new Set<string>();
    if (!email || roles.size === 0) { skipped++; continue; }
    // Reserva do dia antes do envio: dois disparos simultâneos não duplicam o e-mail.
    let claim = supabase.from("user_preferences").update({ email_daily_summary_sent_on: today })
      .eq("user_id", pref.user_id).eq("clinica_id", pref.clinica_id).eq("email_daily_summary", true);
    claim = pref.email_daily_summary_sent_on ? claim.eq("email_daily_summary_sent_on", pref.email_daily_summary_sent_on) : claim.is("email_daily_summary_sent_on", null);
    const { data: claimed } = await claim.select("user_id").maybeSingle();
    if (!claimed) { skipped++; continue; }
    try {
      const s = dailySummarySections(roles);
      let medicoIds: string[] | null = null;
      if (s.proprioMedico) {
        const { data: medicos } = await supabase.from("medicos").select("id").eq("user_id", pref.user_id).eq("clinica_id", pref.clinica_id);
        medicoIds = (medicos ?? []).map((m: any) => String(m.id));
      }
      const contar = async (query: any) => {
        const { count, error: countError } = await query;
        if (countError) throw countError;
        return count ?? 0;
      };
      const base = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("clinica_id", pref.clinica_id);
      const semMedico = medicoIds !== null && medicoIds.length === 0;
      const counts = {
        agenda: !s.agenda || semMedico ? null : await contar((medicoIds ? base("agendamentos").in("medico_id", medicoIds) : base("agendamentos")).eq("data", today).not("status", "in", "(cancelado,faltou)")),
        exames: !s.exames || semMedico ? null : await contar((medicoIds ? base("exames").in("medico_solicitante_id", medicoIds) : base("exames")).in("status", ["solicitado", "agendado", "coletado", "em_analise"])),
        contas: s.contas ? await contar(base("lancamentos").eq("tipo", "receita").in("status", ["pendente", "atrasado"]).lt("data_vencimento", today)) : null,
        tarefas: await contar(base("tarefas").eq("responsavel_id", pref.user_id).not("status", "in", "(concluida,cancelada)")),
      };
      const { data: clinica } = await supabase.from("clinicas").select("nome").eq("id", pref.clinica_id).maybeSingle();
      const conteudo = buildDailySummaryEmail({ nome: perfil?.nome ?? "", clinica: clinica?.nome ?? "sua clínica", data: today, appUrl, counts });
      const response = await sendBrevoEmail({ senderName: "EloLab", to: email, subject: conteudo.subject, html: conteudo.html, text: conteudo.text, preheader: "Seu resumo diário no EloLab.", tags: ["resumo-diario"] });
      if (!response.ok) throw new Error("brevo_refused");
      sent++;
    } catch {
      failed++;
      // Devolve a reserva para a próxima execução horária tentar de novo.
      await supabase.from("user_preferences").update({ email_daily_summary_sent_on: pref.email_daily_summary_sent_on ?? null })
        .eq("user_id", pref.user_id).eq("clinica_id", pref.clinica_id).eq("email_daily_summary_sent_on", today);
    }
  }
  return { sent, skipped, failed };
}

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req),};
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Sem guarda, qualquer visitante com a chave pública `anon` disparava a
  // geração e o envio de relatórios da clínica.
  if (!cronOrUserOk(req)) return cronForbidden(corsHeaders);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    // A execução manual feita pela interface deve permanecer restrita à
    // clínica do usuário. Disparos do agendador não carregam JWT e continuam
    // processando todas as clínicas vencidas.
    const isCron = cronSecretOk(req);
    const callerId = usuarioDoChamador(req);
    const clinicaAlvo = await clinicaDoChamador(req, supabase);
    if (!isCron && (!callerId || !clinicaAlvo)) {
      return new Response(JSON.stringify({ error: "Clínica do usuário não identificada." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rolesCache = new Map<string, Set<string>>();
    const rolesDoUsuario = async (userId: string): Promise<Set<string>> => {
      const cached = rolesCache.get(userId);
      if (cached) return cached;
      const { data, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (roleError) throw roleError;
      const roles = new Set((data ?? []).map((item: any) => String(item.role)));
      rolesCache.set(userId, roles);
      return roles;
    };
    const callerRoles = callerId ? await rolesDoUsuario(callerId) : null;
    if (!isCron && (!callerRoles?.has("admin") && !callerRoles?.has("financeiro"))) {
      return new Response(JSON.stringify({ error: "Acesso restrito ao financeiro da clínica." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const emailConfigured = Boolean(Deno.env.get('BREVO_API_KEY'));

    let body: any = {};
    // Corpo vazio é esperado quando o disparo vem do agendador.
    try { body = await req.json(); } catch { /* sem corpo */ }
    const datasetSolicitado = typeof body?.dataset === "string" ? body.dataset : "";
    const datasetPreflight = DATASET_TABLES[datasetSolicitado];
    if (body?.action === "preflight") {
      if (isCron || !callerId || !clinicaAlvo) {
        return new Response(JSON.stringify({ error: "Preflight disponível somente para usuários autenticados da clínica." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!datasetPreflight || !datasetPreflight.allowedRoles.some((role) => callerRoles?.has(role))) {
        return new Response(JSON.stringify({ error: "Seu perfil não pode agendar esta fonte de dados." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: perfis, error: perfisError } = await supabase.from("profiles")
        .select("id,nome,email")
        .eq("clinica_id", clinicaAlvo)
        .eq("ativo", true)
        .order("nome");
      if (perfisError) throw perfisError;
      const destinatariosAutorizados: Array<{ id: string; nome: string; email: string }> = [];
      for (const perfil of perfis ?? []) {
        const papeis = await rolesDoUsuario(String(perfil.id));
        if (datasetPreflight.allowedRoles.some((role) => papeis.has(role)) && perfil.email) {
          destinatariosAutorizados.push({ id: String(perfil.id), nome: String(perfil.nome), email: String(perfil.email) });
        }
      }
      const emailAtivo = await verificarCanalEmailAtivo();
      return new Response(JSON.stringify({ emailConfigured: emailAtivo, timezone: "America/Sao_Paulo", recipients: destinatariosAutorizados }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const forceId = body?.id || null;
    if (!isCron && !forceId) {
      return new Response(JSON.stringify({ error: "Informe o relatório que deseja executar." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let q = supabase.from("relatorios_salvos").select("*");
    if (clinicaAlvo) q = q.eq("clinica_id", clinicaAlvo);
    if (forceId) q = q.eq("id", forceId);
    else q = q.eq("ativo", true).lte("proxima_execucao", new Date().toISOString());
    const { data: relatorios, error } = await q;
    if (error) throw error;

    const out: any[] = [];
    for (const r of relatorios || []) {
      if (!isCron && callerId !== r.user_id && !callerRoles?.has("admin")) {
        return new Response(JSON.stringify({ error: "Você não pode executar o relatório de outro usuário." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cfg: any = r.config || {};
      const ds = DATASET_TABLES[r.dataset];
      if (!ds) { out.push({ id: r.id, skipped: "dataset_invalido" }); continue; }
      if (cfg.dataInicio && cfg.dataFim && cfg.dataInicio > cfg.dataFim) {
        throw new Error("O período salvo tem data inicial posterior à data final. Edite o relatório e salve um período válido.");
      }
      const ownerRoles = await rolesDoUsuario(r.user_id);
      const possuiAcesso = (roles: Set<string> | null) => !!roles && ds.allowedRoles.some((role) => roles.has(role));
      if (!possuiAcesso(ownerRoles) || (callerRoles && !possuiAcesso(callerRoles))) {
        out.push({ id: r.id, skipped: "sem_permissao_para_fonte" });
        continue;
      }
      let ownerMedicoIds: string[] | null = null;
      if (!ownerRoles.has("admin") && ownerRoles.has("medico") && ds.medicoField) {
        const { data: medicosDoOwner, error: medicosError } = await supabase.from("medicos")
          .select("id")
          .eq("user_id", r.user_id)
          .eq("clinica_id", r.clinica_id);
        if (medicosError) throw medicosError;
        ownerMedicoIds = (medicosDoOwner ?? []).map((medico: any) => String(medico.id));
        if (ownerMedicoIds.length === 0) {
          out.push({ id: r.id, skipped: "medico_responsavel_nao_encontrado" });
          continue;
        }
        if (cfg.medicoFilter && cfg.medicoFilter !== "todos" && !ownerMedicoIds.includes(String(cfg.medicoFilter))) {
          out.push({ id: r.id, skipped: "filtro_medico_fora_do_escopo" });
          continue;
        }
      }

      if (ds.statusField && cfg.statusFilter && cfg.statusFilter !== "todos" && !ds.statusOptions?.includes(cfg.statusFilter)) {
        throw new Error("Filtro de status inválido no relatório salvo.");
      }
      if (r.dataset === "lancamentos" && cfg.tipoLancamento && cfg.tipoLancamento !== "todos" && !["receita", "despesa"].includes(cfg.tipoLancamento)) {
        throw new Error("Filtro de tipo inválido no relatório salvo.");
      }
      const min = cfg.valorMin !== undefined && cfg.valorMin !== "" ? Number(cfg.valorMin) : null;
      const max = cfg.valorMax !== undefined && cfg.valorMax !== "" ? Number(cfg.valorMax) : null;
      if (ds.valueField && ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0)))) {
        throw new Error("Faixa de valores inválida no relatório salvo.");
      }
      if (claimAindaAtiva(r)) {
        out.push({ id: r.id, skipped: "em_execucao" });
        continue;
      }
      const claimAt = new Date().toISOString();
      const leaseUntil = new Date(Date.parse(claimAt) + CLAIM_LEASE_MS).toISOString();
      let claimQuery = supabase.from("relatorios_salvos")
        .update({ ultima_execucao: claimAt, proxima_execucao: leaseUntil })
        .eq("id", r.id)
        .eq("clinica_id", r.clinica_id)
        .eq("ativo", r.ativo);
      claimQuery = r.ultima_execucao
        ? claimQuery.eq("ultima_execucao", r.ultima_execucao)
        : claimQuery.is("ultima_execucao", null);
      claimQuery = r.proxima_execucao
        ? claimQuery.eq("proxima_execucao", r.proxima_execucao)
        : claimQuery.is("proxima_execucao", null);
      const { data: claimed, error: claimError } = await claimQuery.select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) {
        out.push({ id: r.id, skipped: "em_execucao" });
        continue;
      }

      const montarConsulta = () => {
        let query: any = supabase.from(ds.table).select(ds.select).eq("clinica_id", r.clinica_id);
        const intervaloTimestamp = ds.dateField === "created_at" || ds.dateField === "updated_at"
          ? dateRangeInTimeZoneIso(cfg.dataInicio, cfg.dataFim, "America/Sao_Paulo")
          : null;
        if (cfg.dataInicio) query = query.gte(ds.dateField, intervaloTimestamp?.gte ?? cfg.dataInicio);
        if (cfg.dataFim) {
          query = intervaloTimestamp?.lt
            ? query.lt(ds.dateField, intervaloTimestamp.lt)
            : query.lte(ds.dateField, cfg.dataFim);
        }
        if (ds.statusField && cfg.statusFilter && cfg.statusFilter !== "todos") query = query.eq(ds.statusField, cfg.statusFilter);
        if (ds.medicoField && cfg.medicoFilter && cfg.medicoFilter !== "todos") query = query.eq(ds.medicoField, cfg.medicoFilter);
        if (ownerMedicoIds && ds.medicoField) query = query.in(ds.medicoField, ownerMedicoIds);
        if (ds.convenioField && cfg.convenioFilter && cfg.convenioFilter !== "todos") query = query.eq(ds.convenioField, cfg.convenioFilter);
        if (r.dataset === "lancamentos" && cfg.tipoLancamento && cfg.tipoLancamento !== "todos") query = query.eq("tipo", cfg.tipoLancamento);
        if (ds.valueField && min !== null) query = query.gte(ds.valueField, min);
        if (ds.valueField && max !== null) query = query.lte(ds.valueField, max);
        return query.order(ds.dateField, { ascending: false }).order("id", { ascending: true });
      };
      const rows: any[] = [];
      for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
        const { data: page, error: queryError } = await montarConsulta().range(offset, offset + PAGE_SIZE - 1);
        if (queryError) throw queryError;
        const batch = page ?? [];
        rows.push(...batch);
        if (rows.length > MAX_ROWS) throw new Error(`O relatório excede o limite de ${MAX_ROWS} registros. Reduza o período ou refine os filtros.`);
        if (batch.length < PAGE_SIZE) break;
      }

      const busca = typeof cfg.textoBusca === "string" ? cfg.textoBusca.trim().toLocaleLowerCase("pt-BR") : "";
      const filtradas = busca && ds.textSearchFields?.length
        ? rows.filter((row) => ds.textSearchFields!.some((field) => String(row[field] ?? "").toLocaleLowerCase("pt-BR").includes(busca)))
        : rows;
      const limiteConfigurado = Number(cfg.limite);
      const limite = Number.isInteger(limiteConfigurado) && limiteConfigurado > 0 ? Math.min(limiteConfigurado, 5_000) : 1_000;
      const linhasRelatorio = filtradas.slice(0, limite);
      const colunasSalvas = Array.isArray(cfg.colunas) ? cfg.colunas.filter((col: unknown): col is string => typeof col === "string" && ds.columns.includes(col)) : [];
      const cols = colunasSalvas.length ? [...new Set(colunasSalvas)] : ds.columns;

      // Gerar CSV simples
      let csv = cols.join(",") + "\n";
      for (const row of linhasRelatorio) csv += cols.map((c) => csvEscape(valorNoCaminho(row, String(c)))).join(",") + "\n";

      // Enviar e-mail
      let delivery = "not_configured";
      if (emailConfigured && r.destinatarios?.length) {
        const emailsSalvos = [...new Set((r.destinatarios as unknown[])
          .filter((email): email is string => typeof email === "string")
          .map((email) => email.trim().toLocaleLowerCase("pt-BR")))];
        const { data: perfisAtivos, error: perfisAtivosError } = await supabase.from("profiles")
          .select("id,email")
          .eq("clinica_id", r.clinica_id)
          .eq("ativo", true);
        if (perfisAtivosError) throw perfisAtivosError;
        const perfisAutorizados: string[] = [];
        for (const perfil of perfisAtivos ?? []) {
          const papeis = await rolesDoUsuario(String(perfil.id));
          if (ds.allowedRoles.some((role) => papeis.has(role)) && perfil.email) {
            perfisAutorizados.push(String(perfil.email).trim().toLocaleLowerCase("pt-BR"));
          }
        }
        const destinatariosAutorizados = emailsSalvos.filter((email) => perfisAutorizados.includes(email));
        if (!emailsSalvos.length || destinatariosAutorizados.length !== emailsSalvos.length) {
          delivery = "recipients_invalid";
        } else {
          const fileName = `${r.nome.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
          const html = `<h2>${htmlEscape(r.nome)}</h2><p>${htmlEscape(r.descricao)}</p><p>Registros: <b>${linhasRelatorio.length}</b></p><p>Relatório anexo (CSV).</p>`;
          const emailResponse = await sendBrevoEmail({
            senderName: 'EloLab',
            to: destinatariosAutorizados,
            subject: `📊 ${r.nome}`,
            preheader: `Relatório salvo do EloLab: ${r.nome}.`,
            html,
            attachments: [{ filename: fileName, content: btoa(unescape(encodeURIComponent(csv))) }],
          });
          if (!emailResponse.ok) throw new Error("O serviço de e-mail recusou o envio do relatório.");
          delivery = "sent";
        }
      }

      const proxima = r.frequencia
        ? nextRun(r.frequencia, r.hora ?? "08:00", r.dia_semana, r.dia_mes)
        : null;
      const { data: completed, error: updateError } = await supabase.from("relatorios_salvos").update({
        ultima_execucao: new Date().toISOString(),
        proxima_execucao: proxima,
      }).eq("id", r.id).eq("clinica_id", r.clinica_id)
        .eq("ultima_execucao", claimAt).eq("proxima_execucao", leaseUntil)
        .select("id").maybeSingle();
      if (updateError) throw updateError;
      if (!completed) throw new Error("A reserva de execução expirou antes da conclusão do relatório.");

      out.push({ id: r.id, rows: linhasRelatorio.length, sent_to: delivery === "sent" ? (r.destinatarios?.length || 0) : 0, delivery });
    }

    // O mesmo disparo do agendador entrega o resumo diário opt-in; a marca
    // `email_daily_summary_sent_on` garante um envio por dia mesmo com cron horário.
    const resumoDiario = isCron && !forceId && emailConfigured
      ? await enviarResumosDiarios(supabase, rolesDoUsuario)
      : { skipped: emailConfigured ? "not_cron" : "email_not_configured" };

    return new Response(JSON.stringify({ processed: out.length, out, daily_summary: resumoDiario }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
