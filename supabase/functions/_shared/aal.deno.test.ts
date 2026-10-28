import {
  aalDoBearer,
  avaliarMfa,
  CODIGO_MFA,
  perfilExigeMfa,
  respostaMfaNecessaria,
  verificarMfa,
} from './aal.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function jwt(claims: Record<string, unknown>): string {
  const b64 = (v: unknown) => btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `Bearer ${b64({ alg: 'HS256' })}.${b64(claims)}.assinatura`;
}

interface Fake {
  politica?: { data: unknown; error: unknown };
  plataforma?: { data: unknown; error: unknown };
  papeis?: { data: unknown; error: unknown };
  fatores?: { data: unknown; error: unknown };
}

function service(fake: Fake) {
  const consultas: string[] = [];
  const builder = (tabela: string) => {
    consultas.push(tabela);
    const resultado = tabela === 'politica_mfa'
      ? fake.politica ?? { data: { exigir_perfis_privilegiados: false }, error: null }
      : tabela === 'platform_admins'
      ? fake.plataforma ?? { data: null, error: null }
      : fake.papeis ?? { data: [], error: null };
    const q = {
      select: () => q,
      eq: () => q,
      in: () => Promise.resolve(resultado),
      maybeSingle: () => Promise.resolve(resultado),
    };
    return q;
  };
  return {
    consultas,
    from: builder,
    auth: {
      admin: {
        mfa: {
          listFactors: () => {
            consultas.push('listFactors');
            return Promise.resolve(fake.fatores ?? { data: { factors: [] }, error: null });
          },
        },
      },
    },
  };
}

const aal1 = jwt({ sub: 'u1', aal: 'aal1' });
const aal2 = jwt({ sub: 'u1', aal: 'aal2' });
const comFator = { id: 'u1', factors: [{ status: 'verified' }] };
const semFator = { id: 'u1', factors: [] };

Deno.test('aalDoBearer lê o claim e trata token malformado como ausente', () => {
  assert(aalDoBearer(aal2) === 'aal2', 'deve ler aal2');
  assert(aalDoBearer(aal1) === 'aal1', 'deve ler aal1');
  assert(aalDoBearer('Bearer abc') === null, 'token sem payload');
  assert(aalDoBearer('Bearer a.%%%.c') === null, 'payload inválido');
  assert(aalDoBearer(null) === null, 'sem cabeçalho');
});

Deno.test('avaliarMfa segue a tabela de public.mfa_satisfeito()', () => {
  const base = { aal: 'aal1', fatorVerificado: false, politicaLigada: false, perfilSensivel: false };
  assert(avaliarMfa({ ...base, aal: 'aal2', fatorVerificado: true, politicaLigada: true, perfilSensivel: true }).permitido, 'AAL2 sempre passa');
  const r1 = avaliarMfa({ ...base, fatorVerificado: true });
  assert(!r1.permitido && r1.motivo === 'fator_em_aal1', 'fator em AAL1 é negado');
  const r2 = avaliarMfa({ ...base, politicaLigada: true, perfilSensivel: true });
  assert(!r2.permitido && r2.motivo === 'cadastro_obrigatorio', 'política ligada e perfil sensível sem fator é negado');
  assert(avaliarMfa({ ...base, politicaLigada: true }).permitido, 'política ligada não afeta perfil comum');
  assert(avaliarMfa({ ...base, perfilSensivel: true }).permitido, 'política desligada não afeta quem não tem fator');
});

Deno.test('verificarMfa: AAL2 passa sem consultar o banco', async () => {
  const s = service({});
  const r = await verificarMfa(s, aal2, comFator, true);
  assert(r.permitido, 'AAL2 permitido');
  assert(s.consultas.length === 0, 'não deve consultar');
});

Deno.test('verificarMfa: conta com fator em AAL1 é negada', async () => {
  const r = await verificarMfa(service({}), aal1, comFator, false);
  assert(!r.permitido && r.motivo === 'fator_em_aal1', 'deve negar');
});

Deno.test('verificarMfa: política desligada libera admin sem fator', async () => {
  const s = service({});
  const r = await verificarMfa(s, aal1, semFator, true);
  assert(r.permitido, 'deve permitir');
  assert(s.consultas.includes('politica_mfa'), 'deve consultar a política');
});

