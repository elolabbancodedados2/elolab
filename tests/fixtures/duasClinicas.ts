/**
 * Massa sintética de duas clínicas para as suítes de segurança
 * (`tests/rls.spec.ts`, `tests/isolamento-entre-clinicas.spec.ts`,
 * `tests/perfis-rbac.spec.ts`). CLIN-QA-565 e CLIN-QA-566.
 *
 * Este módulo é puro: não faz rede nem lê arquivo. Quem grava é
 * `tests/fixtures/seed-duas-clinicas.ts`. Assim a massa e as travas podem ser
 * testadas em unidade (`src/lib/__tests__/qaSeedDuasClinicas.test.ts`).
 *
 * Regras:
 * - Só dados sintéticos. Os CPFs são de geradores públicos de teste
 *   (`docs/qa/plano-regressao-rodada-1.md`, seção 1).
 * - Só banco local descartável. A trava `exigirBancoDescartavel` recusa
 *   qualquer URL fora de loopback e exige a confirmação explícita.
 * - IDs fixos, para o seed poder rodar de novo sem duplicar linha.
 */

export type Ambiente = Record<string, string | undefined>;
export type Clinica = 'A' | 'B';
export type Papel = 'admin' | 'medico' | 'recepcao' | 'enfermagem' | 'financeiro';

export const CONFIRMACAO_DESCARTAVEL = 'ELOLAB_LOCAL_DISPOSABLE';
export const VERSAO_SEED = '2026-10-27.1';
export const DOMINIO_EMAIL = 'qa.elolab.test';

export const PAPEIS: readonly Papel[] = ['admin', 'medico', 'recepcao', 'enfermagem', 'financeiro'];

/**
 * Tabelas que o seed garante ter ao menos uma linha em CADA clínica. As
 * suítes de isolamento só afirmam "A não vê B" sobre estas tabelas, porque
 * só nelas o resultado vazio não pode ser confundido com sucesso.
 */
export const TABELAS_COM_CLINICA = [
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
  'retornos',
  'feedbacks_nps',
  'whatsapp_sessions',
  'audit_log',
  'employee_invitations',
] as const;

/** Tabelas privadas sem `clinica_id` que o seed também preenche. */
export const TABELAS_SEM_CLINICA = ['profiles', 'user_roles', 'registros_pendentes'] as const;

