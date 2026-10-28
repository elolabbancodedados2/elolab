/**
 * Agendamento online público — o link que a clínica divulga (site, Instagram,
 * WhatsApp) para o paciente marcar consulta sem ligar.
 *
 * Só funciona se a clínica ativou em Configurações (chave `agendamento_online`
 * com `ativo: true`). Ações:
 *   info  → nome da clínica e médicos que atendem online
 *   slots → horários livres de um médico numa data
 *   book  → cria o paciente, ou reaproveita quando CPF e data de nascimento
 *           conferem, e marca a consulta
 *
 * A consulta entra como "agendado" e a recepção confirma. Quando o CPF já
 * existe e o nascimento não confere, ou o CPF está duplicado, nada é vinculado
 * nem agendado: vira uma tarefa para a recepção resolver (CLIN-QA-003), com
 * só o mínimo para retornar o contato, e a reserva do horário é liberada
 * (ver pendencia.ts).
 *
 * Nada do cadastro do paciente é devolvido: a resposta é a mesma nos três
 * casos, para o link não servir de consulta a quem é paciente da clínica nem
 * de teste de data de nascimento.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checarRateLimit, clientIp } from '../_shared/rateLimit.ts';
import { corsPadrao } from '../_shared/cors.ts';
import { horariosLivres, validarHorario, agoraEmBrasilia, dataValida } from '../_shared/horarios.ts';
import {
  buscarCandidatosPorCpf,
  cpfValido,
  decidirVinculoPaciente,
  mascararCpf,
  normalizarDataNascimento,
  type MotivoPendencia,
} from '../_shared/identificacaoPaciente.ts';
import { liberarReserva, registrarPendenciaELiberar } from './pendencia.ts';
import { MARCADOR_AGENDAMENTO_ONLINE, OBSERVACAO_AGENDAMENTO_ONLINE } from './observacoes.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hashHoldToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function horarioPublico(valor: unknown) {
  const config = valor && typeof valor === 'object' ? valor as Record<string, unknown> : {};
  const horaValida = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const diasValidos: Record<string, string> = {
    seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta',
    sex: 'Sexta', sab: 'Sábado', dom: 'Domingo',
  };
  const dias = Array.isArray(config.diasFuncionamento)
    ? [...new Set(config.diasFuncionamento.filter((dia): dia is string => typeof dia === 'string' && Object.hasOwn(diasValidos, dia)))]
    : [];
  if (!dias.length || !horaValida(config.horarioAbertura) || !horaValida(config.horarioFechamento) ||
      String(config.horarioAbertura) >= String(config.horarioFechamento)) return null;

  const temAlmoco = Boolean(config.horarioAlmocoInicio || config.horarioAlmocoFim);
  if (temAlmoco && (!horaValida(config.horarioAlmocoInicio) || !horaValida(config.horarioAlmocoFim) ||
      String(config.horarioAlmocoInicio) >= String(config.horarioAlmocoFim) ||
      String(config.horarioAlmocoInicio) < String(config.horarioAbertura) ||
      String(config.horarioAlmocoFim) > String(config.horarioFechamento))) return null;

  let sabado: { abertura: string; fechamento: string } | null = null;
  if (dias.includes('sab')) {
    if (!horaValida(config.sabadoAbertura) || !horaValida(config.sabadoFechamento) ||
        String(config.sabadoAbertura) >= String(config.sabadoFechamento)) return null;
    sabado = { abertura: config.sabadoAbertura as string, fechamento: config.sabadoFechamento as string };
  }

  const diasUteis = dias.filter((dia) => dia !== 'sab');
  const diasLabel = ['seg', 'ter', 'qua', 'qui', 'sex'].every((dia) => diasUteis.includes(dia))
    ? ['Segunda a sexta', ...diasUteis.filter((dia) => dia === 'dom').map((dia) => diasValidos[dia])]
    : diasUteis.map((dia) => diasValidos[dia]);

  return {
    dias: diasLabel,
    abertura: config.horarioAbertura as string,
    fechamento: config.horarioFechamento as string,
    almoco: temAlmoco ? { inicio: config.horarioAlmocoInicio as string, fim: config.horarioAlmocoFim as string } : null,
    sabado,
  };
}

const MENSAGEM_PEDIDO_RECEBIDO = 'Pedido de agendamento recebido. A clínica vai entrar em contato para confirmar o horário.';

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

    if (await checarRateLimit(db, { chave: `public-booking:${ip}`, limite: 60, janelaSegundos: 60, failClosed: true })) {
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

    let horariosFuncionamento = null;
    let contatoPublico: { telefone?: string; celular?: string; email?: string } = {};
    if (action === 'info') {
      const { data: configClinica } = await db.from('configuracoes_clinica')
        .select('valor').eq('clinica_id', clinicaId).eq('chave', 'config_clinica')
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      const valores = (configClinica?.valor ?? {}) as Record<string, unknown>;
      horariosFuncionamento = horarioPublico(valores);
      contatoPublico = {
        telefone: typeof valores.telefone === 'string' ? valores.telefone : undefined,
        celular: typeof valores.celular === 'string' ? valores.celular : undefined,
        email: typeof valores.email === 'string' ? valores.email : undefined,
      };
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
      return json({ clinica: { nome: clinica.nome, ...contatoPublico }, mensagem: cfg.mensagem || null, horarios_funcionamento: horariosFuncionamento, medicos, dias_antecedencia: diasAntecedencia, hoje: agoraEmBrasilia().data });
    }

    if (action === 'slots') {
      const medicoId = String(body.medico_id || '');
      const data = String(body.data || '');
      if (!medicoLiberado(medicoId)) return json({ error: 'Profissional indisponível para agendamento online.' }, 404);
      if (!dataValida(data)) return json({ error: 'Informe uma data válida.' }, 400);
      if (data > limiteData) return json({ slots: [] });
      return json({ slots: await horariosLivres(db, clinicaId, medicoId, data) });
    }

    if (action === 'hold') {
      const medicoId = String(body.medico_id || '');
      const data = String(body.data || '');
      const hora = String(body.hora || '');
      const token = String(body.hold_token || '');
      if (!UUID.test(medicoId) || !UUID.test(token) || !dataValida(data) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
        return json({ error: 'Selecione um horário válido.' }, 400);
      }
      if (!medicoLiberado(medicoId) || data > limiteData) {
        return json({ error: 'Este horário não está disponível.' }, 409);
      }
      if (await checarRateLimit(db, { chave: `public-booking-hold:${ip}`, limite: 12, janelaSegundos: 600, failClosed: true })) {
        return json({ error: 'Muitas reservas temporárias. Aguarde alguns minutos.' }, 429);
      }
      const slot = await validarHorario(db, clinicaId, medicoId, data, hora);
      if (slot.error) return json({ error: slot.error, code: 'slot_unavailable' }, 409);
      const { data: hold, error: erroHold } = await db.rpc('reservar_horario_publico_atomico', {
        p_clinica_id: clinicaId,
        p_medico_id: medicoId,
        p_data: data,
        p_hora_inicio: hora,
        p_duracao_minutos: slot.duration,
        p_token_hash: await hashHoldToken(token),
      });
      if (erroHold) throw erroHold;
      if (!hold?.success) {
        return json({ error: 'Este horário acabou de ser reservado por outra pessoa. Escolha outro.', code: 'slot_unavailable' }, 409);
      }
      return json({ success: true, hold_token: token, expires_at: hold.expires_at });
    }

    if (action === 'release') {
      const token = String(body.hold_token || '');
      if (!UUID.test(token)) return json({ success: true });
      const erroRelease = await liberarReserva(db, clinicaId, await hashHoldToken(token));
      if (erroRelease) throw erroRelease;
      return json({ success: true });
    }

    if (action === 'book') {
      // Honeypot: campo invisível no formulário; robô preenche, pessoa não.
      if (body.website) return json({ success: true });

      const medicoId = String(body.medico_id || '');
      const data = String(body.data || '');
      const hora = String(body.hora || '');
      const holdToken = String(body.hold_token || '');
      const nome = String(body.nome || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      const cpfDigitos = String(body.cpf || '').replace(/\D/g, '');
      const telefone = String(body.telefone || '').trim().slice(0, 30);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
      const nascimento = normalizarDataNascimento(body.data_nascimento, agoraEmBrasilia().data);

      if (!body.aceite_lgpd) return json({ error: 'É preciso aceitar o uso dos dados para o agendamento.' }, 400);
      if (nome.split(' ').length < 2) return json({ error: 'Informe nome e sobrenome.' }, 400);
      if (!cpfValido(cpfDigitos)) return json({ error: 'CPF inválido.' }, 400);
      if (telefone.replace(/\D/g, '').length < 10) return json({ error: 'Informe um telefone com DDD.' }, 400);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'E-mail inválido.' }, 400);
      if (!body.data_nascimento) return json({ error: 'Informe a data de nascimento.' }, 400);
      if (!nascimento) return json({ error: 'Data de nascimento inválida.' }, 400);
      if (!medicoLiberado(medicoId)) return json({ error: 'Profissional indisponível para agendamento online.' }, 404);
      if (!dataValida(data)) return json({ error: 'Informe uma data válida.' }, 400);
      if (data > limiteData) return json({ error: 'Data além do período liberado para agendamento online.' }, 400);
      if (!UUID.test(holdToken)) return json({ error: 'Selecione novamente o horário para reservar a vaga.' }, 409);

      const slot = await validarHorario(db, clinicaId, medicoId, data, hora);
      if (slot.error) return json({ error: slot.error, code: 'slot_unavailable' }, 409);

      // Tentativas para horários inválidos não consomem a cota do paciente.
      if (await checarRateLimit(db, { chave: `public-booking-book:${ip}`, limite: 10, janelaSegundos: 3600, failClosed: true })
        || await checarRateLimit(db, { chave: `public-booking-cpf:${clinicaId}:${cpfDigitos}`, limite: 3, janelaSegundos: 86400, failClosed: true })) {
        return json({ error: 'Limite de agendamentos atingido. Entre em contato com a clínica.' }, 429);
      }

      // Paciente: só reaproveita quando há um único cadastro com o CPF e o
      // nascimento confere. O resto é ambíguo e vai para a recepção.
      const cpfMascarado = mascararCpf(cpfDigitos);
      const registrarPendencia = async (motivo: MotivoPendencia) => {
        await registrarPendenciaELiberar(db, {
          clinicaId,
          motivo,
          data,
          hora,
          medicoNome: medicos.find((m) => m.id === medicoId)?.nome || 'profissional',
          nome,
          telefone,
          hoje: agoraEmBrasilia().data,
        }, await hashHoldToken(holdToken));
        return json({ success: true, message: MENSAGEM_PEDIDO_RECEBIDO });
      };

      let decisao = decidirVinculoPaciente(await buscarCandidatosPorCpf(db, clinicaId, cpfDigitos), nascimento);
      if (decisao.tipo === 'pendente') return await registrarPendencia(decisao.motivo);

      let pacienteId: string;
      if (decisao.tipo === 'vinculado') {
        pacienteId = decisao.pacienteId;
      } else {
        const { data: novo, error: erroPaciente } = await db.from('pacientes').insert({
          clinica_id: clinicaId,
          nome,
          cpf: cpfMascarado,
          telefone,
          email: email || null,
          data_nascimento: nascimento,
        }).select('id').single();
        if (erroPaciente?.code === '23505') {
          // Outra aba pode ter criado o mesmo CPF após a consulta inicial. A
          // mesma regra de CPF + nascimento vale para o cadastro concorrente.
          decisao = decidirVinculoPaciente(await buscarCandidatosPorCpf(db, clinicaId, cpfDigitos), nascimento);
          if (decisao.tipo === 'pendente') return await registrarPendencia(decisao.motivo);
          if (decisao.tipo !== 'vinculado') throw erroPaciente;
          pacienteId = decisao.pacienteId;
        } else if (erroPaciente) {
          throw erroPaciente;
        } else {
          pacienteId = novo.id;
        }
      }

      // Um paciente não acumula vários pedidos pendentes pelo link.
      const { count: pendentes } = await db.from('agendamentos').select('id', { count: 'exact', head: true })
        .eq('clinica_id', clinicaId).eq('paciente_id', pacienteId).eq('status', 'agendado')
        .gte('data', agoraEmBrasilia().data).ilike('observacoes', `%${MARCADOR_AGENDAMENTO_ONLINE}%`);
      if ((pendentes ?? 0) >= 2) {
        return json({
          error: 'Não foi possível concluir este pedido online. Entre em contato com a clínica para continuar.',
          code: 'booking_unavailable',
        }, 409);
      }

      const { data: resultadoAgendamento, error: erroAgendamento } = await db.rpc('agendar_consulta_online_atomico', {
        p_clinica_id: clinicaId,
        p_paciente_id: pacienteId,
        p_medico_id: medicoId,
        p_data: data,
        p_hora_inicio: hora,
        p_duracao_minutos: slot.duration,
        p_observacoes: OBSERVACAO_AGENDAMENTO_ONLINE,
        p_hold_token_hash: await hashHoldToken(holdToken),
      });
      if (erroAgendamento) {
        if (erroAgendamento.code === '23P01' || String(erroAgendamento.message).includes('sobreposicao')) {
          return json({ error: 'Este horário acabou de ser ocupado. Escolha outro.', code: 'slot_unavailable' }, 409);
        }
        throw erroAgendamento;
      }
      if (!resultadoAgendamento?.success) {
        const code = resultadoAgendamento?.code;
        const error = resultadoAgendamento?.error || 'Este horário não está mais disponível.';
        return json({ error, code }, 409);
      }

      return json({ success: true, message: MENSAGEM_PEDIDO_RECEBIDO });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (err) {
    console.error('[public-booking]', err);
    return json({ error: 'Não foi possível concluir agora. Tente novamente em instantes.' }, 500);
  }
});