Deno.test('verificarMfa: política ligada nega perfil sensível sem fator e libera perfil comum', async () => {
  const ligada = { politica: { data: { exigir_perfis_privilegiados: true }, error: null } };
  const r1 = await verificarMfa(service(ligada), aal1, semFator, true);
  assert(!r1.permitido && r1.motivo === 'cadastro_obrigatorio', 'admin sem fator negado');
  const r2 = await verificarMfa(service(ligada), aal1, semFator, false);
  assert(r2.permitido, 'perfil comum permitido');
  let consultado = false;
  const r3 = await verificarMfa(service(ligada), aal1, semFator, () => { consultado = true; return Promise.resolve(true); });
  assert(!r3.permitido && consultado, 'perfil calculado sob demanda');
});

Deno.test('verificarMfa: perfil sob demanda não é consultado com a política desligada', async () => {
  let consultado = false;
  const r = await verificarMfa(service({}), aal1, semFator, () => { consultado = true; return Promise.resolve(true); });
  assert(r.permitido && !consultado, 'não deve consultar o perfil');
});

Deno.test('verificarMfa: tabela de política ausente equivale a desligada', async () => {
  const r = await verificarMfa(service({ politica: { data: null, error: { code: 'PGRST205' } } }), aal1, semFator, true);
  assert(r.permitido, 'migration não aplicada não deve bloquear');
});

Deno.test('verificarMfa: falhas de consulta negam (fail closed)', async () => {
  const r1 = await verificarMfa(service({ politica: { data: null, error: { code: '57014' } } }), aal1, semFator, true);
  assert(!r1.permitido && r1.motivo === 'falha_verificacao', 'erro na política');
  const r2 = await verificarMfa(service({ fatores: { data: null, error: { message: 'x' } } }), aal1, { id: 'u1' }, true);
  assert(!r2.permitido && r2.motivo === 'falha_verificacao', 'erro nos fatores');
  const r3 = await verificarMfa(
    service({ politica: { data: { exigir_perfis_privilegiados: true }, error: null } }),
    aal1, semFator, () => Promise.reject(new Error('x')),
  );
  assert(!r3.permitido && r3.motivo === 'falha_verificacao', 'erro no perfil');
});

Deno.test('verificarMfa: sem factors no usuário, consulta a API de fatores', async () => {
  const s = service({ fatores: { data: { factors: [{ status: 'verified' }] }, error: null } });
  const r = await verificarMfa(s, aal1, { id: 'u1' }, false);
  assert(!r.permitido && r.motivo === 'fator_em_aal1', 'fator da API deve contar');
  assert(s.consultas.includes('listFactors'), 'deve consultar listFactors');
});

Deno.test('perfilExigeMfa reconhece plataforma, admin/financeiro e falha fechada', async () => {
  assert(await perfilExigeMfa(service({ plataforma: { data: { user_id: 'u1' }, error: null } }), 'u1'), 'plataforma');
  assert(await perfilExigeMfa(service({ papeis: { data: [{ role: 'financeiro' }], error: null } }), 'u1'), 'financeiro');
  assert(!(await perfilExigeMfa(service({}), 'u1')), 'comum');
  let lancou = false;
  try { await perfilExigeMfa(service({ papeis: { data: null, error: { message: 'x' } } }), 'u1'); } catch { lancou = true; }
  assert(lancou, 'erro deve lançar');
});

Deno.test('respostaMfaNecessaria usa 403 com o código do HINT e 503 na falha', async () => {
  const r = respostaMfaNecessaria({ 'X-Teste': '1' }, 'fator_em_aal1', { success: false });
  assert(r.status === 403, '403');
  assert(r.headers.get('X-Teste') === '1', 'mantém cabeçalhos');
  const corpo = await r.json();
  assert(corpo.code === CODIGO_MFA && corpo.success === false && typeof corpo.error === 'string', 'corpo');
  const f = respostaMfaNecessaria({}, 'falha_verificacao');
  assert(f.status === 503 && (await f.json()).code === 'mfa_indisponivel', '503');
});
