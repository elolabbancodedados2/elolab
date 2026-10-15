import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsPadrao } from '../_shared/cors.ts';
import { mfaRequiredResponse } from '../_shared/authMfa.ts';
import { autorizarAcaoMemed } from '../_shared/memedAuthorization.ts';
import { extrairIdentificadoresCallbackMemed, verificarPrescricaoMemedOficial } from '../_shared/memedPrescriptionVerification.ts';

let corsHeaders: Record<string, string> = {};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function nomePartes(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return { nome: partes[0] ?? '', sobrenome: partes.slice(1).join(' ') };
}

function dataMemed(data: string | null | undefined): string {
  if (!data) return '';
  const [ano, mes, dia] = data.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '';
}

function dataISO(data: unknown): string | null {
  if (typeof data !== 'string') return null;
  const match = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function prescriptionId(payload: Record<string, any>): string {
  const value = payload.prescriptionUuid
    ?? payload.prescricao?.prescriptionUuid
    ?? payload.prescricao?.uuid
    ?? payload.uuid;
  return typeof value === 'string' ? value.slice(0, 200) : '';
}

function ambienteMemed() {
  const ambiente = (Deno.env.get('MEMED_AMBIENTE') ?? 'homologacao').toLowerCase();
  if (['producao', 'production', 'prod'].includes(ambiente)) {
    return {
      apiUrl: 'https://api.memed.com.br/v1',
      scriptUrl: 'https://partners.memed.com.br/integration.js',
    };
  }
  if (!['homologacao', 'homologation', 'homolog', 'qa', 'test'].includes(ambiente)) {
    throw new Error('MEMED_INVALID_ENVIRONMENT');
  }
  return {
    apiUrl: 'https://integrations.api.memed.com.br/v1',
    scriptUrl: 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js',
  };
}

async function memedRequest(path: string, method: 'GET' | 'POST', body?: unknown) {
  const apiKey = Deno.env.get('MEMED_API_KEY');
  const secretKey = Deno.env.get('MEMED_SECRET_KEY');
  if (!apiKey || !secretKey) throw new Error('MEMED_NOT_CONFIGURED');

  const { apiUrl } = ambienteMemed();
  const url = new URL(`${apiUrl}${path}`);
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('secret-key', secretKey);
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/json',
      ...(method === 'GET' ? { 'Cache-Control': 'no-cache' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function memedPrescriptionRequest(prescriptionId: string, prescriberToken: string) {
  const { apiUrl } = ambienteMemed();
  const url = new URL(`${apiUrl}/prescricoes/${encodeURIComponent(prescriptionId)}`);
  url.searchParams.set('structuredDocuments', 'true');
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Authorization: `Bearer ${prescriberToken}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function registrarStatusMemed(
  service: any,
  clinicaId: string,
  medicoId: string,
  status: 'conectado' | 'erro',
  ultimoErro: string | null,
) {
  const agora = new Date().toISOString();
  const { data: existente } = await service.from('integracoes_clinica')
    .select('id').eq('clinica_id', clinicaId).eq('provedor', 'memed').eq('referencia_id', medicoId).maybeSingle();
  const linha = { status, ultimo_erro: ultimoErro, ultimo_teste_em: agora, updated_at: agora };
  if (existente) {
    await service.from('integracoes_clinica').update(linha).eq('id', (existente as any).id);
  } else {
    await service.from('integracoes_clinica').insert({
      clinica_id: clinicaId, provedor: 'memed', referencia_id: medicoId, config: {}, conectado_em: agora, ...linha,
    });
  }
}

async function tokenPrescritorMemed(medicoId: string): Promise<string> {
  const result = await memedRequest(`/sinapse-prescricao/usuarios/${encodeURIComponent(medicoId)}`, 'GET');
  const token = result.data?.data?.attributes?.token;
  if (!result.response.ok || typeof token !== 'string' || !token) throw new Error('MEMED_PRESCRIBER_TOKEN_UNAVAILABLE');
  return token;
}

Deno.serve(async (req) => {
  corsHeaders = corsPadrao(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = req.headers.get('Authorization') ?? '';
    if (!supabaseUrl || !anonKey || !serviceKey || !authorization) {
      return json({ error: 'Não autenticado.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const mfaDenied = mfaRequiredResponse(req, user, corsHeaders);
    if (mfaDenied) return mfaDenied;

    const service = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await service.from('profiles').select('clinica_id').eq('id', user.id).maybeSingle();
    const clinicaId = (profile as any)?.clinica_id as string | undefined;
    if (!clinicaId) return json({ error: 'Usuário sem clínica associada.' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');
    const medicoId = String(body.medicoId ?? '');
    const pacienteId = String(body.pacienteId ?? '');
    if (!['prepare', 'prescription_printed', 'prescription_deleted'].includes(action)) {
      return json({ error: 'Ação inválida.' }, 400);
    }
    if (!medicoId || !pacienteId) return json({ error: 'Selecione o médico e o paciente.' }, 400);

    const [{ data: roles }, { data: medico }, { data: paciente }] = await Promise.all([
      service.from('user_roles').select('role').eq('user_id', user.id),
      service.from('medicos')
        .select('id, user_id, clinica_id, nome, cpf, crm, crm_uf, tipo_registro, data_nascimento, email, telefone, especialidade, ativo')
        .eq('id', medicoId).eq('clinica_id', clinicaId).maybeSingle(),
      service.from('pacientes')
        .select('id, clinica_id, nome, cpf, data_nascimento, sexo, telefone, email')
        .eq('id', pacienteId).eq('clinica_id', clinicaId).maybeSingle(),
    ]);
    if (!medico || !paciente) return json({ error: 'Médico ou paciente não pertence a esta clínica.' }, 404);
    if (!autorizarAcaoMemed(action, user.id, (roles ?? []).map((item: any) => item.role), medico as any, clinicaId)) {
      return json({ error: 'Somente o médico ativo vinculado à própria conta pode operar esta prescrição.' }, 403);
    }

    if (action === 'prepare') {
      const apiKey = Deno.env.get('MEMED_API_KEY');
      const secretKey = Deno.env.get('MEMED_SECRET_KEY');
      if (!apiKey || !secretKey) return json({ error: 'Memed ainda não configurada no backend.' }, 503);

      const partes = nomePartes((medico as any).nome ?? '');
      const cpfMedico = digits((medico as any).cpf);
      const nascimentoMedico = dataMemed((medico as any).data_nascimento);
      const registro = String((medico as any).tipo_registro || 'CRM').trim().toUpperCase();
      const numeroRegistro = digits((medico as any).crm);
      const uf = String((medico as any).crm_uf ?? '').trim().toUpperCase();
      if (!partes.nome || !partes.sobrenome || cpfMedico.length !== 11 || !nascimentoMedico || !numeroRegistro || uf.length !== 2) {
        const mensagem = 'Complete nome e sobrenome, CPF, data de nascimento, conselho, número e UF do médico.';
        await registrarStatusMemed(service, clinicaId, medicoId, 'erro', mensagem).catch(() => {});
        return json({ error: mensagem }, 422);
      }
      const pacienteNome = String((paciente as any).nome ?? '').trim();
      const sexo = String((paciente as any).sexo ?? '').toLowerCase();
      const sexoMemed = sexo.startsWith('f') ? 'Feminino' : sexo.startsWith('m') ? 'Masculino' : '';
      if (!pacienteNome || !sexoMemed) {
        return json({ error: 'Complete o nome e o sexo do paciente antes de abrir a Memed.' }, 422);
      }

      const externalId = encodeURIComponent(String((medico as any).id));
      let result = await memedRequest(`/sinapse-prescricao/usuarios/${externalId}`, 'GET');
      if (result.response.status === 404) {
        const registration = {
          data: {
            type: 'usuarios',
            attributes: {
              external_id: (medico as any).id,
              nome: partes.nome,
              sobrenome: partes.sobrenome,
              cpf: cpfMedico,
              board: { board_code: registro, board_number: numeroRegistro, board_state: uf },
              email: (medico as any).email || undefined,
              telefone: digits((medico as any).telefone) || undefined,
              data_nascimento: nascimentoMedico,
            },
          },
        };
        result = await memedRequest('/sinapse-prescricao/usuarios', 'POST', registration);
      }
      if (!result.response.ok) {
        // Não registrar nem devolver URL, chaves, token ou corpo da resposta Memed.
        console.error('[memed-prescription] API request failed', { status: result.response.status });
        const mensagem = 'A Memed não conseguiu validar ou cadastrar este prescritor. Confira os dados profissionais.';
        await registrarStatusMemed(service, clinicaId, medicoId, 'erro', mensagem).catch(() => {});
        return json({ error: mensagem }, 502);
      }

      const token = result.data?.data?.attributes?.token;
      if (typeof token !== 'string' || !token) {
        console.error('[memed-prescription] API response missing prescriber token');
        const mensagem = 'A Memed não retornou o token do prescritor.';
        await registrarStatusMemed(service, clinicaId, medicoId, 'erro', mensagem).catch(() => {});
        return json({ error: mensagem }, 502);
      }

      await registrarStatusMemed(service, clinicaId, medicoId, 'conectado', null).catch(() => {});
      return json({ token, scriptUrl: ambienteMemed().scriptUrl, ambiente: Deno.env.get('MEMED_AMBIENTE') ?? 'homologacao' });
    }

    if (action === 'prescription_printed' || action === 'prescription_deleted') {
      const callbackPayload = body.payload;
      if (!callbackPayload || typeof callbackPayload !== 'object' || Array.isArray(callbackPayload)) {
        return json({ error: 'Dados de evento inválidos.' }, 400);
      }
      if (JSON.stringify(callbackPayload).length > 1_000_000) return json({ error: 'Evento muito grande.' }, 413);
      const callbackIds = extrairIdentificadoresCallbackMemed(callbackPayload);
      const externalPrescriptionId = prescriptionId(callbackPayload as Record<string, any>);

      const table = (service as any).from('memed_prescricoes');
      if (action === 'prescription_deleted') {
        const idExcluido = String((callbackPayload as any).prescriptionId ?? callbackIds?.id ?? externalPrescriptionId).trim();
        if (!idExcluido) return json({ error: 'A Memed não enviou o identificador da prescrição excluída.' }, 422);
        const { data: rowToDelete, error: lookupError } = await table.select('id, memed_prescription_uuid, memed_prescription_id')
          .eq('clinica_id', clinicaId).eq('medico_id', medicoId).eq('paciente_id', pacienteId)
          .eq('memed_prescription_id', idExcluido).maybeSingle();
        if (lookupError) throw lookupError;
        let rowAlvo = rowToDelete;
        if (!rowAlvo && externalPrescriptionId) {
          const { data, error } = await table.select('id, memed_prescription_uuid, memed_prescription_id')
            .eq('clinica_id', clinicaId).eq('medico_id', medicoId).eq('paciente_id', pacienteId)
            .eq('memed_prescription_uuid', externalPrescriptionId).maybeSingle();
          if (error) throw error;
          rowAlvo = data;
        }
        if (!rowAlvo) return json({ error: 'Prescrição Memed não encontrada para este prescritor e paciente.' }, 404);
        const token = await tokenPrescritorMemed(medicoId);
        const upstream = await memedPrescriptionRequest(String(rowAlvo.memed_prescription_id ?? idExcluido), token);
        if (upstream.response.status !== 404) {
          if (!upstream.response.ok) return json({ error: 'Nao foi possivel confirmar a exclusao na Memed.' }, 502);
          return json({ error: 'A prescricao ainda consta ativa na Memed; evento nao confirmado.' }, 409);
        }
        const uuid = rowAlvo.memed_prescription_uuid;
        const { error } = await table.update({ excluida_em: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', rowAlvo.id).eq('clinica_id', clinicaId).eq('medico_id', medicoId).eq('paciente_id', pacienteId);
        if (error) throw error;
        if (uuid) {
          await service.from('prescricoes').update({ observacoes: `Prescrição excluída na Memed. Memed:${uuid}` })
            .eq('clinica_id', clinicaId).eq('medico_id', medicoId).eq('paciente_id', pacienteId)
            .eq('observacoes', `Memed:${uuid}`);
        }
        return json({ success: true });
      }

      if (!externalPrescriptionId) return json({ error: 'A Memed não enviou o identificador da prescrição.' }, 422);

      if (!callbackIds?.id || !externalPrescriptionId) return json({ error: 'Identificadores da prescrição ausentes.' }, 422);
      const token = await tokenPrescritorMemed(medicoId);
      const verification = await memedPrescriptionRequest(callbackIds.id, token);
      if (!verification.response.ok) {
        return json({ error: 'A Memed não confirmou esta prescrição para o prescritor autenticado.' }, verification.response.status === 404 ? 404 : 502);
      }
      const verifiedPayload = verificarPrescricaoMemedOficial(verification.data, {
        prescriptionId: callbackIds.id,
        prescriptionUuid: callbackIds.uuid,
        patientExternalId: pacienteId,
        prescriberCpf: String((medico as any).cpf ?? ''),
        prescriberCrm: String((medico as any).crm ?? ''),
        prescriberUf: String((medico as any).crm_uf ?? ''),
      });
      if (!verifiedPayload) return json({ error: 'Os dados oficiais da Memed nao correspondem ao paciente e prescritor selecionados.' }, 403);
      const verifiedPrescription = (verifiedPayload as any).prescricao ?? verifiedPayload;
      const verifiedUuid = String(verifiedPrescription.prescriptionUuid ?? verifiedPrescription.uuid ?? (verifiedPayload as any).prescriptionUuid ?? '');
      if (!verifiedUuid) return json({ error: 'A Memed nao retornou o UUID oficial da prescricao.' }, 502);

      const { data: existente, error: existenteError } = await table.select('id, medico_id, paciente_id')
        .eq('clinica_id', clinicaId).eq('memed_prescription_uuid', verifiedUuid).maybeSingle();
      if (existenteError) throw existenteError;
      if (existente && (existente.medico_id !== medicoId || existente.paciente_id !== pacienteId)) {
        return json({ error: 'Esta prescrição já está vinculada a outro médico ou paciente.' }, 403);
      }

      const date = dataISO(verifiedPrescription.prescriptionDate ?? (verifiedPayload as any).prescriptionDate);
      const { error } = await table.upsert({
        clinica_id: clinicaId,
        paciente_id: pacienteId,
        medico_id: medicoId,
        memed_prescription_uuid: verifiedUuid,
        memed_prescription_id: String(verifiedPrescription.id ?? (verifiedPayload as any).id ?? callbackIds.id),
        data_prescricao: date,
        payload: verifiedPayload,
        excluida_em: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'clinica_id,memed_prescription_uuid' });
      if (error) throw error;

      const medicamentos = Array.isArray(verifiedPrescription.medicamentos)
        ? verifiedPrescription.medicamentos
        : [];
      const resumo = medicamentos.map((item: Record<string, unknown>) => {
        const nome = String(item.nome ?? item.titulo ?? 'Medicamento');
        const posologia = String(item.sanitized_posology ?? item.posologia ?? '').replace(/<[^>]*>/g, ' ').trim();
        return posologia ? `${nome} — ${posologia}` : nome;
      }).join('\n').slice(0, 10000) || 'Receita digital Memed';
      const { data: localPrescriptionId, error: localError } = await service.rpc('registrar_prescricao_memed_local', {
        p_clinica_id: clinicaId,
        p_paciente_id: pacienteId,
        p_medico_id: medicoId,
        p_prescription_uuid: verifiedUuid,
        p_medicamento: resumo,
        p_data_emissao: date ?? new Date().toISOString().slice(0, 10),
      });
      if (localError) throw localError;
      if (!localPrescriptionId) throw new Error('MEMED_LOCAL_PRESCRIPTION_NOT_PERSISTED');
      return json({ success: true });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    const message = String((error as Error)?.message ?? '');
    if (message === 'MEMED_NOT_CONFIGURED') return json({ error: 'Memed ainda não configurada no backend.' }, 503);
    if (message === 'MEMED_INVALID_ENVIRONMENT') return json({ error: 'Ambiente da Memed inválido no servidor.' }, 503);
    console.error('[memed-prescription] request failed');
    return json({ error: 'Não foi possível concluir a integração com a Memed.' }, 500);
  }
});
