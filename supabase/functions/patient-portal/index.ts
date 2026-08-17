import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checarRateLimit, clientIp } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Data de hoje em "YYYY-MM-DD", para comparar com colunas `date` do Postgres. */
function todayISO(): string {
  return new Date().toISOString().split("T")[0];
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    // Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from("paciente_portal_tokens")
      .select("*, pacientes(id, nome, email, telefone, foto_url, cpf, data_nascimento, sexo, alergias, observacoes, clinica_id)")
      .eq("token", token)
      .eq("ativo", true)
      .gte("expires_at", new Date().toISOString())
      .single();

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

      case "get_agendamentos": {
        const { data } = await supabase
          .from("agendamentos")
          .select("id, data, hora_inicio, hora_fim, tipo, status, medicos(nome, crm, especialidade)")
          .eq("paciente_id", pacienteId)
          .order("data", { ascending: false })
          .limit(50);
        result = data || [];
        break;
      }

      case "get_historico": {
        const { data } = await supabase
          .from("agendamentos")
          .select("id, data, hora_inicio, tipo, status, medicos(crm, especialidade)")
          .eq("paciente_id", pacienteId)
          .lt("data", new Date().toISOString().split("T")[0])
          .order("data", { ascending: false })
          .limit(50);
        result = data || [];
        break;
      }

      case "get_exames": {
        const { data } = await supabase
          .from("exames")
          .select("id, tipo_exame, status, data_solicitacao, data_realizacao, resultado, medicos:medico_solicitante_id(crm)")
          .eq("paciente_id", pacienteId)
          .order("data_solicitacao", { ascending: false })
          .limit(30);
        result = data || [];
        break;
      }

      case "get_pagamentos": {
        const { data } = await supabase
          .from("pagamentos_mercadopago")
          .select("id, descricao, valor, status, checkout_url, created_at, metodo_pagamento")
          .eq("paciente_id", pacienteId)
          .order("created_at", { ascending: false })
          .limit(20);
        result = data || [];
        break;
      }

      case "get_prescricoes": {
        const { data } = await supabase
          .from("prescricoes")
          .select("id, medicamento, dosagem, posologia, quantidade, duracao, observacoes, tipo, data_emissao, medicos:medico_id(nome, especialidade)")
          .eq("paciente_id", pacienteId)
          .order("data_emissao", { ascending: false })
          .limit(50);
        result = data || [];
        break;
      }

      case "get_medicos": {
        if (!pacienteClinicaId) {
          result = [];
          break;
        }
        const { data } = await supabase
          .from("medicos")
          .select("id, nome, crm, especialidade, foto_url")
          .eq("ativo", true)
          .eq("clinica_id", pacienteClinicaId)
          .order("nome");
        result = data || [];
        break;
      }

      case "get_available_slots": {
        const { medico_id, data_inicio } = body;
        if (!medico_id || !data_inicio) {
          return new Response(
            JSON.stringify({ error: "medico_id e data_inicio são obrigatórios" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get doctor availability for this day of week
        const appointmentDate = new Date(data_inicio);
        const dayOfWeek = appointmentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

        const { data: disponibilidade, error: dispError } = await supabase
          .from("medico_disponibilidade")
          .select("hora_inicio, hora_fim, duracao_consulta, intervalo_consultas")
          .eq("medico_id", medico_id)
          .eq("dia_semana", dayOfWeek)
          .eq("ativo", true)
          .single();

        if (dispError || !disponibilidade) {
          // No availability configured for this day
          return new Response(
            JSON.stringify({ error: "O médico não tem agendamentos disponíveis neste dia" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get all appointments for this doctor on this date (excluding cancelled)
        const { data: agendados } = await supabase
          .from("agendamentos")
          .select("hora_inicio, hora_fim")
          .eq("medico_id", medico_id)
          .eq("data", data_inicio)
          .not("status", "in", '("cancelado")');

        // Generate slots based on doctor's availability
        const slots = [];
        const [startHour, startMin] = disponibilidade.hora_inicio.split(":").map(Number);
        const [endHour, endMin] = disponibilidade.hora_fim.split(":").map(Number);
        const duration = disponibilidade.duracao_consulta; // in minutes
        const interval = disponibilidade.intervalo_consultas; // in minutes
        const slotDuration = duration + interval;

        let currentMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        while (currentMinutes + duration <= endMinutes) {
          const hour = Math.floor(currentMinutes / 60);
          const min = currentMinutes % 60;
          const slotTime = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;

          // Check if slot is booked
          const isBooked = agendados?.some(
            a => a.hora_inicio && a.hora_inicio.slice(0, 5) === slotTime
          );

          if (!isBooked) {
            slots.push(slotTime);
          }

          currentMinutes += slotDuration;
        }

        result = slots.length > 0 ? slots : { error: "Nenhum horário disponível neste dia" };
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

        // Validate date is in the future or today
        const appointmentDate = new Date(data);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (appointmentDate < today) {
          return new Response(
            JSON.stringify({ error: "A data do agendamento não pode ser no passado" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
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

        const endTime = addMinutes(hora_inicio, 30);

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
            status: "pendente",
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
        const { agendamento_id, motivo } = body;
        if (!agendamento_id) {
          return new Response(
            JSON.stringify({ error: "agendamento_id é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check appointment belongs to this patient
        const { data: agendamento, error: fetchError } = await supabase
          .from("agendamentos")
          .select("id, data, paciente_id")
          .eq("id", agendamento_id)
          .eq("paciente_id", pacienteId)
          .single();

        if (fetchError || !agendamento) {
          return new Response(
            JSON.stringify({ error: "Agendamento não encontrado" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Cannot cancel past appointments. `data` has no time component, so
        // comparing it against `now` used to block same-day cancellations.
        if (agendamento.data < todayISO()) {
          return new Response(
            JSON.stringify({ error: "Não é possível cancelar agendamentos passados" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update appointment status
        const { error: updateError } = await supabase
          .from("agendamentos")
          .update({
            status: "cancelado",
            nota_cancelamento: motivo || "Cancelado pelo paciente",
            data_cancelamento: new Date().toISOString(),
          })
          .eq("id", agendamento_id);

        if (updateError) throw updateError;
        result = { success: true, message: "Agendamento cancelado com sucesso" };
        break;
      }

      case "reschedule_agendamento": {
        const { agendamento_id, nova_data, novo_horario } = body;
        if (!agendamento_id || !nova_data || !novo_horario) {
          return new Response(
            JSON.stringify({ error: "agendamento_id, nova_data, novo_horario são obrigatórios" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Fetch original appointment
        const { data: agendamento, error: fetchError } = await supabase
          .from("agendamentos")
          .select("id, medico_id, data, paciente_id, tipo")
          .eq("id", agendamento_id)
          .eq("paciente_id", pacienteId)
          .single();

        if (fetchError || !agendamento) {
          return new Response(
            JSON.stringify({ error: "Agendamento não encontrado" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate new date is not in past (date-only comparison, see above)
        if (nova_data < todayISO()) {
          return new Response(
            JSON.stringify({ error: "A nova data não pode ser no passado" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check no double-booking at new time
        const { data: conflictingSlots } = await supabase
          .from("agendamentos")
          .select("id")
          .eq("medico_id", agendamento.medico_id)
          .eq("data", nova_data)
          .eq("hora_inicio", novo_horario)
          .not("status", "in", '("cancelado")')
          .neq("id", agendamento_id)
          .limit(1);

        if (conflictingSlots && conflictingSlots.length > 0) {
          return new Response(
            JSON.stringify({ error: "Este horário já está ocupado na nova data" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const endTime = addMinutes(novo_horario, 30);

        // Update appointment
        const { error: updateError } = await supabase
          .from("agendamentos")
          .update({
            data: nova_data,
            hora_inicio: novo_horario,
            hora_fim: endTime,
            status: "pendente",
          })
          .eq("id", agendamento_id);

        if (updateError) throw updateError;
        result = { success: true, message: "Agendamento remarcado com sucesso" };
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
