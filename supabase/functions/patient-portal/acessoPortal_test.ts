import {
  acaoExigeTitular,
  buscarTokenPortal,
  dependentesDoTitular,
  ERRO_DEPENDENTE_NAO_AUTORIZADO,
  filtrarDependentesElegiveis,
  idadeEmAnos,
  resolverPacienteDaSessao,
  sha256Hex,
  type VinculoDependente,
} from './acessoPortal.ts';

function assertEquals(atual: unknown, esperado: unknown, contexto: string) {
  const a = JSON.stringify(atual);
  const e = JSON.stringify(esperado);
  if (a !== e) throw new Error(`${contexto}: esperado ${e}, recebido ${a}`);
}

const AGORA = new Date('2026-10-27T12:00:00.000Z');
const HOJE = '2026-10-27';
// Valores sintéticos, gerados só para o teste.
const TOKEN_BRUTO = 'a1'.repeat(32);
const CPF_TITULAR = '52998224725';

/**
 * Banco falso de paciente_portal_tokens: guarda só hashes, como produção, e
 * registra o valor de cada filtro `.eq('token', ...)` para conferir que o
 * valor recebido sem hash nunca é consultado.
 */
async function bancoTokens(opcoes: { ativo?: boolean; expiraEm?: string; erro?: boolean } = {}) {
  const hashGuardado = await sha256Hex(TOKEN_BRUTO);
  const linha = {
    id: 'tok-1',
    token: hashGuardado,
    paciente_id: 'pac-titular',
    clinica_id: 'clinica-a',
    ativo: opcoes.ativo ?? true,
    expires_at: opcoes.expiraEm ?? '2027-10-27T00:00:00.000Z',
    pacientes: { id: 'pac-titular', clinica_id: 'clinica-a', cpf: CPF_TITULAR },
  };
  const consultados: unknown[] = [];
  const db = {
    from(tabela: string) {
      if (tabela !== 'paciente_portal_tokens') throw new Error(`tabela inesperada ${tabela}`);
      const filtros: Record<string, unknown> = {};
      let minExpira = '';
      const q = {
        select: () => q,
        eq: (col: string, valor: unknown) => {
          if (col === 'token') consultados.push(valor);
          filtros[col] = valor;
          return q;
        },
        gte: (_col: string, valor: string) => {
          minExpira = valor;
          return q;
        },
        maybeSingle: () => {
          if (opcoes.erro) return Promise.resolve({ data: null, error: { message: "falha" } });
          const casa = filtros.token === linha.token && filtros.ativo === linha.ativo && linha.expires_at >= minExpira;
          return Promise.resolve({ data: casa ? linha : null, error: null });
        },
      };
      return q;
    },
  };
  return { db, hashGuardado, consultados };
}

Deno.test('SEC-R1-06: o token bruto autentica', async () => {
  const { db } = await bancoTokens();
  const achado = await buscarTokenPortal(db, TOKEN_BRUTO, AGORA);
  assertEquals(achado?.id, 'tok-1', 'token bruto');
});

Deno.test('SEC-R1-06: o hash guardado enviado como token não autentica', async () => {
  const { db, hashGuardado, consultados } = await bancoTokens();
  const achado = await buscarTokenPortal(db, hashGuardado, AGORA);
  assertEquals(achado, null, 'hash como token');
  // Só uma consulta, e com o hash do valor recebido, nunca o valor em si.
  assertEquals(consultados, [await sha256Hex(hashGuardado)], 'valores consultados');
});

Deno.test('SEC-R1-06: nenhuma consulta usa o valor recebido sem hash', async () => {
  const { db, consultados } = await bancoTokens();
  await buscarTokenPortal(db, TOKEN_BRUTO, AGORA);
  assertEquals(consultados.includes(TOKEN_BRUTO), false, 'valor bruto consultado');
});

Deno.test('token fora do formato, vazio ou não textual é recusado sem consultar o banco', async () => {
  const { db, consultados } = await bancoTokens();
  for (const t of ['', 'abc', 'z'.repeat(64), 'a1'.repeat(33), null, undefined, 123, { token: TOKEN_BRUTO }]) {
    assertEquals(await buscarTokenPortal(db, t, AGORA), null, `entrada ${JSON.stringify(t)}`);
  }
  assertEquals(consultados.length, 0, 'consultas');
});