function isLoopback(valor: string): boolean {
  try {
    const url = new URL(valor);
    return ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export interface ConfigSeed {
  url: string;
  serviceRoleKey: string;
  anonKey: string;
}

/**
 * Recusa rodar fora de um Supabase local descartável. Lança erro em vez de
 * devolver `null`: o seed nunca deve "pular em silêncio".
 */
export function exigirBancoDescartavel(env: Ambiente): ConfigSeed {
  const url = env.QA_SUPABASE_URL?.trim();
  const anonKey = env.QA_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = env.QA_SUPABASE_SERVICE_ROLE_KEY?.trim();
  const faltando = [
    !url && 'QA_SUPABASE_URL',
    !anonKey && 'QA_SUPABASE_ANON_KEY',
    !serviceRoleKey && 'QA_SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);
  if (faltando.length) {
    throw new Error(`Seed recusado: faltam ${faltando.join(', ')}.`);
  }
  if (!isLoopback(url!)) {
    throw new Error('Seed recusado: QA_SUPABASE_URL precisa ser loopback (127.0.0.1, localhost ou [::1]).');
  }
  if (env.QA_SUPABASE_DISPOSABLE !== CONFIRMACAO_DESCARTAVEL) {
    throw new Error(`Seed recusado: defina QA_SUPABASE_DISPOSABLE=${CONFIRMACAO_DESCARTAVEL} para confirmar que o banco é descartável.`);
  }
  return { url: url!.replace(/\/+$/, ''), anonKey: anonKey!, serviceRoleKey: serviceRoleKey! };
}

const PREFIXO_ID: Record<Clinica, string> = { A: '0a', B: '0b' };
const CODIGO_TABELA: Record<string, string> = {
  clinicas: '00', pacientes: '01', medicos: '02', agendamentos: '03', prontuarios: '04',
  prescricoes: '05', atestados: '06', exames: '07', lancamentos: '08', estoque: '09',
  funcionarios: '10', retornos: '11', feedbacks_nps: '12', whatsapp_sessions: '13',
  audit_log: '14', employee_invitations: '15', registros_pendentes: '16', planos: '17',
};

/** UUID v4 válido e fixo: `0a01…` é o primeiro paciente da clínica A. */
export function idSintetico(clinica: Clinica | 'Q', tabela: string, n = 1): string {
  const prefixo = clinica === 'Q' ? '0f' : PREFIXO_ID[clinica];
  const codigo = CODIGO_TABELA[tabela];
  if (!codigo) throw new Error(`Tabela sem código de ID sintético: ${tabela}`);
  const sufixo = String(n).padStart(12, '0');
  return `${prefixo}${codigo}0000-0000-4000-8000-${sufixo}`;
}

export interface UsuarioSeed {
  chave: string;
  clinica: Clinica;
  papel: Papel;
  email: string;
  nome: string;
}

/** Cinco perfis na clínica A e um admin na clínica B. */
export function usuariosSeed(): UsuarioSeed[] {
  const daClinicaA = PAPEIS.map((papel) => ({
    chave: `A_${papel}`,
    clinica: 'A' as const,
    papel,
    email: `qa-a-${papel}@${DOMINIO_EMAIL}`,
    nome: `QA Sintético A ${papel}`,
  }));
  return [
    ...daClinicaA,
    { chave: 'B_admin', clinica: 'B', papel: 'admin', email: `qa-b-admin@${DOMINIO_EMAIL}`, nome: 'QA Sintético B admin' },
  ];
}

export interface Lote {
  tabela: string;
  /** Coluna(s) de conflito para o upsert. */
  conflito: string;
  /** `merge` atualiza a linha existente; `ignorar` deixa como está. */
  modo: 'merge' | 'ignorar';
  linhas: Record<string, unknown>[];
}

/** Pacientes do plano de regressão, seção 1. CPFs só com dígitos (`20260815150000`). */
export const PACIENTES = {
  P1: { clinica: 'A' as const, n: 1, nome: 'Paciente Sintético P1', cpf: '52998224725', data_nascimento: '1990-05-31', telefone: '11988881234' },
  P2: { clinica: 'A' as const, n: 2, nome: 'Paciente Sintético P2', cpf: '11144477735', data_nascimento: '1985-01-10', telefone: '31988881234' },
  P3: { clinica: 'A' as const, n: 3, nome: 'Paciente Sintético P3', cpf: '39053344705', data_nascimento: null, telefone: null },
  // Mesmo CPF e nascimento de P1, em outra clínica: prova que a busca respeita clinica_id.
  P5: { clinica: 'B' as const, n: 1, nome: 'Paciente Sintético P5', cpf: '52998224725', data_nascimento: '1990-05-31', telefone: '21977775678' },
} as const;

function dataMaisDias(hoje: Date, dias: number): string {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + dias));
  return d.toISOString().slice(0, 10);
}

/**
 * Monta os lotes na ordem de dependência. `userIds` vem da criação dos
 * usuários pelo Admin API (os IDs do Auth não são fixos).
 */
export function montarMassa(userIds: Record<string, string>, hoje = new Date()): Lote[] {
  const usuarios = usuariosSeed();
  for (const u of usuarios) {
    if (!userIds[u.chave]) throw new Error(`ID do usuário ${u.chave} ausente.`);
  }
  const clinicaId = (c: Clinica) => idSintetico(c, 'clinicas');
  const pacientePrincipal = (c: Clinica) => idSintetico(c, 'pacientes', 1);
  const medico = (c: Clinica) => idSintetico(c, 'medicos');
  const porClinica = (fn: (c: Clinica) => Record<string, unknown>) => (['A', 'B'] as const).map(fn);

  return [
    {
      tabela: 'clinicas', conflito: 'id', modo: 'merge',
      linhas: porClinica((c) => ({ id: clinicaId(c), nome: `Clínica Sintética ${c} (QA)`, owner_id: userIds[`${c}_admin`] })),
    },
    {
      tabela: 'profiles', conflito: 'id', modo: 'merge',
      linhas: usuarios.map((u) => ({ id: userIds[u.chave], nome: u.nome, email: u.email, clinica_id: clinicaId(u.clinica) })),
    },
    {
      tabela: 'user_roles', conflito: 'user_id,role', modo: 'ignorar',
      linhas: usuarios.map((u) => ({ user_id: userIds[u.chave], role: u.papel })),
    },
    {
      tabela: 'pacientes', conflito: 'id', modo: 'merge',
      linhas: Object.values(PACIENTES).map((p) => ({
        id: idSintetico(p.clinica, 'pacientes', p.n),
        clinica_id: clinicaId(p.clinica),
        nome: p.nome,
        cpf: p.cpf,
        data_nascimento: p.data_nascimento,
        telefone: p.telefone,
      })),
    },
    {
      tabela: 'medicos', conflito: 'id', modo: 'merge',
      linhas: porClinica((c) => ({
        id: medico(c), clinica_id: clinicaId(c), nome: `Médico Sintético ${c}`, crm: `QA${c}0001`, crm_uf: 'SP',
        especialidade: 'Clínica geral', ativo: true,
        // O médico da clínica A é o usuário com papel médico.
        user_id: c === 'A' ? userIds.A_medico : null,
      })),
    },
    {
      tabela: 'agendamentos', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({
        id: idSintetico(c, 'agendamentos'), clinica_id: clinicaId(c), paciente_id: pacientePrincipal(c),
        medico_id: medico(c), data: dataMaisDias(hoje, 7), hora_inicio: '09:00', hora_fim: '09:30',
      })),
    },
    {
      tabela: 'prontuarios', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({
        id: idSintetico(c, 'prontuarios'), clinica_id: clinicaId(c), paciente_id: pacientePrincipal(c),
        medico_id: medico(c), queixa_principal: 'Registro sintético de QA, sem conteúdo clínico.',
      })),
    },
    {
      tabela: 'prescricoes', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({
        id: idSintetico(c, 'prescricoes'), clinica_id: clinicaId(c), paciente_id: pacientePrincipal(c),
        medico_id: medico(c), medicamento: 'Item sintético de QA',
      })),
    },
    {
      tabela: 'atestados', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({
        id: idSintetico(c, 'atestados'), clinica_id: clinicaId(c), paciente_id: pacientePrincipal(c),
        medico_id: medico(c), motivo: 'Registro sintético de QA',
      })),
    },
    {
      tabela: 'exames', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({
        id: idSintetico(c, 'exames'), clinica_id: clinicaId(c), paciente_id: pacientePrincipal(c),
        tipo_exame: 'Exame sintético de QA',
      })),
    },
    {
      tabela: 'lancamentos', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({
        id: idSintetico(c, 'lancamentos'), clinica_id: clinicaId(c), tipo: 'receita', categoria: 'Consulta',
        descricao: 'Lançamento sintético de QA', valor: 100,
      })),
    },
    {
      tabela: 'estoque', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({ id: idSintetico(c, 'estoque'), clinica_id: clinicaId(c), nome: 'Item sintético de QA', categoria: 'Material' })),
    },
    {
      tabela: 'funcionarios', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({ id: idSintetico(c, 'funcionarios'), clinica_id: clinicaId(c), nome: `Funcionário Sintético ${c}` })),
    },
    {
      tabela: 'employee_invitations', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({
        id: idSintetico(c, 'employee_invitations'), clinica_id: clinicaId(c), funcionario_id: idSintetico(c, 'funcionarios'),
        // E-mail que nenhum usuário do seed usa: um convite pendente mudaria o
        // caminho do trigger de cadastro (`handle_new_user`).
        email: `convite-pendente-${c.toLowerCase()}@${DOMINIO_EMAIL}`,
        token: `qa-convite-sintetico-${c.toLowerCase()}`,
        roles: ['recepcao'],
      })),
    },
    {
      tabela: 'retornos', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({
        id: idSintetico(c, 'retornos'), clinica_id: clinicaId(c), paciente_id: pacientePrincipal(c),
        medico_id: medico(c), data_retorno_prevista: dataMaisDias(hoje, 30),
      })),
    },
    {
      tabela: 'feedbacks_nps', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({ id: idSintetico(c, 'feedbacks_nps'), clinica_id: clinicaId(c), paciente_id: pacientePrincipal(c), nota: 9 })),
    },
    {
      tabela: 'whatsapp_sessions', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({ id: idSintetico(c, 'whatsapp_sessions'), clinica_id: clinicaId(c), instance_name: `qa-sintetica-${c.toLowerCase()}` })),
    },
    {
      tabela: 'audit_log', conflito: 'id', modo: 'ignorar',
      linhas: porClinica((c) => ({
        id: idSintetico(c, 'audit_log'), clinica_id: clinicaId(c), action: 'qa_seed', collection: 'pacientes',
        record_id: pacientePrincipal(c), user_id: userIds[`${c}_admin`],
      })),
    },
    {
      tabela: 'registros_pendentes', conflito: 'id', modo: 'ignorar',
      linhas: [{
        id: idSintetico('Q', 'registros_pendentes'), nome: 'Cadastro Sintético QA', email: `registro-pendente@${DOMINIO_EMAIL}`,
        plano_slug: 'qa-plano-ativo', codigo_convite: 'QA-SINTETICO-0001', expires_at: `${dataMaisDias(hoje, 7)}T00:00:00Z`,
      }],
    },
    {
      // Um plano ativo e um inativo: o teste do catálogo público precisa ver o
      // primeiro e não pode ver o segundo.
      tabela: 'planos', conflito: 'slug', modo: 'merge',
      linhas: [
        { id: idSintetico('Q', 'planos', 1), nome: 'Plano Sintético QA Ativo', slug: 'qa-plano-ativo', valor: 1, ativo: true },
        { id: idSintetico('Q', 'planos', 2), nome: 'Plano Sintético QA Inativo', slug: 'qa-plano-inativo', valor: 1, ativo: false },
      ],
    },
  ];
}

