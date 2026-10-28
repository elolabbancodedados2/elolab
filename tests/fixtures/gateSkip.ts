/**
 * Gate de skip das suítes de segurança (CLIN-QA-002, achado da rodada 1:
 * `41 skipped` com saída 0 deixava o CI verde sem ter testado nada).
 *
 * Lê o relatório JSON do Playwright e falha quando:
 * - o relatório não existe, não é JSON ou não tem testes;
 * - alguma das três specs de segurança não executou nenhum teste;
 * - algum teste foi pulado sem uma razão da allowlist abaixo;
 * - algum teste falhou (redundante com a saída do Playwright, mas deixa o
 *   motivo explícito no log).
 *
 * Uma razão permitida é escrita na spec como `[skip-permitido:<chave>] ...`
 * (veja `motivoSkipPermitido` em `tests/fixtures/suiteSeguranca.ts`).
 *
 * Uso: node scripts/qa/falhar-se-pulado.mjs seguranca.json [--sem-allowlist]
 */
import { existsSync, readFileSync } from 'node:fs';

export const SPECS_DE_SEGURANCA = [
  'rls.spec.ts',
  'isolamento-entre-clinicas.spec.ts',
  'perfis-rbac.spec.ts',
] as const;

/**
 * Skips aceitos enquanto a dependência não existe no job. Cada linha tem dono
 * e item; remova a linha quando a dependência chegar. `--sem-allowlist`
 * desliga todas (meta da fase 2: zero skip).
 */
export const SKIPS_PERMITIDOS: Record<string, string> = {
  // Edge functions exigem `supabase functions serve` com stubs das integrações
  // externas (Evolution, Mercado Pago, OpenAI). Item B7 de ci-banco-efemero.md. Dono: devops-sre + backend-developer.
  'edge-stub': 'edge functions sem stub local',
  // Mesmo motivo, para as ações do WhatsApp na suíte de isolamento.
  'whatsapp-stub': 'WhatsApp sem stub local',
  // `list_instances` só tem o que conferir com uma Evolution de teste respondendo.
  'evolution-indisponivel': 'Evolution de teste indisponível',
  // 'app-local-564' saiu na rodada 3: a interface do RBAC e o portal passam
  // pela ponte de tests/fixtures/ponteSupabaseApp.ts (CLIN-QA-564).
};

const PADRAO_PERMITIDO = /\[skip-permitido:([a-z0-9-]+)\]/;

interface TesteRelatorio {
  status?: string;
  annotations?: Array<{ type?: string; description?: string }>;
  results?: Array<{ annotations?: Array<{ type?: string; description?: string }> }>;
}
interface SpecRelatorio { title?: string; file?: string; tests?: TesteRelatorio[] }
interface SuiteRelatorio { title?: string; file?: string; specs?: SpecRelatorio[]; suites?: SuiteRelatorio[] }
export interface RelatorioPlaywright { suites?: SuiteRelatorio[]; stats?: Record<string, number> }

export interface ResultadoGate {
  ok: boolean;
  problemas: string[];
  porArquivo: Record<string, { executados: number; pulados: number; falhas: number }>;
  skipsPermitidos: number;
}

function nomeArquivo(caminho = ''): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

function motivoDoSkip(teste: TesteRelatorio): string {
  const todas = [
    ...(teste.annotations ?? []),
    ...(teste.results ?? []).flatMap((r) => r.annotations ?? []),
  ];
  return todas.find((a) => a.type === 'skip')?.description ?? '';
}

function* percorrer(suites: SuiteRelatorio[] = [], arquivo = ''): Generator<{ arquivo: string; titulo: string; teste: TesteRelatorio }> {
  for (const suite of suites) {
    const arq = suite.file || arquivo;
    for (const spec of suite.specs ?? []) {
      for (const teste of spec.tests ?? []) {
        yield { arquivo: nomeArquivo(spec.file || arq), titulo: spec.title ?? '(sem título)', teste };
      }
    }
    yield* percorrer(suite.suites, arq);
  }
}

export function avaliarRelatorio(
  relatorio: RelatorioPlaywright,
  opcoes: { allowlist?: Record<string, string>; specs?: readonly string[] } = {},
): ResultadoGate {
  const allowlist = opcoes.allowlist ?? SKIPS_PERMITIDOS;
  const specs = opcoes.specs ?? SPECS_DE_SEGURANCA;
  const problemas: string[] = [];
  const porArquivo: ResultadoGate['porArquivo'] = {};
  for (const s of specs) porArquivo[s] = { executados: 0, pulados: 0, falhas: 0 };
  let skipsPermitidos = 0;

  for (const { arquivo, titulo, teste } of percorrer(relatorio.suites)) {
    const conta = (porArquivo[arquivo] ??= { executados: 0, pulados: 0, falhas: 0 });
    if (teste.status === 'skipped') {
      conta.pulados++;
      const motivo = motivoDoSkip(teste);
      const chave = PADRAO_PERMITIDO.exec(motivo)?.[1];
      if (chave && allowlist[chave]) skipsPermitidos++;
      else problemas.push(`Pulado sem permissão: ${arquivo} › ${titulo}${motivo ? ` (${motivo})` : ' (sem motivo)'}`);
    } else {
      conta.executados++;
      if (teste.status === 'unexpected') {
        conta.falhas++;
        problemas.push(`Falhou: ${arquivo} › ${titulo}`);
      }
    }
  }

  for (const s of specs) {
    if (porArquivo[s].executados === 0) {
      problemas.push(`Suíte inteira sem execução: ${s} (${porArquivo[s].pulados} pulado(s)). Isto não prova isolamento.`);
    }
  }

  return { ok: problemas.length === 0, problemas, porArquivo, skipsPermitidos };
}

export function executarGate(argv: string[], log: (linha: string) => void = console.log): number {
  const caminho = argv.find((a) => !a.startsWith('--'));
  const semAllowlist = argv.includes('--sem-allowlist');
  if (!caminho || !existsSync(caminho)) {
    log(`Gate de skip: relatório JSON não encontrado (${caminho ?? 'nenhum caminho informado'}).`);
    return 1;
  }
  let relatorio: RelatorioPlaywright;
  try {
    relatorio = JSON.parse(readFileSync(caminho, 'utf8'));
  } catch {
    log(`Gate de skip: ${caminho} não é JSON válido.`);
    return 1;
  }
  const r = avaliarRelatorio(relatorio, { allowlist: semAllowlist ? {} : SKIPS_PERMITIDOS });
  for (const [arquivo, c] of Object.entries(r.porArquivo)) {
    log(`${arquivo}: ${c.executados} executado(s), ${c.pulados} pulado(s), ${c.falhas} falha(s)`);
  }
  log(`Skips da allowlist: ${r.skipsPermitidos}`);
  if (r.ok) {
    log('Gate de skip: OK.');
    return 0;
  }
  for (const p of r.problemas) log(`- ${p}`);
  log('Gate de skip: FALHOU.');
  return 1;
}
