/**
 * Seed sintético de duas clínicas no Supabase LOCAL descartável.
 * CLIN-QA-566. Massa em `tests/fixtures/duasClinicas.ts`.
 *
 * Uso (Node 24, que remove os tipos do TypeScript sozinho):
 *   QA_SUPABASE_URL=http://127.0.0.1:54321 \
 *   QA_SUPABASE_ANON_KEY=<anon local> \
 *   QA_SUPABASE_SERVICE_ROLE_KEY=<service_role local> \
 *   QA_SUPABASE_DISPOSABLE=ELOLAB_LOCAL_DISPOSABLE \
 *   node tests/fixtures/seed-duas-clinicas.ts [--saida arquivo.env]
 *
 * Também roda como `node scripts/qa/seed-duas-clinicas.mjs` (nome usado no
 * rascunho do job em `docs/operations/ci-banco-efemero.md`).
 *
 * Saída:
 * - com `GITHUB_ENV` definido (CI), acrescenta as variáveis `QA_*` nele e
 *   mascara senhas e token com `::add-mask::`;
 * - sem ele, grava em `--saida` (padrão `supabase/.temp/qa-seed.env`, que o
 *   `.gitignore` já ignora).
 * Nunca imprime senha, token ou chave no log.
 *
 * Idempotente: IDs fixos; usuários existentes recebem senha nova a cada execução.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  exigirBancoDescartavel,
  idSintetico,
  montarMassa,
  serializarEnv,
  TABELAS_COM_CLINICA,
  tokenDoLinkPortal,
  usuariosSeed,
  variaveisQa,
  type Ambiente,
  type ConfigSeed,
} from './duasClinicas.ts';

class ErroSeed extends Error {}

function cabecalhos(cfg: ConfigSeed, extra: Record<string, string> = {}) {
  return {
    apikey: cfg.serviceRoleKey,
    Authorization: `Bearer ${cfg.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function chamar(cfg: ConfigSeed, metodo: string, caminho: string, corpo?: unknown, extra?: Record<string, string>) {
  const resposta = await fetch(`${cfg.url}${caminho}`, {
    method: metodo,
    headers: cabecalhos(cfg, extra),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  let json: unknown = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
  return { ok: resposta.ok, status: resposta.status, json };
}

function senhaAleatoria(): string {
  // 24 bytes aleatórios + classes exigidas por políticas de senha comuns.
  return `${randomBytes(24).toString('base64url')}Aa1-`;
}

async function encontrarUsuario(cfg: ConfigSeed, email: string): Promise<string | null> {
  for (let pagina = 1; pagina <= 20; pagina++) {
    const r = await chamar(cfg, 'GET', `/auth/v1/admin/users?page=${pagina}&per_page=200`);
    if (!r.ok) throw new ErroSeed(`Listagem de usuários falhou (${r.status}).`);
    const users = (r.json as { users?: Array<{ id: string; email?: string }> })?.users ?? [];
    const achado = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (achado) return achado.id;
    if (users.length < 200) return null;
  }
  return null;
}

async function garantirUsuario(cfg: ConfigSeed, email: string, nome: string, senha: string): Promise<string> {
  // `invite_token` faz o `handle_new_user` criar só o perfil, sem clínica
  // própria; a clínica sintética é atribuída depois, como service_role.
  const user_metadata = { nome, invite_token: 'qa-seed-sintetico' };
  const criado = await chamar(cfg, 'POST', '/auth/v1/admin/users', {
    email, password: senha, email_confirm: true, user_metadata,
  });
  if (criado.ok) return (criado.json as { id: string }).id;

  const id = await encontrarUsuario(cfg, email);
  if (!id) throw new ErroSeed(`Não foi possível criar nem encontrar o usuário ${email} (${criado.status}).`);
  const atualizado = await chamar(cfg, 'PUT', `/auth/v1/admin/users/${id}`, { password: senha, email_confirm: true });
  if (!atualizado.ok) throw new ErroSeed(`Não foi possível redefinir a senha de ${email} (${atualizado.status}).`);
  return id;
}

function mensagemPostgrest(json: unknown): string {
  if (json && typeof json === 'object') {
    const { code, message, details, hint } = json as Record<string, unknown>;
    return [code, message, details, hint].filter(Boolean).join(' | ');
  }
  return String(json ?? '');
}

async function conferirContagens(cfg: ConfigSeed): Promise<string[]> {
  const falhas: string[] = [];
  for (const tabela of TABELAS_COM_CLINICA) {
    for (const c of ['A', 'B'] as const) {
      const r = await chamar(cfg, 'GET', `/rest/v1/${tabela}?select=id&clinica_id=eq.${idSintetico(c, 'clinicas')}&limit=1`);
      if (!r.ok || !Array.isArray(r.json) || r.json.length === 0) {
        falhas.push(`${tabela}: clínica ${c} sem linha (${r.status} ${mensagemPostgrest(r.json)})`);
      }
    }
  }
  return falhas;
}

export async function executarSeed(env: Ambiente = process.env, argv: string[] = process.argv.slice(2)) {
  const cfg = exigirBancoDescartavel(env);

  const senhas: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  for (const u of usuariosSeed()) {
    senhas[u.chave] = senhaAleatoria();
    userIds[u.chave] = await garantirUsuario(cfg, u.email, u.nome, senhas[u.chave]);
  }
  console.log(`Usuários sintéticos prontos: ${Object.keys(userIds).length}`);

  const falhas: string[] = [];
  for (const lote of montarMassa(userIds)) {
    const preferencia = lote.modo === 'merge' ? 'resolution=merge-duplicates' : 'resolution=ignore-duplicates';
    const r = await chamar(
      cfg, 'POST', `/rest/v1/${lote.tabela}?on_conflict=${encodeURIComponent(lote.conflito)}`,
      lote.linhas, { Prefer: `${preferencia},return=minimal` },
    );
    if (r.ok) console.log(`  ${lote.tabela}: ${lote.linhas.length} linha(s)`);
    else falhas.push(`${lote.tabela}: ${r.status} ${mensagemPostgrest(r.json)}`);
  }

  // Token revogável de portal para P1. Gerado pela própria função do banco,
  // que guarda só o hash; o valor bruto vai para QA_E2E_PACIENTE_TOKEN.
  let tokenPortal = '';
  const link = await chamar(cfg, 'POST', '/rest/v1/rpc/link_portal_paciente', { p_paciente_id: idSintetico('A', 'pacientes', 1) });
  if (link.ok) tokenPortal = tokenDoLinkPortal(link.json);
  else falhas.push(`link_portal_paciente: ${link.status} ${mensagemPostgrest(link.json)}`);

  falhas.push(...await conferirContagens(cfg));
  if (falhas.length) {
    throw new ErroSeed(`Seed incompleto. As suítes não podem rodar assim:\n- ${falhas.join('\n- ')}`);
  }

  const vars = variaveisQa({ senhas, tokenPortal });
  const githubEnv = env.GITHUB_ENV;
  if (githubEnv) {
    for (const v of vars) if (v.sensivel) console.log(`::add-mask::${v.valor}`);
    appendFileSync(githubEnv, serializarEnv(vars));
    console.log(`Variáveis QA_* gravadas no GITHUB_ENV: ${vars.length}`);
  } else {
    const i = argv.indexOf('--saida');
    const destino = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : 'supabase/.temp/qa-seed.env');
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, serializarEnv(vars), { mode: 0o600 });
    console.log(`Variáveis QA_* gravadas em ${destino}: ${vars.length}`);
  }
}

const executadoDireto = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executadoDireto) {
  executarSeed().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : 'Seed falhou.');
    process.exit(1);
  });
}
