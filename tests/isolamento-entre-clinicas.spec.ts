import { test, expect, type APIRequestContext } from '@playwright/test';
import { DEFAULT_LOCAL_SUPABASE_URL, resolveLocalQaSupabaseConfig } from '../scripts/test-supabase-env.ts';
import { TABELAS_COM_CLINICA } from './fixtures/duasClinicas.ts';
import {
  decidirSkipDeConfiguracao,
  motivoSkipPermitido,
  VARIAVEIS_BASE,
  variaveisAusentes,
} from './fixtures/suiteSeguranca.ts';

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
 * CLIN-QA-565: uma lista vazia não prova RLS. Para cada tabela exigimos que A
 * veja pelo menos 1 linha, que todas as linhas visíveis a A sejam da clínica A,
 * que B veja as próprias linhas e que A não alcance por ID nenhuma linha de B.
 *
 * ─── COMO RODAR ──────────────────────────────────────────────────────────────
 * Só contas sintéticas no Supabase local descartável, criadas pelo seed
 * `node tests/fixtures/seed-duas-clinicas.ts`, que grava QA_SUPABASE_*
 * (inclusive QA_SUPABASE_DISPOSABLE), QA_CLINICA_A/B_EMAIL/PASSWORD,
 * QA_CLINICA_A/B_ID e QA_CLINICA_A/B_PACIENTE_ID.
 * Ações WhatsApp exigem QA_WHATSAPP_STUB_CONFIRMED=ELOLAB_LOCAL_STUB.
 * Sem configuração, a suíte é pulada fora do CI e FALHA no CI
 * (`tests/fixtures/suiteSeguranca.ts`).
 */

const QA_SUPABASE = resolveLocalQaSupabaseConfig(process.env);
const SUPABASE_URL = QA_SUPABASE?.url || DEFAULT_LOCAL_SUPABASE_URL;
const ANON_KEY = QA_SUPABASE?.anonKey || '';
const CONTA_A = { email: process.env.QA_CLINICA_A_EMAIL, senha: process.env.QA_CLINICA_A_PASSWORD };
const CONTA_B = { email: process.env.QA_CLINICA_B_EMAIL, senha: process.env.QA_CLINICA_B_PASSWORD };
const CLINICA_A = process.env.QA_CLINICA_A_ID?.trim() || '';
const CLINICA_B = process.env.QA_CLINICA_B_ID?.trim() || '';
const PACIENTE_A_ID = process.env.QA_CLINICA_A_PACIENTE_ID?.trim() || '';
const PACIENTE_B_ID = process.env.QA_CLINICA_B_PACIENTE_ID?.trim() || '';
const whatsappStubConfirmed = process.env.QA_WHATSAPP_STUB_CONFIRMED === 'ELOLAB_LOCAL_STUB';

const VARIAVEIS_DA_SUITE = [
  ...VARIAVEIS_BASE,
  'QA_CLINICA_A_EMAIL', 'QA_CLINICA_A_PASSWORD', 'QA_CLINICA_B_EMAIL', 'QA_CLINICA_B_PASSWORD',
  'QA_CLINICA_A_ID', 'QA_CLINICA_B_ID', 'QA_CLINICA_A_PACIENTE_ID', 'QA_CLINICA_B_PACIENTE_ID',
];

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

async function linhasVisiveis(request: APIRequestContext, token: string, caminho: string) {
  const resposta = await request.get(`${SUPABASE_URL}/rest/v1/${caminho}`, { headers: cabecalhos(token) });
  expect(resposta.ok(), `${caminho}: ${resposta.status()} ${await resposta.text()}`).toBe(true);
  const linhas = await resposta.json();
  expect(Array.isArray(linhas), `${caminho} deveria devolver um array`).toBe(true);
  return linhas as Array<{ id: string; clinica_id: string | null; [coluna: string]: unknown }>;
}

