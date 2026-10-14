import { test, expect, type APIRequestContext } from '@playwright/test';
import { DEFAULT_LOCAL_SUPABASE_URL, resolveLocalQaSupabaseConfig } from '../scripts/test-supabase-env.ts';

/**
 * Isolamento entre clínicas — o teste que faltava.
 *
 * A suíte de RLS prova que ANÔNIMO não lê nada. Mas o buraco mais caro de um
 * sistema multi-inquilino não é o anônimo: é o usuário legítimo da clínica A
 * alcançando dados da clínica B. Provar isso exige duas contas reais, em
 * clínicas diferentes — não dá para simular.
 *
 * O caso concreto que originou este arquivo: a edge function
 * `whatsapp-evolution` validava apenas que o JWT era válido e depois usava o
 * `SUPABASE_SERVICE_ROLE_KEY` (que ignora o RLS) com o `session_id` que viesse
 * no corpo da requisição. Qualquer usuário logado que descobrisse o id de
 * sessão de outra clínica pegava o QR Code dela — ou seja, pareava o WhatsApp
 * da concorrente no próprio celular —, mandava mensagem em nome dela ou apagava
 * a instância.
 *
 * ─── COMO RODAR ──────────────────────────────────────────────────────────────
 * Use somente contas sintéticas em duas clínicas no Supabase local descartável,
 * com os fixtures sintéticos indicados abaixo. Cada tabela da matriz precisa de
 * pelo menos uma linha da clínica B; linhas vazias não contam como prova de RLS:
 * QA_SUPABASE_URL=http://127.0.0.1:54321
 * QA_SUPABASE_ANON_KEY=<chave-anon-local>
 * QA_CLINICA_A_EMAIL/PASSWORD e QA_CLINICA_B_EMAIL/PASSWORD
 * QA_CLINICA_A_PACIENTE_ID e QA_CLINICA_B_PACIENTE_ID (um paciente sintético por clínica)
 * Acoes WhatsApp exigem QA_WHATSAPP_STUB_CONFIRMED=ELOLAB_LOCAL_STUB.
 * Sem essas variaveis, os testes sao pulados e nenhum backend e acessado.
 */

const QA_SUPABASE = resolveLocalQaSupabaseConfig(process.env);
const SUPABASE_URL = QA_SUPABASE?.url || DEFAULT_LOCAL_SUPABASE_URL;
const ANON_KEY = QA_SUPABASE?.anonKey || '';
const CONTA_A = { email: process.env.QA_CLINICA_A_EMAIL, senha: process.env.QA_CLINICA_A_PASSWORD };
const CONTA_B = { email: process.env.QA_CLINICA_B_EMAIL, senha: process.env.QA_CLINICA_B_PASSWORD };
const temAsDuasContas = Boolean(CONTA_A.email && CONTA_A.senha && CONTA_B.email && CONTA_B.senha);
const PACIENTE_A_ID = process.env.QA_CLINICA_A_PACIENTE_ID;
const PACIENTE_B_ID = process.env.QA_CLINICA_B_PACIENTE_ID;
const temPacientesDeControle = Boolean(PACIENTE_A_ID && PACIENTE_B_ID);
const whatsappStubConfirmed = process.env.QA_WHATSAPP_STUB_CONFIRMED === 'ELOLAB_LOCAL_STUB';

const TABELAS_COM_CLINICA_ID = [
  'agendamentos', 'prontuarios', 'prescricoes', 'lancamentos', 'retornos', 'feedbacks_nps',
] as const;
/** Faz login e devolve o access_token. */
async function entrar(
  request: APIRequestContext,
  email: string,
  senha: string,
): Promise<string> {
  const resposta = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    data: { email, password: senha },
  });

  if (!resposta.ok()) {
    throw new Error(`Login falhou para ${email}: ${resposta.status()} ${await resposta.text()}`);
  }
  const corpo = await resposta.json();
  return corpo.access_token as string;
}

function cabecalhos(token: string) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

