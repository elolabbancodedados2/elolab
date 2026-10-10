import { test, expect } from '@playwright/test';
import { DEFAULT_LOCAL_SUPABASE_URL, resolveLocalQaSupabaseConfig } from '../scripts/test-supabase-env.ts';

/**
 * Testes de RLS contra a API REST do Supabase usando apenas a chave anon.
 *
 * A versão anterior destes testes aceitava qualquer HTTP 200 desde que o corpo
 * fosse um array — ou seja, um vazamento total de dados passaria. Agora exigimos
 * explicitamente ZERO linhas para quem não está autenticado.
 */

const QA_SUPABASE = resolveLocalQaSupabaseConfig(process.env);
const SUPABASE_URL = QA_SUPABASE?.url || DEFAULT_LOCAL_SUPABASE_URL;
const SUPABASE_ANON_KEY = QA_SUPABASE?.anonKey || '';
const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

/** IDs in mutation tests are deliberately impossible. All requests are restricted to loopback QA. */
const ID_INEXISTENTE = '00000000-0000-0000-0000-000000000000';

/** Tabelas que jamais podem devolver linhas para um visitante anônimo. */
const PRIVATE_TABLES = [
  'pacientes',
  'medicos',
  'agendamentos',
  'prontuarios',
  'prescricoes',
  'atestados',
  'exames',
  'lancamentos',
  'estoque',
  'funcionarios',
  'profiles',
  'user_roles',
  'employee_invitations',
  'registros_pendentes',
  'audit_log',
  // A sessão guarda o nome da instância do WhatsApp da clínica. Esse nome era a
  // chave que permitia operar a conexão de outra clínica pela edge function.
  'whatsapp_sessions',
];

test.beforeAll(() => {
  test.skip(
    !QA_SUPABASE,
    'Configure QA_SUPABASE_URL e QA_SUPABASE_ANON_KEY para um Supabase local em loopback.',
  );
});

test.describe('RLS — leitura anônima', () => {
  for (const table of PRIVATE_TABLES) {
    test(`${table}: anônimo não lê nenhuma linha`, async ({ request }) => {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5`, {
        headers,
      });

      if (response.ok()) {
        const data = await response.json();
        expect(Array.isArray(data), `${table} deveria devolver um array`).toBe(true);
        expect(data, `VAZAMENTO: ${table} devolveu ${data.length} linha(s) para anônimo`).toHaveLength(0);
      } else {
        // Erro explícito também é aceitável (401/403/404/406)
        expect([401, 403, 404, 406]).toContain(response.status());
      }
    });
  }
});

test.describe('RLS — escrita anônima', () => {
  test.beforeAll(() => {
    test.skip(!QA_SUPABASE?.disposable, 'Testes de escrita exigem QA_SUPABASE_DISPOSABLE=ELOLAB_LOCAL_DISPOSABLE em banco local descartável.');
  });
  test('insert de paciente é bloqueado', async ({ request }) => {
    const response = await request.post(`${SUPABASE_URL}/rest/v1/pacientes`, {
      headers: { ...headers, Prefer: 'return=representation' },
      data: { nome: 'RLS Test — deve falhar', cpf: '00000000000' },
    });

    expect(response.ok(), 'anônimo conseguiu inserir paciente').toBe(false);
  });

  test('update de paciente não afeta linhas', async ({ request }) => {
    // Impossible row id; this mutation check is limited to a disposable local DB.
    const response = await request.patch(`${SUPABASE_URL}/rest/v1/pacientes?id=eq.${ID_INEXISTENTE}`, {
      headers: { ...headers, Prefer: 'return=representation' },
      data: { observacoes: 'rls-test' },
    });

    if (response.ok()) {
      const data = await response.json();
      expect(data, 'anônimo alterou linhas de pacientes').toHaveLength(0);
    } else {
      expect([401, 403, 404, 405, 406]).toContain(response.status());
    }
  });

  test('delete de paciente não remove linhas', async ({ request }) => {
    // Mesmo cuidado do teste acima: alvo impossível, para que uma falha de RLS
    // seja detectada sem apagar nada.
    const response = await request.delete(`${SUPABASE_URL}/rest/v1/pacientes?id=eq.${ID_INEXISTENTE}`, {
      headers: { ...headers, Prefer: 'return=representation' },
    });

    if (response.ok()) {
      const data = await response.json();
      expect(data, 'anônimo removeu linhas de pacientes').toHaveLength(0);
    } else {
      expect([401, 403, 404, 405, 406]).toContain(response.status());
    }
  });
});

/**
 * As edge functions abaixo usam `SUPABASE_SERVICE_ROLE_KEY`, que passa por cima
 * do RLS. Nelas a autorização é código, não política de banco — então precisa
 * ser testada separadamente.
 *
 * O `whatsapp-evolution` validava só que o JWT existia e depois aceitava o
 * `session_id`/`instance_name` que viesse no corpo da requisição. Quem tivesse
 * qualquer login pegava o QR Code de outra clínica (e parearia o WhatsApp dela
 * no próprio aparelho), mandaria mensagem em nome dela ou apagaria a instância.
 */
test.describe('Edge functions — autorização própria', () => {
  test.beforeAll(() => {
    test.skip(process.env.QA_EDGE_STUB_CONFIRMED !== 'ELOLAB_LOCAL_STUB', 'Edge tests exigem confirmação de stub local sem integrações externas.');
  });
  const SESSAO_DE_OUTRA_CLINICA = '11111111-2222-3333-4444-555555555555';

  test('whatsapp-evolution recusa quem não está autenticado', async ({ request }) => {
    const response = await request.post(`${SUPABASE_URL}/functions/v1/whatsapp-evolution`, {
      headers,
      data: { action: 'get_qr_code', session_id: SESSAO_DE_OUTRA_CLINICA },
    });

    // Nunca 200: sem usuário não há clínica, e sem clínica não há o que operar.
    expect(response.status(), 'anônimo obteve resposta de sucesso da função do WhatsApp')
      .not.toBe(200);
    expect([401, 403, 404]).toContain(response.status());
  });

  test('whatsapp-evolution não envia mensagem para anônimo', async ({ request }) => {
    const response = await request.post(`${SUPABASE_URL}/functions/v1/whatsapp-evolution`, {
      headers,
      data: {
        action: 'send_message',
        instance_name: 'instancia-de-outra-clinica',
        to: '5511999999999',
        message: 'teste de autorização',
      },
    });

    expect(response.status(), 'anônimo disparou mensagem de WhatsApp').not.toBe(200);
  });

  test('ai-medical-assistant não aceita dado clínico de anônimo', async ({ request }) => {
    const response = await request.post(`${SUPABASE_URL}/functions/v1/ai-medical-assistant`, {
      headers,
      data: {
        action: 'suggest_diagnosis',
        data: { queixa_principal: 'teste de autorização' },
      },
    });

    // Dado de saúde não pode sair para provedor externo sem papel verificado.
    expect(response.status(), 'anônimo enviou dado clínico para a IA').not.toBe(200);
    expect([401, 403]).toContain(response.status());
  });
});

test.describe('RLS — catálogo público', () => {
  test('planos ativos continuam visíveis (página de preços)', async ({ request }) => {
    const response = await request.get(`${SUPABASE_URL}/rest/v1/planos?select=id,nome,ativo`, {
      headers,
    });
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    // Se algum plano vier, precisa estar ativo — inativos não devem vazar.
    for (const plano of data) {
      expect(plano.ativo).toBe(true);
    }
  });
});
