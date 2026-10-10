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
 * Use somente contas sinteticas em duas clinicas no Supabase local descartavel:
 * QA_SUPABASE_URL=http://127.0.0.1:54321
 * QA_SUPABASE_ANON_KEY=<chave-anon-local>
 * QA_CLINICA_A_EMAIL/PASSWORD e QA_CLINICA_B_EMAIL/PASSWORD
 * Acoes WhatsApp exigem QA_WHATSAPP_STUB_CONFIRMED=ELOLAB_LOCAL_STUB.
 * Sem essas variaveis, os testes sao pulados e nenhum backend e acessado.
 */

const QA_SUPABASE = resolveLocalQaSupabaseConfig(process.env);
const SUPABASE_URL = QA_SUPABASE?.url || DEFAULT_LOCAL_SUPABASE_URL;
const ANON_KEY = QA_SUPABASE?.anonKey || '';
const CONTA_A = { email: process.env.QA_CLINICA_A_EMAIL, senha: process.env.QA_CLINICA_A_PASSWORD };
const CONTA_B = { email: process.env.QA_CLINICA_B_EMAIL, senha: process.env.QA_CLINICA_B_PASSWORD };
const temAsDuasContas = Boolean(CONTA_A.email && CONTA_A.senha && CONTA_B.email && CONTA_B.senha);
const whatsappStubConfirmed = process.env.QA_WHATSAPP_STUB_CONFIRMED === 'ELOLAB_LOCAL_STUB';
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
    (!QA_SUPABASE || !temAsDuasContas),
    'Defina Supabase QA local e QA_CLINICA_A/B_EMAIL/PASSWORD para contas descartaveis em duas clinicas locais.',
  );

  let tokenA = '';
  let sessaoDaClinicaB: string | null = null;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    tokenA = await entrar(request, CONTA_A.email!, CONTA_A.senha!);
    const tokenB = await entrar(request, CONTA_B.email!, CONTA_B.senha!);

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

  test('A não lê registros de pacientes de B', async ({ request }) => {
    // O RLS é a primeira linha: mesmo autenticada, a clínica A só enxerga o
    // que é dela. Comparamos clinica_id para garantir que nada de fora entrou.
    const resposta = await request.get(
      `${SUPABASE_URL}/rest/v1/pacientes?select=id,clinica_id&limit=200`,
      { headers: cabecalhos(tokenA) },
    );
    expect(resposta.ok()).toBe(true);

    const pacientes = await resposta.json();
    const clinicas = new Set(pacientes.map((p: any) => p.clinica_id));
    expect(
      clinicas.size,
      `A enxergou pacientes de ${clinicas.size} clínicas diferentes: ${[...clinicas].join(', ')}`,
    ).toBeLessThanOrEqual(1);
  });

  for (const tabela of ['agendamentos', 'prontuarios', 'prescricoes', 'lancamentos', 'retornos', 'feedbacks_nps']) {
    test(`A enxerga somente sua clínica em ${tabela}`, async ({ request }) => {
      const resposta = await request.get(`${SUPABASE_URL}/rest/v1/${tabela}?select=id,clinica_id&limit=500`, {
        headers: cabecalhos(tokenA),
      });
      expect(resposta.ok(), await resposta.text()).toBe(true);
      const linhas = await resposta.json();
      const clinicas = new Set(linhas.map((linha: any) => linha.clinica_id).filter(Boolean));
      expect(clinicas.size, `VAZAMENTO: ${tabela} devolveu ${clinicas.size} clínicas`).toBeLessThanOrEqual(1);
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
