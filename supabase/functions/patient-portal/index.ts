import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checarRateLimit, clientIp } from "../_shared/rateLimit.ts";
import { corsPadrao } from '../_shared/cors.ts';
import { horariosLivres, validarHorario as validatePortalSlot, agoraEmBrasilia, horarioConsultaPassou } from '../_shared/horarios.ts';
import { limiteDataRemarcacao, recusarDataAlemDoLimite, remarcarAgendamento } from './remarcacao.ts';

/** Data de hoje em "YYYY-MM-DD", para comparar com colunas `date` do Postgres. */
function todayISO(): string {
  return agoraEmBrasilia().data;
}

/**
 * Soma minutos a um horário "HH:MM".
 * A versão anterior fazia `(m + 30) % 60` sem propagar a hora, então 10:45 + 30
 * virava "10:15" em vez de "11:15".
 */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const corsHeaders = { ...corsPadrao(req), 'Cache-Control': "no-store, no-cache, must-revalidate, private", 'Pragma': "no-cache", 'Referrer-Policy': "no-referrer", 'X-Content-Type-Options': "nosniff" };
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Portal do paciente é um caminho mais tranquilo — o paciente lê seus
    // agendamentos, resultados. 60 req/min por IP dá margem generosa para
    // navegação normal (uma tela puxa vários endpoints) e ainda barra bot.
    const limitado = await checarRateLimit(supabase, {
      chave: `portal:${clientIp(req)}`,
      limite: 60,
      janelaSegundos: 60,
    });
    if (limitado) {
      return new Response(
        JSON.stringify({ error: "Muitas tentativas — aguarde alguns segundos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, token } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: "Token obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // O segredo bruto nunca fica no banco; comparamos apenas sua impressão.
    const tokenHash = await sha256Hex(String(token));
    let { data: tokenData, error: tokenError } = await supabase
      .from("paciente_portal_tokens")
      .select("*, pacientes(id, nome, email, telefone, foto_url, cpf, data_nascimento, sexo, alergias, observacoes, clinica_id)")
      .eq("token", tokenHash)
      .eq("ativo", true)
      .gte("expires_at", new Date().toISOString())
      .single();

    // Compatibilidade durante o deploy: a Edge Function entra antes da
    // migration. Enquanto a tabela ainda tiver os três tokens legados em
    // texto puro, eles continuam aceitos; após o UPDATE, este ramo não acha
    // mais nenhuma linha e pode ser removido numa migração futura.
    if (!tokenData) {
      ({ data: tokenData, error: tokenError } = await supabase
        .from("paciente_portal_tokens")
        .select("*, pacientes(id, nome, email, telefone, foto_url, cpf, data_nascimento, sexo, alergias, observacoes, clinica_id)")
        .eq("token", String(token))
        .eq("ativo", true)
        .gte("expires_at", new Date().toISOString())
        .single());
    }

    if (tokenError || !tokenData) {
      return new Response(JSON.stringify({ error: "Token inválido ou expirado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pacienteId = tokenData.paciente_id;
    // Clínica do paciente — usada para impedir que o portal exponha ou agende
    // com médicos de outras clínicas.
    const pacienteClinicaId =
      (tokenData as any).pacientes?.clinica_id ?? (tokenData as any).clinica_id ?? null;
    if (!pacienteId || !pacienteClinicaId || pacienteClinicaId !== (tokenData as any).clinica_id) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update last access
    await supabase
      .from("paciente_portal_tokens")
      .update({ ultimo_acesso: new Date().toISOString() })
      .eq("id", tokenData.id);

    let result: any;

    switch (action) {
      case "get_profile":
        result = tokenData.pacientes;
        break;

      case "update_contact": {
        const telefone = String(body.telefone || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const telefoneDigitos = telefone.replace(/\D/g, "");
        if (telefone && (telefoneDigitos.length < 10 || telefoneDigitos.length > 13)) {
          return new Response(JSON.stringify({ error: "Informe um telefone válido com DDD" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return new Response(JSON.stringify({ error: "Informe um e-mail válido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { data, error } = await supabase.from("pacientes")
          .update({ telefone: telefone || null, email: email || null })
          .eq("id", pacienteId).eq("clinica_id", pacienteClinicaId)
          .select("id, nome, email, telefone, foto_url, cpf, data_nascimento, sexo, alergias, observacoes, clinica_id")
          .single();
        if (error) throw error;
        result = { success: true, profile: data };
        break;
      }

      case "get_agendamentos": {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("id, medico_id, data, hora_inicio, hora_fim, tipo, status, medicos(nome, crm, especialidade)")
          .eq("paciente_id", pacienteId)
          .eq("clinica_id", pacienteClinicaId)
          .order("data", { ascending: false })
          .limit(50);
        if (error) throw error;
        result = data || [];
        break;
      }

      case "get_historico": {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("id, data, hora_inicio, tipo, status, medicos(crm, especialidade)")
          .eq("paciente_id", pacienteId)
          .eq("clinica_id", pacienteClinicaId)
          .lt("data", todayISO())
          .order("data", { ascending: false })
          .limit(50);
        if (error) throw error;
        result = data || [];
        break;
      }

      case "get_retornos": {
        const { data, error } = await supabase.from("retornos")
          .select("id, data_retorno_prevista, motivo, tipo_retorno, status, confirmado_em, agendamento_retorno_id, created_at, medicos(nome, especialidade)")
          .eq("paciente_id", pacienteId).eq("clinica_id", pacienteClinicaId).order("data_retorno_prevista", { ascending: false }).limit(50);
        if (error) throw error;
        result = data || [];
        break;
      }

      case "get_waitlist_offers": {
        const { data: ofertas, error } = await supabase.from("lista_espera")
          .select("id, oferta_agendamento_id, oferta_expira_em, prioridade, motivo")
          .eq("paciente_id", pacienteId).eq("clinica_id", pacienteClinicaId).eq("status", "notificado").gt("oferta_expira_em", new Date().toISOString());
        if (error) throw error;
        const completas = [];
        for (const oferta of ofertas || []) {
          const { data: vaga, error: vagaError } = await supabase.from("agendamentos")
            .select("id, data, hora_inicio, hora_fim, tipo, medicos(nome, especialidade)")
            .eq("id", oferta.oferta_agendamento_id).eq("clinica_id", pacienteClinicaId).eq("status", "cancelado").maybeSingle();
          if (vagaError) throw vagaError;
          if (vaga) completas.push({ ...oferta, vaga });
        }
        result = completas;
        break;
      }

      case "accept_waitlist_offer": {
        const { lista_espera_id } = body;
        if (!lista_espera_id) return new Response(JSON.stringify({ error: "lista_espera_id é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data: novoId, error } = await supabase.rpc("aceitar_oferta_lista_espera", { p_lista_espera_id: lista_espera_id, p_paciente_id: pacienteId });
        if (error) throw error;
        if (!novoId) return new Response(JSON.stringify({ error: "A vaga expirou ou já foi preenchida" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = { success: true, agendamento_id: novoId, message: "Vaga reservada e consulta confirmada" };
        break;
      }

      case "confirm_retorno": {
        const { retorno_id } = body;
        if (!retorno_id) return new Response(JSON.stringify({ error: "retorno_id é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data: atual } = await supabase.from("retornos").select("historico").eq("id", retorno_id).eq("paciente_id", pacienteId).eq("clinica_id", pacienteClinicaId).single();
        const historico = Array.isArray(atual?.historico) ? atual.historico : [];
        const confirmadoEm = new Date().toISOString();
        const { data, error } = await supabase.from("retornos").update({ status: "confirmado", confirmado_em: confirmadoEm,
          historico: [...historico, { evento: "confirmado_pelo_paciente", em: confirmadoEm }] })
          .eq("id", retorno_id).eq("paciente_id", pacienteId).eq("clinica_id", pacienteClinicaId).select("id").single();
        if (error || !data) return new Response(JSON.stringify({ error: "Retorno não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = { success: true, message: "Retorno confirmado" };
        break;
      }

      case "reschedule_retorno": {
        const { retorno_id, nova_data } = body;
        const dataSolicitada = new Date(`${nova_data}T12:00:00Z`);
        if (!retorno_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(nova_data)) || Number.isNaN(dataSolicitada.getTime()) || dataSolicitada.toISOString().slice(0, 10) !== nova_data || nova_data < todayISO()) {
          return new Response(JSON.stringify({ error: "Informe hoje ou uma data futura válida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { data: retorno, error: retornoError } = await supabase.from("retornos").select("id, data_retorno_prevista, historico, status")
          .eq("id", retorno_id).eq("paciente_id", pacienteId).eq("clinica_id", pacienteClinicaId).single();
        if (retornoError || !retorno) return new Response(JSON.stringify({ error: "Retorno não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (!["pendente", "agendado"].includes(retorno.status)) {
          return new Response(JSON.stringify({ error: "Este retorno não pode mais ser remarcado pelo portal" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const historico = Array.isArray(retorno.historico) ? retorno.historico : [];
        const { data: remarcado, error } = await supabase.from("retornos").update({ data_retorno_prevista: nova_data, status: "pendente", confirmado_em: null, lembrete_enviado: false,
          historico: [...historico, { evento: "remarcado_pelo_paciente", de: retorno.data_retorno_prevista, para: nova_data, em: new Date().toISOString() }] }).eq("id", retorno_id).eq("paciente_id", pacienteId).eq("clinica_id", pacienteClinicaId).in("status", ["pendente", "agendado"]).select("id").maybeSingle();
        if (error) throw error;
        if (!remarcado) return new Response(JSON.stringify({ error: "O retorno foi atualizado. Recarregue a página e tente novamente." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = { success: true, message: "Retorno remarcado" };
        break;
      }

      case "submit_feedback": {
        const nota = Number(body.nota); const comentario = String(body.comentario || "").trim().slice(0, 2000);
        if (!Number.isInteger(nota) || nota < 1 || nota > 5) return new Response(JSON.stringify({ error: "A nota deve estar entre 1 e 5" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data: atendimento, error: atendimentoError } = await supabase.from("agendamentos").select("id, medico_id, clinica_id")
          .eq("paciente_id", pacienteId).eq("clinica_id", pacienteClinicaId).in("status", ["finalizado", "aguardando_pagamento_adicional"]).order("data", { ascending: false }).limit(1).maybeSingle();
        if (atendimentoError) throw atendimentoError;
        if (!atendimento) return new Response(JSON.stringify({ error: "Nenhum atendimento concluído para avaliar" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { error } = await supabase.from("feedbacks_nps").insert({ paciente_id: pacienteId, agendamento_id: atendimento.id, medico_id: atendimento.medico_id,
          clinica_id: atendimento.clinica_id, nota, comentario: comentario || null, categoria: "geral" });
        if (error?.code === "23505") return new Response(JSON.stringify({ error: "Este atendimento já foi avaliado" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (error) throw error;
        if (nota <= 2) {
          const { data: clinica } = await supabase.from("clinicas").select("owner_id").eq("id", atendimento.clinica_id).maybeSingle();
          const { data: admin } = clinica?.owner_id
            ? await supabase.from("profiles").select("id, nome, email").eq("id", clinica.owner_id).maybeSingle()
            : { data: null };
          if (admin?.email) await supabase.from("notification_queue").insert({ tipo: "email", destinatario_id: admin.id, destinatario_email: admin.email, destinatario_nome: admin.nome,
            assunto: "Alerta: avaliação baixa de paciente", conteudo: `Uma avaliação nota ${nota}/5 foi recebida. Comentário: ${comentario || "sem comentário"}`,
            status: "pendente", clinica_id: atendimento.clinica_id, dados_extras: { tipo: "feedback_baixo", agendamento_id: atendimento.id } });
        }
        result = { success: true };
        break;
      }

      case "get_exames": {
        const { data, error } = await supabase
          .from("exames")
          .select("id, tipo_exame, status, data_solicitacao, data_realizacao, resultado, arquivo_resultado, medicos:medico_solicitante_id(crm)")
          .eq("paciente_id", pacienteId)
          .eq("clinica_id", pacienteClinicaId)
          .order("data_solicitacao", { ascending: false })
          .limit(30);
        if (error) throw error;
        result = await Promise.all((data || []).map(async (exame: any) => {
          // Conteúdo clínico e arquivo só podem sair depois da liberação.
          // Antes disso o portal mostra apenas que o exame está em andamento.
          if (exame.status !== "laudo_disponivel") {
            return { ...exame, resultado: null, arquivo_resultado: null };
          }
          if (!exame.arquivo_resultado) return exame;
          if (/^https:\/\//i.test(exame.arquivo_resultado)) return exame;
          const { data: signed, error: signError } = await supabase.storage
            .from("medical-attachments").createSignedUrl(exame.arquivo_resultado, 300);
          if (signError) {
            console.error("Não foi possível assinar o laudo do portal", exame.id, signError.message);
            return { ...exame, arquivo_resultado: null };
          }
          return { ...exame, arquivo_resultado: signed.signedUrl };
        }));
        break;
      }

      case "get_pagamentos": {
        const { data, error } = await supabase
          .from("pagamentos_mercadopago")
          .select("id, descricao, valor, status, checkout_url, created_at, metodo_pagamento")
          .eq("paciente_id", pacienteId)
          .eq("clinica_id", pacienteClinicaId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        result = data || [];
        break;
      }

      case "get_prescricoes": {
        const { data, error } = await supabase
          .from("prescricoes")
          .select("id, medicamento, dosagem, posologia, quantidade, duracao, observacoes, tipo, data_emissao, medicos:medico_id(nome, especialidade)")
          .eq("paciente_id", pacienteId)
          .eq("clinica_id", pacienteClinicaId)
          .order("data_emissao", { ascending: false })
          .limit(50);
        if (error) throw error;
        result = data || [];
        break;
      }

      case "get_medicos": {
        if (!pacienteClinicaId) {
          result = [];
          break;
        }
        const { data, error } = await supabase
          .from("medicos")
          .select("id, nome, crm, especialidade, foto_url")
          .eq("ativo", true)
          .eq("clinica_id", pacienteClinicaId)
          .order("nome");
        if (error) throw error;
        result = data || [];
        break;
      }

      case "get_available_slots": {
        const { medico_id, data_inicio, agendamento_id } = body;
        if (!medico_id || !data_inicio) {
          return new Response(
            JSON.stringify({ error: "medico_id e data_inicio são obrigatórios" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const requestedDate = new Date(`${data_inicio}T12:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data_inicio)) || Number.isNaN(requestedDate.getTime()) || requestedDate.toISOString().slice(0, 10) !== data_inicio || data_inicio < todayISO()) {
          return new Response(JSON.stringify({ error: "Informe uma data válida, hoje ou futura" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: medicoDaClinica } = await supabase.from("medicos")
          .select("id")
          .eq("id", medico_id)
          .eq("clinica_id", pacienteClinicaId)
          .eq("ativo", true)
          .maybeSingle();
        if (!medicoDaClinica) {
          return new Response(JSON.stringify({ error: "Médico não encontrado ou inativo" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Mesma regra da confirmação (jornada, bloqueios, sobreposição e
        // horário já passado), para a lista não oferecer o que será recusado.
        let ignoreAppointmentId: string | undefined;
        if (agendamento_id) {
          const { data: consulta, error: consultaError } = await supabase.from("agendamentos")
            .select("id, medico_id, data, hora_inicio")
            .eq("id", agendamento_id)
            .eq("paciente_id", pacienteId)
            .eq("clinica_id", pacienteClinicaId)
            .in("status", ["agendado", "confirmado"])
            .maybeSingle();
          if (consultaError) throw consultaError;
          if (!consulta || consulta.medico_id !== medico_id || horarioConsultaPassou(consulta.data, consulta.hora_inicio)) {
            return new Response(JSON.stringify({ error: "Consulta não encontrada", code: "appointment_state_changed" }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          ignoreAppointmentId = consulta.id;
          // Mesmo limite que a remarcação aplica: não oferecer data que será recusada.
          const alemDoLimite = await recusarDataAlemDoLimite(supabase, pacienteClinicaId, data_inicio);
          if (alemDoLimite) {
            return new Response(JSON.stringify(alemDoLimite.body), {
              status: alemDoLimite.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        const slots = await horariosLivres(supabase, pacienteClinicaId, medico_id, data_inicio, ignoreAppointmentId);

        result = slots;
        break;
      }

      case "create_agendamento": {
        const { medico_id, data, hora_inicio, tipo } = body;
        if (!medico_id || !data || !hora_inicio || !tipo) {
          return new Response(
            JSON.stringify({ error: "medico_id, data, hora_inicio, tipo são obrigatórios" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Date-only values use the Brasília calendar, not the Edge host's UTC date.
        const requestedDate = new Date(`${data}T12:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data)) || Number.isNaN(requestedDate.getTime()) || requestedDate.toISOString().slice(0, 10) !== data || data < todayISO()) {
          return new Response(JSON.stringify({ error: "Informe uma data válida, hoje ou futura" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Validate doctor exists, is active AND belongs to the patient's clinic
        const { data: medico, error: medicoError } = await supabase
          .from("medicos")
          .select("id, ativo, clinica_id")
          .eq("id", medico_id)
          .eq("ativo", true)
          .single();

        if (medicoError || !medico) {
          return new Response(
            JSON.stringify({ error: "Médico não encontrado ou inativo" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!pacienteClinicaId || medico.clinica_id !== pacienteClinicaId) {
          return new Response(
            JSON.stringify({ error: "Médico não encontrado ou inativo" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const slot = await validatePortalSlot(supabase, pacienteClinicaId, medico_id, data, hora_inicio);
        if (slot.error) {
          return new Response(JSON.stringify({ error: slot.error }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check for existing appointment at the same time
        const { data: existingAppointment } = await supabase
          .from("agendamentos")
          .select("id")
          .eq("medico_id", medico_id)
          .eq("data", data)
          .eq("hora_inicio", hora_inicio)
          .not("status", "in", '("cancelado")')
          .limit(1);

        if (existingAppointment && existingAppointment.length > 0) {
          return new Response(
            JSON.stringify({ error: "Este horário já está ocupado. Por favor, selecione outro." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const endTime = addMinutes(hora_inicio, slot.duration);

        const { data: newAgendamento, error: insertError } = await supabase
          .from("agendamentos")
          .insert({
            paciente_id: pacienteId,
            medico_id: medico_id,
            clinica_id: pacienteClinicaId,
            data: data,
            hora_inicio: hora_inicio,
            hora_fim: endTime,
            tipo: tipo,
            status: "agendado",
            nota_cancelamento: null,
          })
          .select()
          .single();

        if (insertError) {
          console.error("Erro ao criar agendamento:", insertError);
          throw insertError;
        }
        result = { success: true, agendamento_id: newAgendamento.id, message: "Agendamento criado com sucesso! Aguarde a confirmação do consultório." };
        break;
      }

      case "cancel_agendamento": {
        const { agendamento_id, motivo, expected_data, expected_hora_inicio } = body;
        if (!agendamento_id) {
          return new Response(
            JSON.stringify({ error: "agendamento_id é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check appointment belongs to this patient
        const { data: agendamento, error: fetchError } = await supabase
          .from("agendamentos")
          .select("id, data, hora_inicio, paciente_id, status")
          .eq("id", agendamento_id)
          .eq("paciente_id", pacienteId)
          .eq("clinica_id", pacienteClinicaId)
          .single();

        if (fetchError || !agendamento) {
          return new Response(
            JSON.stringify({ error: "Agendamento não encontrado" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // A consulta pode ter mudado depois da leitura inicial. Cancelamento
        // só pode substituir estados que ainda permitem ação do paciente.
        if (agendamento.status === "cancelado") {
          result = { success: true, message: "Agendamento já estava cancelado" };
          break;
        }
        if (!['agendado', 'confirmado'].includes(agendamento.status)) {
          return new Response(
            JSON.stringify({ error: "Esta consulta não pode mais ser cancelada pelo portal", code: "appointment_state_changed" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const hasExpectedState = typeof expected_data === "string" && Object.prototype.hasOwnProperty.call(body, "expected_hora_inicio");
        const expectedDate = hasExpectedState ? expected_data : agendamento.data;
        const expectedHour = hasExpectedState ? expected_hora_inicio : agendamento.hora_inicio;
        if (hasExpectedState && (agendamento.data !== expectedDate || agendamento.hora_inicio !== expectedHour)) {
          return new Response(
            JSON.stringify({ error: "A consulta foi remarcada. Confira a data e o horário atualizados antes de cancelar.", code: "appointment_state_changed" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (horarioConsultaPassou(agendamento.data, agendamento.hora_inicio)) {
          return new Response(
            JSON.stringify({ error: "O horário desta consulta já passou; fale com a clínica para atualizar o agendamento.", code: "appointment_state_changed" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update appointment status
        let cancelQuery = supabase
          .from("agendamentos")
          .update({
            status: "cancelado",
            nota_cancelamento: String(motivo || "Cancelado pelo paciente").slice(0, 300),
            data_cancelamento: new Date().toISOString(),
          })
          .eq("id", agendamento_id)
          .eq("paciente_id", pacienteId)
          .eq("clinica_id", pacienteClinicaId)
          .eq("data", expectedDate)
          .in("status", ["agendado", "confirmado"])
        cancelQuery = expectedHour === null
          ? cancelQuery.is("hora_inicio", null)
          : cancelQuery.eq("hora_inicio", expectedHour);
        const { data: cancelado, error: updateError } = await cancelQuery.select("id").maybeSingle();

        if (updateError) throw updateError;
        if (!cancelado) {
          return new Response(
            JSON.stringify({ error: "A consulta foi atualizada. Recarregue a página e tente novamente.", code: "appointment_state_changed" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = { success: true, message: "Agendamento cancelado com sucesso" };
        break;
      }

      case "confirm_agendamento": {
        const { agendamento_id, expected_data, expected_hora_inicio } = body;
        if (!agendamento_id) return new Response(JSON.stringify({ error: "agendamento_id é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data: consulta, error: fetchError } = await supabase.from("agendamentos")
          .select("id, data, hora_inicio, status")
          .eq("id", agendamento_id).eq("paciente_id", pacienteId).eq("clinica_id", pacienteClinicaId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (consulta?.status === "confirmado") {
          result = { success: true, message: "Consulta já estava confirmada" };
          break;
        }
        if (!consulta || consulta.status !== "agendado") {
          return new Response(JSON.stringify({ error: "A consulta foi atualizada e não pode mais ser confirmada.", code: "appointment_state_changed" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const hasExpectedState = typeof expected_data === "string" && Object.prototype.hasOwnProperty.call(body, "expected_hora_inicio");
        if (hasExpectedState && (consulta.data !== expected_data || consulta.hora_inicio !== expected_hora_inicio)) {
          return new Response(JSON.stringify({ error: "A consulta foi remarcada. Confira a data e o horário atualizados antes de confirmar.", code: "appointment_state_changed" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (horarioConsultaPassou(consulta.data, consulta.hora_inicio)) {
          return new Response(JSON.stringify({ error: "O horário desta consulta já passou e ela não pode mais ser confirmada.", code: "appointment_state_changed" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        let confirmQuery = supabase.from("agendamentos")
          .update({ status: "confirmado" })
          .eq("id", agendamento_id).eq("paciente_id", pacienteId)
          .eq("clinica_id", pacienteClinicaId)
          .eq("data", hasExpectedState ? expected_data : consulta.data).eq("status", "agendado");
        const expectedHour = hasExpectedState ? expected_hora_inicio : consulta.hora_inicio;
        confirmQuery = expectedHour === null
          ? confirmQuery.is("hora_inicio", null)
          : confirmQuery.eq("hora_inicio", expectedHour);
        const { data: confirmado, error } = await confirmQuery.select("id").maybeSingle();
        if (error) throw error;
        if (!confirmado) {
          const { data: estadoAtual, error: estadoError } = await supabase.from("agendamentos")
            .select("status")
            .eq("id", agendamento_id).eq("paciente_id", pacienteId).eq("clinica_id", pacienteClinicaId)
            .maybeSingle();
          if (estadoError) throw estadoError;
          if (estadoAtual?.status === "confirmado") {
            result = { success: true, message: "Consulta já estava confirmada" };
            break;
          }
          return new Response(JSON.stringify({ error: "A consulta foi atualizada e não pode mais ser confirmada.", code: "appointment_state_changed" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        result = { success: true, message: "Consulta confirmada" };
        break;
      }

      case "get_remarcacao_limite": {
        // Só informativo para o portal (max do campo de data). A recusa de
        // fato continua em remarcarAgendamento, com o mesmo cálculo.
        result = { limite: await limiteDataRemarcacao(supabase, pacienteClinicaId) };
        break;
      }

      case "reschedule_agendamento": {
        const resposta = await remarcarAgendamento(
          supabase,
          { pacienteId, clinicaId: pacienteClinicaId },
          body,
          { validarSlot: validatePortalSlot },
        );
        if (resposta.status !== 200) {
          return new Response(JSON.stringify(resposta.body), {
            status: resposta.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = resposta.body;
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Erro portal:", error);
    if (error?.code === "23P01") {
      return new Response(JSON.stringify({ error: "Esse horário acabou de ser ocupado. Escolha outro horário disponível." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Não foi possível processar a solicitação. Tente novamente mais tarde." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
