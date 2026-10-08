import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsPadrao } from '../_shared/cors.ts';

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

function memedNumericId(payload: Record<string, any>): string | null {
  const value = payload.id ?? payload.prescricao?.id;
  return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 200) : null;
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

    const service = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await service.from('profiles').select('clinica_id').eq('id', user.id).maybeSingle();
    const clinicaId = (profile as any)?.clinica_id as string | undefined;
    if (!clinicaId) return json({ error: 'Usuário sem clínica associada.' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');
    const medicoId = String(body.medicoId ?? '');
    const pacienteId = String(body.pacienteId ?? '');
    if (!medicoId || !pacienteId) return json({ error: 'Selecione o médico e o paciente.' }, 400);

    const [{ data: medico }, { data: paciente }] = await Promise.all([
      service.from('medicos')
        .select('id, clinica_id, nome, cpf, crm, crm_uf, tipo_registro, data_nascimento, email, telefone, especialidade, ativo')
        .eq('id', medicoId).eq('clinica_id', clinicaId).maybeSingle(),
      service.from('pacientes')
        .select('id, clinica_id, nome, cpf, data_nascimento, sexo, telefone, email')
        .eq('id', pacienteId).eq('clinica_id', clinicaId).maybeSingle(),
    ]);
    if (!medico || !paciente) return json({ error: 'Médico ou paciente não pertence a esta clínica.' }, 404);

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
        return json({ error: 'Complete nome e sobrenome, CPF, data de nascimento, conselho, número e UF do médico.' }, 422);
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
        return json({ error: 'A Memed não conseguiu validar ou cadastrar este prescritor. Confira os dados profissionais.' }, 502);
      }

      const token = result.data?.data?.attributes?.token;
      if (typeof token !== 'string' || !token) {
        console.error('[memed-prescription] API response missing prescriber token');
        return json({ error: 'A Memed não retornou o token do prescritor.' }, 502);
      }

      return json({ token, scriptUrl: ambienteMemed().scriptUrl, ambiente: Deno.env.get('MEMED_AMBIENTE') ?? 'homologacao' });
    }

      if (action === 'prescription_printed' || action === 'prescription_deleted') {
      const payload = body.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return json({ error: 'Dados de evento inválidos.' }, 400);
      }
      if (JSON.stringify(payload).length > 1_000_000) return json({ error: 'Evento muito grande.' }, 413);
      const externalPrescriptionId = prescriptionId(payload as Record<string, any>);

      const table = (service as any).from('memed_prescricoes');
      if (action === 'prescription_deleted') {
        const idExcluido = String((payload as any).prescriptionId ?? (payload as any).id ?? externalPrescriptionId).trim();
        if (!idExcluido) return json({ error: 'A Memed não enviou o identificador da prescrição excluída.' }, 422);
        const { data: rowToDelete, error: lookupError } = await table.select('memed_prescription_uuid')
          .eq('clinica_id', clinicaId).eq('memed_prescription_id', idExcluido).maybeSingle();
        if (lookupError) throw lookupError;
        const uuid = rowToDelete?.memed_prescription_uuid ?? externalPrescriptionId;
        const { error } = await table.update({ excluida_em: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('clinica_id', clinicaId).eq('memed_prescription_id', idExcluido);
        if (error) throw error;
        if (!rowToDelete && externalPrescriptionId) {
          await table.update({ excluida_em: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('clinica_id', clinicaId).eq('memed_prescription_uuid', externalPrescriptionId);
        }
        if (uuid) {
          await service.from('prescricoes').update({ observacoes: `Prescrição excluída na Memed. Memed:${uuid}` })
            .eq('clinica_id', clinicaId).eq('observacoes', `Memed:${uuid}`);
        }
        return json({ success: true });
      }

      if (!externalPrescriptionId) return json({ error: 'A Memed não enviou o identificador da prescrição.' }, 422);

      const date = dataISO((payload as any).prescriptionDate ?? (payload as any).prescricao?.prescriptionDate);
      const { error } = await table.upsert({
        clinica_id: clinicaId,
        paciente_id: pacienteId,
        medico_id: medicoId,
        memed_prescription_uuid: externalPrescriptionId,
        memed_prescription_id: memedNumericId(payload as Record<string, any>),
        data_prescricao: date,
        payload,
        excluida_em: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'clinica_id,memed_prescription_uuid' });
      if (error) throw error;

      const marker = `Memed:${externalPrescriptionId}`;
      const { data: localPrescription } = await service.from('prescricoes').select('id')
        .eq('clinica_id', clinicaId).eq('observacoes', marker).maybeSingle();
      if (!localPrescription) {
        const prescription = (payload as any).prescricao ?? payload;
        const medicamentos = Array.isArray((payload as any).medicamentos)
          ? (payload as any).medicamentos
          : Array.isArray(prescription.medicamentos) ? prescription.medicamentos : [];
        const resumo = medicamentos.map((item: Record<string, unknown>) => {
          const nome = String(item.nome ?? item.titulo ?? 'Medicamento');
          const posologia = String(item.sanitized_posology ?? item.posologia ?? '').replace(/<[^>]*>/g, ' ').trim();
          return posologia ? `${nome} — ${posologia}` : nome;
        }).join('\n').slice(0, 10000) || 'Receita digital Memed';
        const { error: localError } = await service.from('prescricoes').insert({
          clinica_id: clinicaId,
          paciente_id: pacienteId,
          medico_id: medicoId,
          tipo: 'simples',
          medicamento: resumo,
          observacoes: marker,
          data_emissao: date ?? new Date().toISOString().slice(0, 10),
        } as any);
        if (localError) throw localError;
      }
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