Deno.test('token inativo, expirado ou com erro de banco é recusado', async () => {
  assertEquals(await buscarTokenPortal((await bancoTokens({ ativo: false })).db, TOKEN_BRUTO, AGORA), null, 'inativo');
  assertEquals(
    await buscarTokenPortal((await bancoTokens({ expiraEm: '2026-10-01T00:00:00.000Z' })).db, TOKEN_BRUTO, AGORA),
    null,
    'expirado',
  );
  assertEquals(await buscarTokenPortal((await bancoTokens({ erro: true })).db, TOKEN_BRUTO, AGORA), null, 'erro');
});

Deno.test('idade completa considera mês e dia', () => {
  assertEquals(idadeEmAnos('2008-10-27', HOJE), 18, 'aniversário hoje');
  assertEquals(idadeEmAnos('2008-10-28', HOJE), 17, 'aniversário amanhã');
  assertEquals(idadeEmAnos('2008-11-01T00:00:00', HOJE), 17, 'com hora');
  assertEquals(idadeEmAnos(null, HOJE), null, 'sem data');
  assertEquals(idadeEmAnos('2027-01-01', HOJE), null, 'data futura');
});

const TITULAR = { id: 'pac-titular', clinica_id: 'clinica-a' };

/** Vínculo confirmado de um menor da clínica A, com dados sintéticos. */
function vinculo(extra: Partial<VinculoDependente> = {}): VinculoDependente {
  return {
    dependente_id: 'filho',
    responsavel_paciente_id: 'pac-titular',
    clinica_id: 'clinica-a',
    nome: 'Filho',
    data_nascimento: '2015-03-10',
    confirmado_em: '2026-10-20T10:00:00.000Z',
    confirmado_por: 'usuario-recepcao',
    revogado_em: null,
    expira_em: null,
    ...extra,
  };
}

/** Banco falso que registra toda tabela tocada e devolve um menor cujo cpf_responsavel é o CPF do titular. */
function bancoQueRegistra() {
  const tabelas: string[] = [];
  const linhaPorCpfResponsavel = {
    id: 'menor', nome: 'Menor', cpf: null, data_nascimento: '2016-05-05', clinica_id: 'clinica-a', cpf_responsavel: CPF_TITULAR,
  };
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'is', 'not']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [linhaPorCpfResponsavel], error: null });
  const db = { from(tabela: string) { tabelas.push(tabela); return q; } };
  return { db, tabelas };
}

Deno.test('CLIN-QA-512 CA0/CA7: get_dependentes devolve [] e não consulta cpf_responsavel', async () => {
  const { db, tabelas } = bancoQueRegistra();
  assertEquals(await dependentesDoTitular(db, TITULAR, HOJE), [], 'lista');
  assertEquals(tabelas, [], 'nenhuma tabela consultada');
});

Deno.test('CLIN-QA-512 CA0/CA2: dependente_id de um menor ligado só por cpf_responsavel é recusado', async () => {
  const { db } = bancoQueRegistra();
  const permitidos = await dependentesDoTitular(db, TITULAR, HOJE);
  assertEquals(resolverPacienteDaSessao('pac-titular', 'menor', permitidos), { ok: false }, 'menor');
  assertEquals(resolverPacienteDaSessao('pac-titular', 'qualquer-id', permitidos), { ok: false }, 'id forjado');
  assertEquals(resolverPacienteDaSessao('pac-titular', 123, permitidos), { ok: false }, 'id não textual');
  assertEquals(resolverPacienteDaSessao('pac-titular', ['menor'], [{ id: 'menor' }]), { ok: false }, 'lista como id');
});

Deno.test('CLIN-QA-512: sem dependente_id, ou com o próprio titular, a sessão é do titular', () => {
  const titular = { ok: true, pacienteId: 'pac-titular', comoDependente: false };
  assertEquals(resolverPacienteDaSessao('pac-titular', undefined, []), titular, 'ausente');
  assertEquals(resolverPacienteDaSessao('pac-titular', null, []), titular, 'nulo');
  assertEquals(resolverPacienteDaSessao('pac-titular', '', []), titular, 'vazio');
  assertEquals(resolverPacienteDaSessao('pac-titular', 'pac-titular', []), titular, 'o próprio titular');
});