export interface SaidaSeed {
  senhas: Record<string, string>;
  tokenPortal: string;
}

/** Nomes que as três suítes leem. Os valores sensíveis vêm marcados. */
export function variaveisQa(saida: SaidaSeed): Array<{ nome: string; valor: string; sensivel: boolean }> {
  const vars: Array<{ nome: string; valor: string; sensivel: boolean }> = [];
  const add = (nome: string, valor: string, sensivel = false) => vars.push({ nome, valor, sensivel });
  for (const u of usuariosSeed()) {
    const senha = saida.senhas[u.chave];
    if (!senha) throw new Error(`Senha do usuário ${u.chave} ausente.`);
    if (u.clinica === 'A') {
      add(`QA_${u.papel.toUpperCase()}_EMAIL`, u.email);
      add(`QA_${u.papel.toUpperCase()}_PASSWORD`, senha, true);
    }
    if (u.papel === 'admin') {
      add(`QA_CLINICA_${u.clinica}_EMAIL`, u.email);
      add(`QA_CLINICA_${u.clinica}_PASSWORD`, senha, true);
    }
  }
  add('QA_CLINICA_A_ID', idSintetico('A', 'clinicas'));
  add('QA_CLINICA_B_ID', idSintetico('B', 'clinicas'));
  add('QA_CLINICA_A_PACIENTE_ID', idSintetico('A', 'pacientes', 1));
  add('QA_CLINICA_B_PACIENTE_ID', idSintetico('B', 'pacientes', 1));
  add('QA_E2E_PACIENTE_TOKEN', saida.tokenPortal, true);
  add('QA_E2E_PACIENTE_NOME', PACIENTES.P1.nome);
  add('QA_SEED_VERSAO', VERSAO_SEED);
  return vars;
}

/** Formato `NOME=valor` aceito por `$GITHUB_ENV` e por arquivos dotenv. */
export function serializarEnv(vars: Array<{ nome: string; valor: string }>): string {
  return vars.map(({ nome, valor }) => {
    if (/[\r\n]/.test(valor)) throw new Error(`Valor com quebra de linha em ${nome}.`);
    return `${nome}=${valor}`;
  }).join('\n') + '\n';
}

/** Extrai o token bruto do link devolvido por `link_portal_paciente`. */
export function tokenDoLinkPortal(link: unknown): string {
  if (typeof link !== 'string' || !link) throw new Error('link_portal_paciente não devolveu link.');
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error('Link do portal sem token.');
  return token;
}