test.describe('Isolamento entre clínicas', () => {
  let tokenA = '';
  let tokenB = '';
  let clinicaAId = '';
  let clinicaBId = '';
  let sessaoDaClinicaB: string | null = null;

  test.beforeAll(async ({ playwright }) => {
    // Até as leituras exigem banco descartável: a suíte só roda contra a massa
    // sintética do seed, nunca contra um banco com dados de verdade.
    const faltando = [
      ...(QA_SUPABASE?.disposable ? [] : ['QA_SUPABASE_DISPOSABLE']),
      ...variaveisAusentes(VARIAVEIS_DA_SUITE),
    ];
    const motivo = decidirSkipDeConfiguracao('Isolamento', faltando);
    test.skip(Boolean(motivo), motivo ?? '');

    expect(CLINICA_A, 'QA_CLINICA_A_ID e QA_CLINICA_B_ID precisam ser clínicas diferentes').not.toBe(CLINICA_B);

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

  test('contas e pacientes de controle pertencem às clínicas sintéticas esperadas', async ({ request }) => {
    // Sem isto, um seed errado (as duas contas na mesma clínica) faria todos
    // os testes abaixo passarem sem provar isolamento nenhum.
    expect(clinicaAId, 'paciente de controle de A').toBe(CLINICA_A);
    expect(clinicaBId, 'paciente de controle de B').toBe(CLINICA_B);
    expect(clinicaAId).not.toBe(clinicaBId);

    const [perfilA] = await linhasVisiveis(request, tokenA, `profiles?select=id,clinica_id&email=eq.${encodeURIComponent(CONTA_A.email!)}`);
    const [perfilB] = await linhasVisiveis(request, tokenB, `profiles?select=id,clinica_id&email=eq.${encodeURIComponent(CONTA_B.email!)}`);
    expect(perfilA?.clinica_id, 'perfil da conta A').toBe(CLINICA_A);
    expect(perfilB?.clinica_id, 'perfil da conta B').toBe(CLINICA_B);

    const cruzada = await linhasVisiveis(request, tokenA, `pacientes?id=eq.${PACIENTE_B_ID}&select=id`);
    expect(cruzada, 'VAZAMENTO: A leu o paciente de controle de B').toHaveLength(0);
  });

  for (const tabela of TABELAS_COM_CLINICA) {
    test(`A enxerga somente sua clínica em ${tabela}`, async ({ request }) => {
      const deA = await linhasVisiveis(request, tokenA, `${tabela}?select=id,clinica_id&limit=1000`);
      expect(
        deA.length,
        `PRÉ-CONDIÇÃO: A não vê nenhuma linha em ${tabela}; o teste passaria com banco vazio (CLIN-QA-565). Rode o seed.`,
      ).toBeGreaterThan(0);
      const estranhas = deA.filter((linha) => linha.clinica_id !== clinicaAId);
      expect(
        estranhas.map((l) => `${l.id} (clinica_id=${l.clinica_id ?? 'null'})`),
        `VAZAMENTO: ${tabela} devolveu para A linhas que não são da clínica A`,
      ).toEqual([]);

      const urlB = new URL(`/rest/v1/${tabela}`, SUPABASE_URL);
      urlB.searchParams.set('select', 'id,clinica_id');
      urlB.searchParams.set('clinica_id', `eq.${clinicaBId}`);
      urlB.searchParams.set('limit', '100');
      const respostaB = await request.get(urlB.toString(), { headers: cabecalhos(tokenB) });
      expect(respostaB.ok(), `${tabela}: clínica B não conseguiu ler os próprios fixtures`).toBe(true);
      const deB: Array<{ id: string; clinica_id: string }> = await respostaB.json();
      expect(
        deB.length,
        `PRÉ-CONDIÇÃO: falta fixture sintético de B em ${tabela}; lista vazia não prova RLS. Rode o seed.`,
      ).toBeGreaterThan(0);
      expect(deB.every((linha) => linha.clinica_id === clinicaBId)).toBe(true);

      // Busca direta pelos IDs de B: cobre o caso de a listagem paginar ou
      // ordenar de um jeito que esconda a linha de B.
      const urlCruzada = new URL(`/rest/v1/${tabela}`, SUPABASE_URL);
      urlCruzada.searchParams.set('select', 'id');
      urlCruzada.searchParams.set('id', `in.(${deB.map((linha) => linha.id).join(',')})`);
      const respostaA = await request.get(urlCruzada.toString(), { headers: cabecalhos(tokenA) });
      expect(respostaA.ok(), `${tabela}: resposta cruzada falhou com status ${respostaA.status()}`).toBe(true);
      expect(await respostaA.json(), `VAZAMENTO: A alcançou por ID linhas de B em ${tabela}`).toHaveLength(0);
    });
  }

  // O beforeAll da suíte já exige QA_SUPABASE_DISPOSABLE; estes casos usam o
  // paciente sintético de B como alvo real (um alvo inexistente passaria sem RLS).
  test.describe('escrita cruzada (banco local descartável)', () => {
    test('A não altera paciente de B', async ({ request }) => {
      const [antes] = await linhasVisiveis(request, tokenB, `pacientes?select=id,clinica_id,observacoes&id=eq.${PACIENTE_B_ID}`);
      expect(antes, 'PRÉ-CONDIÇÃO: paciente sintético de B não existe').toBeTruthy();

      const resposta = await request.patch(`${SUPABASE_URL}/rest/v1/pacientes?id=eq.${PACIENTE_B_ID}`, {
        headers: { ...cabecalhos(tokenA), Prefer: 'return=representation' },
        data: { observacoes: `isolamento ${Date.now()}` },
      });
      if (resposta.ok()) expect(await resposta.json(), 'A alterou paciente de B').toHaveLength(0);

      const [depois] = await linhasVisiveis(request, tokenB, `pacientes?select=id,observacoes&id=eq.${PACIENTE_B_ID}`);
      expect(depois?.observacoes, 'VAZAMENTO: o paciente de B foi alterado pela conta A').toBe(antes.observacoes);
    });

    test('A não cria paciente dentro da clínica B', async ({ request }) => {
      const marcador = `Isolamento ${Date.now()} — deve falhar`;
      const resposta = await request.post(`${SUPABASE_URL}/rest/v1/pacientes`, {
        headers: { ...cabecalhos(tokenA), Prefer: 'return=representation' },
        data: { nome: marcador, clinica_id: clinicaBId },
      });
      expect(resposta.ok(), 'A conseguiu inserir paciente com clinica_id de B').toBe(false);

      const vistosPorB = await linhasVisiveis(request, tokenB, `pacientes?select=id&nome=eq.${encodeURIComponent(marcador)}`);
      expect(vistosPorB, 'VAZAMENTO: paciente criado por A apareceu na clínica B').toHaveLength(0);
    });

    test('A não apaga paciente de B', async ({ request }) => {
      const resposta = await request.delete(`${SUPABASE_URL}/rest/v1/pacientes?id=eq.${PACIENTE_B_ID}`, {
        headers: { ...cabecalhos(tokenA), Prefer: 'return=representation' },
      });
      if (resposta.ok()) expect(await resposta.json(), 'A apagou paciente de B').toHaveLength(0);

      const restantes = await linhasVisiveis(request, tokenB, `pacientes?select=id&id=eq.${PACIENTE_B_ID}`);
      expect(restantes, 'VAZAMENTO: o paciente de B foi apagado pela conta A').toHaveLength(1);
    });
  });

  test.describe('WhatsApp (edge function)', () => {
    test.beforeAll(() => {
      test.skip(
        !whatsappStubConfirmed,
        motivoSkipPermitido('whatsapp-stub', 'Ações WhatsApp exigem QA_WHATSAPP_STUB_CONFIRMED=ELOLAB_LOCAL_STUB.'),
      );
      // O seed cria uma sessão em cada clínica; sem ela o alvo não existe e o teste não prova nada.
      expect(sessaoDaClinicaB, 'PRÉ-CONDIÇÃO: a clínica B não tem sessão de WhatsApp. Rode o seed.').toBeTruthy();
    });

    test('A não obtém o QR Code do WhatsApp de B', async ({ request }) => {
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
      const resposta = await request.post(`${SUPABASE_URL}/functions/v1/whatsapp-evolution`, {
        headers: cabecalhos(tokenA),
        data: { action: 'list_instances' },
      });

      // Antes este caso fazia `return` e contava como PASSOU sem conferir nada.
      test.skip(
        !resposta.ok(),
        motivoSkipPermitido('evolution-indisponivel', `list_instances respondeu ${resposta.status()}; sem Evolution de teste não há o que conferir.`),
      );

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
});
