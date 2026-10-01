/**
 * Agendamento online público — o link que a clínica divulga (site, Instagram,
 * WhatsApp) para o paciente marcar consulta sem ligar.
 *
 * Só funciona se a clínica ativou em Configurações (chave `agendamento_online`
 * com `ativo: true`). Ações:
 *   info  → nome da clínica e médicos que atendem online
 *   slots → horários livres de um médico numa data
 *   book  → cria (ou reaproveita, pelo CPF) o paciente e marca a consulta
 *
 * A consulta entra como "agendado" e a recepção confirma. Nada do cadastro do
 * paciente é devolvido: a resposta é igual exista ou não o CPF, para o link não
 * servir de consulta a quem é paciente da clínica.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checarRateLimit, clientIp } from '../_shared/rateLimit.ts';
import { corsPadrao } from '../_shared/cors.ts';
import { horariosLivres, validarHorario, agoraEmBrasilia, dataValida } from '../_shared/horarios.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

const mascararCpf = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;

function somarMinutos(hora: string, minutos: number) {
  const [h, m] = hora.split(':').map(Number);
  const t = (h * 60 + m + minutos) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

async function buscarPacientePorCpf(db: any, clinicaId: string, cpf: string): Promise<string | null> {
  const { data, error } = await db.rpc('find_patient_id_by_normalized_cpf', {
    p_clinica_id: clinicaId,
    p_cpf: cpf,
  });
  if (error) throw error;
  return typeof data === 'string' ? data : null;
}

Deno.serve(async (req) => {
  const corsHeaders = { ...corsPadrao(req), 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const clinicaId = String(body.clinica_id || '');
    const ip = clientIp(req);

    if (await checarRateLimit(db, { chave: `public-booking:${ip}`, limite: 60, janelaSegundos: 60 })) {
      return json({ error: 'Muitas tentativas. Aguarde um instante.' }, 429);
    }
    if (!UUID.test(clinicaId)) return json({ error: 'Link de agendamento inválido.' }, 404);

    // Clínica ativa e com agendamento online ligado.
    const [{ data: clinica }, { data: config }] = await Promise.all([
      db.from('clinicas').select('id, nome, suspensa, arquivada').eq('id', clinicaId).maybeSingle(),
      db.from('configuracoes_clinica').select('valor').eq('clinica_id', clinicaId).eq('chave', 'agendamento_online')
        .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const cfg = (config?.valor ?? {}) as { ativo?: boolean; medicos?: string[]; mensagem?: string; dias_antecedencia?: number };
    if (!clinica || clinica.suspensa || clinica.arquivada || !cfg.ativo) {
      return json({ error: 'Esta clínica não está recebendo agendamentos online no momento.' }, 404);
    }

    // Médicos liberados: ativos, com disponibilidade cadastrada e (se a clínica
    // restringiu) na lista escolhida.
    const { data: medicosRaw } = await db.from('medicos')
      .select('id, nome, especialidade, medico_disponibilidade!inner(ativo)')
      .eq('clinica_id', clinicaId).eq('ativo', true).eq('medico_disponibilidade.ativo', true)
      .order('nome');
    const vistos = new Set<string>();
    const medicos = (medicosRaw ?? [])
      .filter((m: any) => !vistos.has(m.id) && vistos.add(m.id))
      .filter((m: any) => !cfg.medicos?.length || cfg.medicos.includes(m.id))
      .map((m: any) => ({ id: m.id, nome: m.nome, especialidade: m.especialidade }));
    const medicoLiberado = (id: string) => medicos.some((m) => m.id === id);
    const diasAntecedencia = Math.min(Math.max(Number(cfg.dias_antecedencia) || 60, 1), 180);
    const limiteData = (() => {
      const d = new Date(`${agoraEmBrasilia().data}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + diasAntecedencia);
      return d.toISOString().slice(0, 10);
    })();

    if (action === 'info') {
      return json({ clinica: { nome: clinica.nome }, mensagem: cfg.mensagem || null, medicos, dias_antecedencia: diasAntecedencia, hoje: agoraEmBrasilia().data });
    }

    if (action === 'slots') {
      const medicoId = String(body.medico_id || '');
      const data = String(body.data || '');
      if (!medicoLiberado(medicoId)) return json({ error: 'Profissional indisponível para agendamento online.' }, 404);
      if (!dataValida(data)) return json({ error: 'Informe uma data válida.' }, 400);
      if (data > limiteData) return json({ slots: [] });
      return json({ slots: await horariosLivres(db, clinicaId, medicoId, data) });
    }

    if (action === 'book') {
      // Honeypot: campo invisível no formulário; robô preenche, pessoa não.
      if (body.website) return json({ success: true });

      const medicoId = String(body.medico_id || '');
      const data = String(body.data || '');
      const hora = String(body.hora || '');
      const nome = String(body.nome || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      const cpfDigitos = String(body.cpf || '').replace(/\D/g, '');
      const telefone = String(body.telefone || '').trim().slice(0, 30);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
      const nascimento = String(body.data_nascimento || '');

      if (!body.aceite_lgpd) return json({ error: 'É preciso aceitar o uso dos dados para o agendamento.' }, 400);
      if (nome.split(' ').length < 2) return json({ error: 'Informe nome e sobrenome.' }, 400);
      if (!cpfValido(cpfDigitos)) return json({ error: 'CPF inválido.' }, 400);
      if (telefone.replace(/\D/g, '').length < 10) return json({ error: 'Informe um telefone com DDD.' }, 400);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'E-mail inválido.' }, 400);
      if (nascimento && (!dataValida(nascimento) || nascimento > agoraEmBrasilia().data)) return json({ error: 'Data de nascimento inválida.' }, 400);
      if (!medicoLiberado(medicoId)) return json({ error: 'Profissional indisponível para agendamento online.' }, 404);
      if (!dataValida(data)) return json({ error: 'Informe uma data válida.' }, 400);
      if (data > limiteData) return json({ error: 'Data além do período liberado para agendamento online.' }, 400);

      const slot = await validarHorario(db, clinicaId, medicoId, data, hora);
      if (slot.error) return json({ error: slot.error, code: 'slot_unavailable' }, 409);

      // Tentativas para horários inválidos não consomem a cota do paciente.
      if (await checarRateLimit(db, { chave: `public-booking-book:${ip}`, limite: 10, janelaSegundos: 3600 })
        || await checarRateLimit(db, { chave: `public-booking-cpf:${clinicaId}:${cpfDigitos}`, limite: 3, janelaSegundos: 86400 })) {
        return json({ error: 'Limite de agendamentos atingido. Entre em contato com a clínica.' }, 429);
      }

      // Paciente: reaproveita pelo CPF (com ou sem máscara) dentro da clínica.
      const cpfMascarado = mascararCpf(cpfDigitos);
      let pacienteId = await buscarPacientePorCpf(db, clinicaId, cpfDigitos);

      if (!pacienteId) {
        const { data: novo, error: erroPaciente } = await db.from('pacientes').insert({
          clinica_id: clinicaId,
          nome,
          cpf: cpfMascarado,
          telefone,
          email: email || null,
          data_nascimento: nascimento || null,
        }).select('id').single();
        if (erroPaciente?.code === '23505') {
          // Outra aba pode ter criado o mesmo CPF após a consulta inicial.
          const concorrente = await buscarPacientePorCpf(db, clinicaId, cpfDigitos);
          if (!concorrente) throw erroPaciente;
          pacienteId = concorrente;
        } else if (erroPaciente) {
          throw erroPaciente;
        } else {
          pacienteId = novo.id;
        }
      }

      // Um paciente não acumula vários pedidos pendentes pelo link.
      const { count: pendentes } = await db.from('agendamentos').select('id', { count: 'exact', head: true })
        .eq('clinica_id', clinicaId).eq('paciente_id', pacienteId).eq('status', 'agendado')
        .gte('data', agoraEmBrasilia().data).ilike('observacoes', '%[agendamento online]%');
      if ((pendentes ?? 0) >= 2) {
        return json({ error: 'Você já tem agendamentos aguardando confirmação. Entre em contato com a clínica.' }, 409);
      }

      const { error: erroAgendamento } = await db.from('agendamentos').insert({
        clinica_id: clinicaId,
        paciente_id: pacienteId,
        medico_id: medicoId,
        data,
        hora_inicio: hora,
        hora_fim: somarMinutos(hora, slot.duration),
        tipo: 'consulta',
        status: 'agendado',
        observacoes: `[agendamento online] Marcado pelo paciente no link público. Confirmar com o paciente.\nNome informado: ${nome}\nTelefone informado: ${telefone}${email ? `\nE-mail informado: ${email}` : ''}`,
      });
      if (erroAgendamento) {
        const sobreposto = erroAgendamento.code === '23P01' || String(erroAgendamento.message).includes('sobreposicao');
        if (sobreposto) return json({ error: 'Este horário acabou de ser ocupado. Escolha outro.', code: 'slot_unavailable' }, 409);
        throw erroAgendamento;
      }

      return json({ success: true, message: 'Pedido de agendamento enviado! A clínica vai entrar em contato para confirmar.' });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (err) {
    console.error('[public-booking]', err);
    return json({ error: 'Não foi possível concluir agora. Tente novamente em instantes.' }, 500);
  }
});
