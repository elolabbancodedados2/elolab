import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionApiUrl = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
    const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error("Evolution API não configurada");
      return new Response(JSON.stringify({ error: "WhatsApp não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { action } = body;

    let result: any;

    switch (action) {
      case "send_appointment_confirmation":
        result = await sendAppointmentConfirmation(body, supabase, evolutionApiUrl, evolutionApiKey);
        break;
      case "send_appointment_reminder":
        result = await sendAppointmentReminder(body, supabase, evolutionApiUrl, evolutionApiKey);
        break;
      case "send_exam_result":
        result = await sendExamResult(body, supabase, evolutionApiUrl, evolutionApiKey);
        break;
      case "send_custom_message":
        result = await sendCustomMessage(body, supabase, evolutionApiUrl, evolutionApiKey);
        break;
      case "send_bulk_reminders":
        result = await sendBulkReminders(supabase, evolutionApiUrl, evolutionApiKey);
        break;
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
    console.error("Erro:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getActiveInstance(supabase: any) {
  const { data } = await supabase
    .from("whatsapp_sessions")
    .select("instance_name")
    .eq("status", "connected")
    .limit(1)
    .single();
  return data?.instance_name;
}

async function sendWhatsAppMessage(
  instanceName: string,
  phone: string,
  message: string,
  evolutionApiUrl: string,
  evolutionApiKey: string
) {
  // Clean phone number
  const cleanPhone = phone.replace(/\D/g, "");
  const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

  const response = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evolutionApiKey,
    },
    body: JSON.stringify({
      number: formattedPhone,
      text: message,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Erro ao enviar WhatsApp para ${formattedPhone}:`, errorText);
    throw new Error(`Erro ao enviar mensagem: ${errorText}`);
  }

  return await response.json();
}

async function sendAppointmentConfirmation(
  body: any,
  supabase: any,
  evolutionApiUrl: string,
  evolutionApiKey: string
) {
  const { agendamento_id } = body;

  const { data: agendamento } = await supabase
    .from("agendamentos")
    .select("*, pacientes(nome, telefone), medicos(crm, nome, especialidade)")
    .eq("id", agendamento_id)
    .single();

  if (!agendamento?.pacientes?.telefone) {
    return { success: false, message: "Paciente sem telefone cadastrado" };
  }

  const instanceName = await getActiveInstance(supabase);
  if (!instanceName) {
    return { success: false, message: "Nenhuma sessão WhatsApp ativa" };
  }

  const medicoNome = agendamento.medicos?.nome ? `Dr(a). ${agendamento.medicos.nome}` : `Dr(a). CRM ${agendamento.medicos?.crm}`;
  const dataFormatada = formatDateBR(agendamento.data);

  const message = `✅ *Confirmação de Consulta - EloLab*\n\nOlá, ${agendamento.pacientes.nome}!\n\nSua consulta está agendada:\n📅 Data: ${dataFormatada}\n🕐 Horário: ${agendamento.hora_inicio}\n👨‍⚕️ Médico: ${medicoNome}\n📋 Tipo: ${agendamento.tipo || "Consulta"}\n\nResponda *SIM* para confirmar ou *NÃO* para cancelar.\n\n_EloLab Clínica_`;

  await sendWhatsAppMessage(instanceName, agendamento.pacientes.telefone, message, evolutionApiUrl, evolutionApiKey);

  // Log
  await supabase.from("automation_logs").insert({
    tipo: "whatsapp",
    nome: "Confirmação de Consulta WhatsApp",
    status: "sucesso",
    registros_processados: 1,
    registros_sucesso: 1,
    detalhes: { agendamento_id, paciente: agendamento.pacientes.nome },
  });

  return { success: true, message: "Confirmação enviada" };
}

async function sendAppointmentReminder(
  body: any,
  supabase: any,
  evolutionApiUrl: string,
  evolutionApiKey: string
) {
  const { agendamento_id } = body;

  const { data: agendamento } = await supabase
    .from("agendamentos")
    .select("*, pacientes(nome, telefone), medicos(crm, nome, especialidade)")
    .eq("id", agendamento_id)
    .single();

  if (!agendamento?.pacientes?.telefone) {
    return { success: false, message: "Paciente sem telefone" };
  }

  const instanceName = await getActiveInstance(supabase);
  if (!instanceName) return { success: false, message: "Sem sessão WhatsApp ativa" };

  const medicoNome = agendamento.medicos?.nome ? `Dr(a). ${agendamento.medicos.nome}` : `Dr(a). CRM ${agendamento.medicos?.crm}`;
  const dataFormatada = formatDateBR(agendamento.data);

  const message = `⏰ *Lembrete de Consulta - EloLab*\n\nOlá, ${agendamento.pacientes.nome}!\n\nLembramos que você tem uma consulta amanhã:\n📅 Data: ${dataFormatada}\n🕐 Horário: ${agendamento.hora_inicio}\n👨‍⚕️ Médico: ${medicoNome}\n\nNão se esqueça de trazer seus documentos e exames anteriores.\n\n_EloLab Clínica_`;

  await sendWhatsAppMessage(instanceName, agendamento.pacientes.telefone, message, evolutionApiUrl, evolutionApiKey);

  await supabase.from("automation_logs").insert({
    tipo: "whatsapp",
    nome: "Lembrete de Consulta WhatsApp",
    status: "sucesso",
    registros_processados: 1,
    registros_sucesso: 1,
    detalhes: { agendamento_id, paciente: agendamento.pacientes.nome },
  });

  return { success: true, message: "Lembrete enviado" };
}

async function sendExamResult(
  body: any,
  supabase: any,
  evolutionApiUrl: string,
  evolutionApiKey: string
) {
  const { exame_id } = body;

  const { data: exame } = await supabase
    .from("exames")
    .select("*, pacientes(nome, telefone)")
    .eq("id", exame_id)
    .single();

  if (!exame?.pacientes?.telefone) {
    return { success: false, message: "Paciente sem telefone" };
  }

  const instanceName = await getActiveInstance(supabase);
  if (!instanceName) return { success: false, message: "Sem sessão WhatsApp ativa" };

  const message = `🔬 *Resultado de Exame Disponível - EloLab*\n\nOlá, ${exame.pacientes.nome}!\n\nSeu resultado de exame está disponível:\n📋 Exame: ${exame.tipo_exame}\n📅 Realizado em: ${exame.data_realizacao || "N/A"}\n\nEntre em contato com a clínica para mais informações ou agende sua consulta de retorno.\n\n_EloLab Clínica_`;

  await sendWhatsAppMessage(instanceName, exame.pacientes.telefone, message, evolutionApiUrl, evolutionApiKey);

  await supabase.from("automation_logs").insert({
    tipo: "whatsapp",
    nome: "Resultado de Exame WhatsApp",
    status: "sucesso",
    registros_processados: 1,
    registros_sucesso: 1,
    detalhes: { exame_id, paciente: exame.pacientes.nome },
  });

  return { success: true, message: "Notificação de resultado enviada" };
}

async function sendCustomMessage(
  body: any,
  supabase: any,
  evolutionApiUrl: string,
  evolutionApiKey: string
) {
  const { phone, message } = body;

  const instanceName = await getActiveInstance(supabase);
  if (!instanceName) return { success: false, message: "Sem sessão WhatsApp ativa" };

  await sendWhatsAppMessage(instanceName, phone, message, evolutionApiUrl, evolutionApiKey);
  return { success: true, message: "Mensagem enviada" };
}

async function sendBulkReminders(
  supabase: any,
  evolutionApiUrl: string,
  evolutionApiKey: string
) {
  // Get tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const { data: agendamentos } = await supabase
    .from("agendamentos")
    .select("id, data, hora_inicio, tipo, pacientes(nome, telefone), medicos(crm, nome)")
    .eq("data", tomorrowStr)
    .in("status", ["agendado", "confirmado"]);

  if (!agendamentos?.length) {
    return { success: true, message: "Nenhum agendamento para amanhã", enviados: 0 };
  }

  const instanceName = await getActiveInstance(supabase);
  if (!instanceName) return { success: false, message: "Sem sessão WhatsApp ativa" };

  let enviados = 0;
  let erros = 0;

  for (const ag of agendamentos) {
    if (!ag.pacientes?.telefone) continue;

    try {
      const message = `⏰ *Lembrete - EloLab*\n\nOlá, ${ag.pacientes.nome}! Lembramos que você tem consulta amanhã às ${ag.hora_inicio}.\n\nConfirme sua presença respondendo *SIM*.\n\n_EloLab Clínica_`;

      await sendWhatsAppMessage(instanceName, ag.pacientes.telefone, message, evolutionApiUrl, evolutionApiKey);
      enviados++;

      // Small delay between messages
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`Erro ao enviar para ${ag.pacientes.nome}:`, e);
      erros++;
    }
  }

  await supabase.from("automation_logs").insert({
    tipo: "whatsapp",
    nome: "Lembretes em Massa WhatsApp",
    status: erros === 0 ? "sucesso" : "parcial",
    registros_processados: agendamentos.length,
    registros_sucesso: enviados,
    registros_erro: erros,
    detalhes: { data: tomorrowStr },
  });

  return { success: true, enviados, erros, total: agendamentos.length };
}

function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}