test.describe('Isolamento entre clínicas', () => {
  test.skip(
    (!QA_SUPABASE?.disposable || !temAsDuasContas || !temPacientesDeControle),
    'Defina Supabase QA local descartável (QA_SUPABASE_DISPOSABLE=ELOLAB_LOCAL_DISPOSABLE), contas A/B e pacientes sintéticos próprios das duas clínicas.',
  );

  let tokenA = '';
  let tokenB = '';
  let clinicaAId = '';
  let clinicaBId = '';
  let sessaoDaClinicaB: string | null = null;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    tokenA = await entrar(request, CONTA_A.email!, CONTA_A.senha!);
    tokenB = await entrar(request, CONTA_B.email!, CONTA_B.senha!);

    // Positivos de controle: cada usuário precisa ler o próprio paciente
    // sintético antes de se tentar provar o isolamento entre os tenants.
    const [pacienteA, pacienteB] = await Promise.all([
      request.get(`${SUPABASE_URL}/rest/v1/pacientes?id=eq.${PACIENTE_A_ID}&select=id,clinica_id`, {
        headers: cabecalhos(tokenA),
      }),
      request.get(`${SUPABASE_URL}/rest/v1/pacientes?id=eq.${PACIENTE_B_ID}&select=id,clinica_id`, {
        headers: cabecalhos(tokenB),
      }),
    ]);
    if (!pacienteA.ok() || !pacienteB.ok()) {
      throw new Error(`Não foi possível validar os pacientes de controle (A=${pacienteA.status()}, B=${pacienteB.status()}).`);
    }
    const [linhasA, linhasB] = await Promise.all([pacienteA.json(), pacienteB.json()]);
    if (linhasA.length !== 1 || linhasB.length !== 1 || !linhasA[0].clinica_id || !linhasB[0].clinica_id) {
      throw new Error('Os dois pacientes de controle precisam existir e pertencer a uma clínica.');
    }
    clinicaAId = linhasA[0].clinica_id;
    clinicaBId = linhasB[0].clinica_id;

    // A clínica B lista as próprias sessões — é assim que descobrimos um id
    // real para tentar alcançar de fora. Em produção, um atacante obteria
    // este id por outro caminho; aqui pegamos pelo dono mesmo.
    const resposta = await request.get(
      `${SUPABASE_URL}/rest/v1/whatsapp_sessions?select=id&limit=1`,
      { headers: cabecalhos(tokenB) },
    );
    if (resposta.ok()) {
      const linhas = await resposta.json();
      sessaoDaClinicaB = linhas?.[0]?.id ?? null;
    }
    await request.dispose();
  });

  test('contas e pacientes de controle pertencem a clínicas diferentes', async ({ request }) => {
    expect(Boolean(clinicaAId)).toBe(true);
    expect(Boolean(clinicaBId)).toBe(true);
    expect(clinicaAId !== clinicaBId).toBe(true);

    const respostaA = await request.get(
      `${SUPABASE_URL}/rest/v1/pacientes?id=eq.${PACIENTE_A_ID}&select=id,clinica_id`,
      { headers: cabecalhos(tokenA) },
    );
    const respostaB = await request.get(
      `${SUPABASE_URL}/rest/v1/pacientes?id=eq.${PACIENTE_B_ID}&select=id,clinica_id`,
      { headers: cabecalhos(tokenB) },
    );
    expect(respostaA.ok()).toBe(true);
    expect(respostaB.ok()).toBe(true);
    const [linhasA, linhasB] = await Promise.all([respostaA.json(), respostaB.json()]);
    expect(linhasA.length).toBe(1);
    expect(linhasA[0]?.clinica_id === clinicaAId).toBe(true);
    expect(linhasB.length).toBe(1);
    expect(linhasB[0]?.clinica_id === clinicaBId).toBe(true);

    const leituraCruzada = await request.get(
      `${SUPABASE_URL}/rest/v1/pacientes?id=eq.${PACIENTE_B_ID}&select=id`,
      { headers: cabecalhos(tokenA) },
    );
    expect(leituraCruzada.ok()).toBe(true);
    const linhasCruzadas = await leituraCruzada.json();
    expect(linhasCruzadas.length).toBe(0);
  });

  for (const tabela of TABELAS_COM_CLINICA_ID) {
    test(`A não lê por ID linhas sintéticas de B em ${tabela}`, async ({ request }) => {
      expect(clinicaAId !== clinicaBId).toBe(true);
      const urlB = new URL(`/rest/v1/${tabela}`, SUPABASE_URL);
      urlB.searchParams.set('select', 'id,clinica_id');
      urlB.searchParams.set('clinica_id', `eq.${clinicaBId}`);
      urlB.searchParams.set('limit', '100');
      const respostaB = await request.get(urlB.toString(), { headers: cabecalhos(tokenB) });
      expect(respostaB.ok(), `${tabela}: clínica B não conseguiu ler os próprios fixtures`).toBe(true);
      const linhasB = await respostaB.json();
      expect(linhasB.length, `${tabela}: falta fixture sintético em B; lista vazia não prova RLS`).toBeGreaterThan(0);
      expect(linhasB.every((linha: any) => linha.clinica_id === clinicaBId)).toBe(true);

      const idsB = linhasB.map((linha: any) => linha.id);
      const urlCruzada = new URL(`/rest/v1/${tabela}`, SUPABASE_URL);
      urlCruzada.searchParams.set('select', 'id');
      urlCruzada.searchParams.set('id', `in.(${idsB.join(',')})`);
      const respostaA = await request.get(urlCruzada.toString(), { headers: cabecalhos(tokenA) });
      expect(respostaA.ok(), `${tabela}: resposta cruzada falhou com status ${respostaA.status()}`).toBe(true);
      const linhasCruzadas = await respostaA.json();
      expect(linhasCruzadas.length).toBe(0);
    });
  }

  test('A não obtém o QR Code do WhatsApp de B', async ({ request }) => {
    test.skip(!whatsappStubConfirmed, 'Acoes WhatsApp exigem stub local confirmado.');
    test.skip(!sessaoDaClinicaB, 'A clínica B não tem sessão de WhatsApp cadastrada para servir de alvo.');

    const resposta = await request.post(`${SUPABASE_URL}/functions/v1/whatsapp-evolution`, {
      headers: cabecalhos(tokenA),
      data: { action: 'get_qr_code', session_id: sessaoDaClinicaB },
    });

    // Quem pega o QR Code pareia o WhatsApp da outra clínica no próprio celular.
    expect(
      resposta.status(),
      'VAZAMENTO: a clínica A obteve o QR Code do WhatsApp da clínica B',
    ).not.toBe(200);
    expect([403, 404]).toContain(resposta.status());
  });

  test('A não envia mensagem pela instância de B', async ({ request }) => {
    test.skip(!whatsappStubConfirmed, 'Acoes WhatsApp exigem stub local confirmado.');
    test.skip(!sessaoDaClinicaB, 'A clínica B não tem sessão de WhatsApp cadastrada para servir de alvo.');

    const resposta = await request.post(`${SUPABASE_URL}/functions/v1/whatsapp-evolution`, {
      headers: cabecalhos(tokenA),
      data: {
        action: 'send_message',
        session_id: sessaoDaClinicaB,
        to: '0000000000000',
        message: 'teste de isolamento entre clínicas',
      },
    });

    expect(
      resposta.status(),
      'VAZAMENTO: a clínica A disparou mensagem em nome da clínica B',
    ).not.toBe(200);
  });

  test('A não apaga a instância de B', async ({ request }) => {
    test.skip(!whatsappStubConfirmed, 'Acoes WhatsApp exigem stub local confirmado.');
    test.skip(!sessaoDaClinicaB, 'A clínica B não tem sessão de WhatsApp cadastrada para servir de alvo.');

    const resposta = await request.post(`${SUPABASE_URL}/functions/v1/whatsapp-evolution`, {
      headers: cabecalhos(tokenA),
      data: { action: 'delete_instance', session_id: sessaoDaClinicaB },
    });

    expect(
      resposta.status(),
      'VAZAMENTO: a clínica A apagou a conexão de WhatsApp da clínica B',
    ).not.toBe(200);
  });

  test('list_instances devolve só o que é da clínica de quem chamou', async ({ request }) => {
    test.skip(!whatsappStubConfirmed, 'Acoes WhatsApp exigem stub local confirmado.');
    const resposta = await request.post(`${SUPABASE_URL}/functions/v1/whatsapp-evolution`, {
      headers: cabecalhos(tokenA),
      data: { action: 'list_instances' },
    });

    if (!resposta.ok()) return; // sem Evolution API configurada, nada a conferir

    const corpo = await resposta.json();
    const lista = Array.isArray(corpo?.data) ? corpo.data : (Array.isArray(corpo) ? corpo : []);

    // Antes esta ação devolvia TODAS as instâncias do servidor Evolution —
    // era o mapa que tornava os outros ataques triviais.
    const sessoesDaClinicaA = await request.get(
      `${SUPABASE_URL}/rest/v1/whatsapp_sessions?select=instance_name`,
      { headers: cabecalhos(tokenA) },
    );
    const permitidas = new Set(
      (await sessoesDaClinicaA.json()).map((s: any) => s.instance_name),
    );

    for (const item of lista) {
      const nome = item?.instance?.instanceName ?? item?.instanceName ?? item?.name;
      if (!nome) continue;
      expect(
        permitidas.has(nome),
        `VAZAMENTO: list_instances devolveu "${nome}", que não é da clínica A`,
      ).toBe(true);
    }
  });
});
