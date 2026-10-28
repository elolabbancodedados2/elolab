import { describe, expect, it } from 'vitest';
import {
  exigirBancoDescartavel,
  idSintetico,
  montarMassa,
  PACIENTES,
  serializarEnv,
  TABELAS_COM_CLINICA,
  tokenDoLinkPortal,
  usuariosSeed,
  variaveisQa,
} from '../../../tests/fixtures/duasClinicas.ts';
import {
  decidirSkipDeConfiguracao,
  motivoSkipPermitido,
  suiteObrigatoria,
} from '../../../tests/fixtures/suiteSeguranca.ts';
import { avaliarRelatorio, type RelatorioPlaywright } from '../../../tests/fixtures/gateSkip.ts';

const ENV_OK = {
  QA_SUPABASE_URL: 'http://127.0.0.1:54321',
  QA_SUPABASE_ANON_KEY: 'anon-local',
  QA_SUPABASE_SERVICE_ROLE_KEY: 'service-local',
  QA_SUPABASE_DISPOSABLE: 'ELOLAB_LOCAL_DISPOSABLE',
};

function idsFalsos() {
  return Object.fromEntries(usuariosSeed().map((u, i) => [u.chave, `00000000-0000-4000-8000-00000000000${i}`]));
}

describe('seed de duas clínicas — travas', () => {
  it('aceita só Supabase local descartável', () => {
    expect(exigirBancoDescartavel(ENV_OK).url).toBe('http://127.0.0.1:54321');
  });

  it('recusa URL fora de loopback', () => {
    expect(() => exigirBancoDescartavel({ ...ENV_OK, QA_SUPABASE_URL: 'https://abc.supabase.co' })).toThrow(/loopback/);
    expect(() => exigirBancoDescartavel({ ...ENV_OK, QA_SUPABASE_URL: 'http://127.0.0.1.nip.io:54321' })).toThrow(/loopback/);
  });

  it('recusa sem a confirmação de banco descartável', () => {
    expect(() => exigirBancoDescartavel({ ...ENV_OK, QA_SUPABASE_DISPOSABLE: undefined })).toThrow(/descartável/);
    expect(() => exigirBancoDescartavel({ ...ENV_OK, QA_SUPABASE_DISPOSABLE: 'sim' })).toThrow(/descartável/);
  });

  it('recusa sem a service role local', () => {
    expect(() => exigirBancoDescartavel({ ...ENV_OK, QA_SUPABASE_SERVICE_ROLE_KEY: ' ' })).toThrow(/QA_SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe('seed de duas clínicas — massa', () => {
  const massa = montarMassa(idsFalsos(), new Date('2026-10-27T12:00:00Z'));
  const porTabela = Object.fromEntries(massa.map((l) => [l.tabela, l]));
  const clinicaA = idSintetico('A', 'clinicas');
  const clinicaB = idSintetico('B', 'clinicas');

  it('gera UUIDs válidos e distintos por clínica', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(clinicaA).toMatch(uuid);
    expect(clinicaB).toMatch(uuid);
    expect(clinicaA).not.toBe(clinicaB);
    const todosIds = massa.flatMap((l) => l.linhas.map((r) => r.id)).filter(Boolean);
    expect(new Set(todosIds).size).toBe(todosIds.length);
  });

  it('cada tabela verificada tem ao menos uma linha em cada clínica (CLIN-QA-565)', () => {
    for (const tabela of TABELAS_COM_CLINICA) {
      const linhas = porTabela[tabela]?.linhas ?? [];
      expect(linhas.some((r) => r.clinica_id === clinicaA), `${tabela} sem linha em A`).toBe(true);
      expect(linhas.some((r) => r.clinica_id === clinicaB), `${tabela} sem linha em B`).toBe(true);
      // clinica_id explícito: o trigger fn_fill_clinica_id só preenche quando vem nulo.
      expect(linhas.every((r) => typeof r.clinica_id === 'string'), `${tabela} com clinica_id ausente`).toBe(true);
    }
  });

  it('registros dependentes apontam para paciente e médico da mesma clínica', () => {
    for (const tabela of ['agendamentos', 'prontuarios', 'prescricoes', 'atestados', 'retornos']) {
      for (const linha of porTabela[tabela].linhas) {
        const c = linha.clinica_id === clinicaA ? 'A' : 'B';
        expect(linha.paciente_id, `${tabela}.paciente_id`).toBe(idSintetico(c, 'pacientes', 1));
        expect(linha.medico_id, `${tabela}.medico_id`).toBe(idSintetico(c, 'medicos'));
      }
    }
  });

  it('cinco papéis na clínica A, admin em B, um papel por conta', () => {
    const papeisA = porTabela.user_roles.linhas.filter((r) => String(r.user_id).length > 0);
    expect(papeisA).toHaveLength(6);
    const perfis = porTabela.profiles.linhas;
    expect(perfis.filter((p) => p.clinica_id === clinicaA)).toHaveLength(5);
    expect(perfis.filter((p) => p.clinica_id === clinicaB)).toHaveLength(1);
  });

  it('P5 repete CPF e nascimento de P1 em outra clínica; CPFs só com dígitos', () => {
    expect(PACIENTES.P5.cpf).toBe(PACIENTES.P1.cpf);
    expect(PACIENTES.P5.clinica).not.toBe(PACIENTES.P1.clinica);
    for (const p of porTabela.pacientes.linhas) expect(String(p.cpf)).toMatch(/^\d{11}$/);
  });

  it('o catálogo tem um plano ativo e um inativo', () => {
    const planos = porTabela.planos.linhas;
    expect(planos.map((p) => [p.slug, p.ativo])).toEqual([['qa-plano-ativo', true], ['qa-plano-inativo', false]]);
  });

  it('nenhum convite pendente usa e-mail de conta do seed (muda o trigger de cadastro)', () => {
    const emails = new Set(usuariosSeed().map((u) => u.email));
    for (const convite of porTabela.employee_invitations.linhas) expect(emails.has(String(convite.email))).toBe(false);
  });

  it('exige o ID de todo usuário', () => {
    expect(() => montarMassa({})).toThrow(/A_admin/);
  });
});

describe('seed de duas clínicas — variáveis', () => {
  const senhas = Object.fromEntries(usuariosSeed().map((u) => [u.chave, `senha-${u.chave}`]));
  const vars = variaveisQa({ senhas, tokenPortal: 'tok' });
  const mapa = Object.fromEntries(vars.map((v) => [v.nome, v]));

  it('gera os nomes que as três suítes leem', () => {
    for (const nome of [
      'QA_CLINICA_A_EMAIL', 'QA_CLINICA_A_PASSWORD', 'QA_CLINICA_B_EMAIL', 'QA_CLINICA_B_PASSWORD',
      'QA_ADMIN_EMAIL', 'QA_MEDICO_EMAIL', 'QA_RECEPCAO_EMAIL', 'QA_ENFERMAGEM_EMAIL', 'QA_FINANCEIRO_EMAIL',
      'QA_CLINICA_A_ID', 'QA_CLINICA_B_ID', 'QA_CLINICA_A_PACIENTE_ID', 'QA_CLINICA_B_PACIENTE_ID',
      'QA_E2E_PACIENTE_TOKEN', 'QA_E2E_PACIENTE_NOME',
    ]) expect(mapa[nome], nome).toBeDefined();
    expect(mapa.QA_CLINICA_A_EMAIL.valor).toBe(mapa.QA_ADMIN_EMAIL.valor);
    expect(mapa.QA_CLINICA_B_EMAIL.valor).not.toBe(mapa.QA_CLINICA_A_EMAIL.valor);
  });

  it('marca senhas e token como sensíveis (::add-mask::)', () => {
    const sensiveis = vars.filter((v) => v.sensivel).map((v) => v.nome);
    expect(sensiveis.every((n) => /PASSWORD$|TOKEN$/.test(n))).toBe(true);
    expect(sensiveis).toContain('QA_E2E_PACIENTE_TOKEN');
    expect(vars.filter((v) => /PASSWORD$/.test(v.nome)).every((v) => v.sensivel)).toBe(true);
  });

  it('serializa uma variável por linha e recusa quebra de linha no valor', () => {
    expect(serializarEnv([{ nome: 'A', valor: '1' }, { nome: 'B', valor: 'x=y' }])).toBe('A=1\nB=x=y\n');
    expect(() => serializarEnv([{ nome: 'A', valor: 'a\nB=injetado' }])).toThrow(/quebra de linha/);
  });

  it('extrai o token do link do portal', () => {
    expect(tokenDoLinkPortal('https://app.elolab.com.br/portal-paciente?token=abc123')).toBe('abc123');
    expect(() => tokenDoLinkPortal(null)).toThrow();
    expect(() => tokenDoLinkPortal('https://app.elolab.com.br/portal-paciente')).toThrow(/sem token/);
  });
});

describe('modo obrigatório das suítes de segurança', () => {
  it('é obrigatório no CI e opcional fora dele', () => {
    expect(suiteObrigatoria({ CI: 'true' })).toBe(true);
    expect(suiteObrigatoria({ CI: '1' })).toBe(true);
    expect(suiteObrigatoria({})).toBe(false);
    expect(suiteObrigatoria({ CI: 'false' })).toBe(false);
    expect(suiteObrigatoria({ QA_SECURITY_REQUIRED: '1' })).toBe(true);
  });

  it('o job que não cobre as suítes precisa declarar isso', () => {
    expect(suiteObrigatoria({ CI: 'true', QA_SECURITY_SUITES: 'fora-deste-job' })).toBe(false);
  });

  it('sem configuração: pula fora do CI e FALHA no CI', () => {
    expect(decidirSkipDeConfiguracao('RLS', [], { CI: 'true' })).toBeNull();
    expect(decidirSkipDeConfiguracao('RLS', ['QA_SUPABASE_URL'], {})).toMatch(/faltam QA_SUPABASE_URL/);
    expect(() => decidirSkipDeConfiguracao('RLS', ['QA_SUPABASE_URL'], { CI: 'true' })).toThrow(/obrigatória/);
  });
});

function relatorio(testes: Array<{ file: string; title: string; status: string; skip?: string }>): RelatorioPlaywright {
  return {
    suites: testes.map((t) => ({
      title: t.file,
      file: t.file,
      specs: [{
        title: t.title,
        file: t.file,
        tests: [{ status: t.status, annotations: t.skip !== undefined ? [{ type: 'skip', description: t.skip }] : [] }],
      }],
    })),
  };
}

describe('gate de skip', () => {
  const executadosNasTres = [
    { file: 'rls.spec.ts', title: 'pacientes', status: 'expected' },
    { file: 'isolamento-entre-clinicas.spec.ts', title: 'pacientes', status: 'expected' },
    { file: 'perfis-rbac.spec.ts', title: 'admin api', status: 'expected' },
  ];

  it('passa com as três suítes executadas e skips da allowlist', () => {
    const r = avaliarRelatorio(relatorio([
      ...executadosNasTres,
      { file: 'rls.spec.ts', title: 'edge', status: 'skipped', skip: motivoSkipPermitido('edge-stub', 'sem stub') },
    ]));
    expect(r.problemas).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.skipsPermitidos).toBe(1);
  });

  it('falha quando tudo foi pulado (o caso dos 41 skipped da rodada 1)', () => {
    const r = avaliarRelatorio(relatorio([
      { file: 'rls.spec.ts', title: 'a', status: 'skipped', skip: 'Configure QA_SUPABASE_URL' },
      { file: 'isolamento-entre-clinicas.spec.ts', title: 'b', status: 'skipped', skip: 'Defina Supabase QA' },
      { file: 'perfis-rbac.spec.ts', title: 'c', status: 'skipped' },
    ]));
    expect(r.ok).toBe(false);
    expect(r.problemas.filter((p) => p.startsWith('Suíte inteira sem execução'))).toHaveLength(3);
    expect(r.problemas.filter((p) => p.startsWith('Pulado sem permissão'))).toHaveLength(3);
  });

  it('falha com relatório vazio', () => {
    expect(avaliarRelatorio({}).ok).toBe(false);
  });

  it('falha com skip fora da allowlist ou com chave desconhecida', () => {
    const r = avaliarRelatorio(relatorio([
      ...executadosNasTres,
      { file: 'rls.spec.ts', title: 'x', status: 'skipped', skip: motivoSkipPermitido('qualquer-coisa', 'inventado') },
    ]));
    expect(r.ok).toBe(false);
  });

  it('--sem-allowlist recusa até os skips permitidos', () => {
    const r = avaliarRelatorio(relatorio([
      ...executadosNasTres,
      { file: 'rls.spec.ts', title: 'edge', status: 'skipped', skip: motivoSkipPermitido('edge-stub', 'sem stub') },
    ]), { allowlist: {} });
    expect(r.ok).toBe(false);
  });

  it('falha quando algum teste falhou', () => {
    const r = avaliarRelatorio(relatorio([...executadosNasTres, { file: 'rls.spec.ts', title: 'vazou', status: 'unexpected' }]));
    expect(r.ok).toBe(false);
    expect(r.problemas).toContain('Falhou: rls.spec.ts › vazou');
  });
});