Deno.test('CLIN-QA-512: dependente elegível troca a sessão (preparado para o vínculo explícito)', () => {
  assertEquals(
    resolverPacienteDaSessao('pac-titular', 'filho', [{ id: 'filho' }]),
    { ok: true, pacienteId: 'filho', comoDependente: true },
    'dependente permitido',
  );
});

Deno.test('CLIN-QA-512 CA0: update_contact só vale para o titular', () => {
  assertEquals(acaoExigeTitular('update_contact', 'filho', 'pac-titular'), true, 'contato de dependente');
  assertEquals(acaoExigeTitular('update_contact', 'pac-titular', 'pac-titular'), false, 'contato do titular');
  assertEquals(acaoExigeTitular('get_agendamentos', 'filho', 'pac-titular'), false, 'leitura');
  assertEquals(ERRO_DEPENDENTE_NAO_AUTORIZADO.code, 'dependent_not_authorized', 'código do erro');
});

Deno.test('CLIN-QA-512 CA1: vínculo confirmado de um menor da mesma clínica é elegível', () => {
  assertEquals(filtrarDependentesElegiveis(TITULAR, [vinculo()], HOJE), [{ id: 'filho', nome: 'Filho' }], 'elegível');
});

Deno.test('CLIN-QA-512 CA2: vínculo sem confirmação, revogado ou expirado não é elegível', () => {
  const lista = filtrarDependentesElegiveis(TITULAR, [
    vinculo({ dependente_id: 'sem-data', confirmado_em: null }),
    vinculo({ dependente_id: 'sem-autor', confirmado_por: null }),
    vinculo({ dependente_id: 'revogado', revogado_em: '2026-10-21T00:00:00.000Z' }),
    vinculo({ dependente_id: 'expirado', expira_em: '2026-10-27' }),
  ], HOJE);
  assertEquals(lista, [], 'elegíveis');
  assertEquals(
    filtrarDependentesElegiveis(TITULAR, [vinculo({ expira_em: '2026-10-28' })], HOJE).length,
    1,
    'expira amanhã ainda vale',
  );
});

Deno.test('CLIN-QA-512 CA3: vínculo de outra clínica ou de outro responsável não é elegível', () => {
  const lista = filtrarDependentesElegiveis(TITULAR, [
    vinculo({ dependente_id: 'dep-b', clinica_id: 'clinica-b' }),
    vinculo({ dependente_id: 'outro', responsavel_paciente_id: 'outro-titular' }),
  ], HOJE);
  assertEquals(lista, [], 'elegíveis');
  assertEquals(filtrarDependentesElegiveis({ id: 'pac-titular', clinica_id: '' }, [vinculo({ clinica_id: '' })], HOJE), [], 'titular sem clínica');
});

Deno.test('CLIN-QA-512 CA8: maioridade e data inválida tiram o dependente, mesmo confirmado', () => {
  const lista = filtrarDependentesElegiveis(TITULAR, [
    vinculo({ dependente_id: 'fez-18-hoje', data_nascimento: '2008-10-27' }),
    vinculo({ dependente_id: 'adulto', data_nascimento: '1980-01-01' }),
    vinculo({ dependente_id: 'sem-nascimento', data_nascimento: null }),
    vinculo({ dependente_id: 'faz-18-amanha', nome: 'Quase', data_nascimento: '2008-10-28' }),
  ], HOJE);
  assertEquals(lista, [{ id: 'faz-18-amanha', nome: 'Quase' }], 'elegíveis');
});

Deno.test('CLIN-QA-512: o titular não vira dependente de si mesmo e ids repetidos aparecem uma vez', () => {
  const lista = filtrarDependentesElegiveis(TITULAR, [
    vinculo({ dependente_id: 'pac-titular' }),
    vinculo(),
    vinculo(),
  ], HOJE);
  assertEquals(lista, [{ id: 'filho', nome: 'Filho' }], 'elegíveis');
});
