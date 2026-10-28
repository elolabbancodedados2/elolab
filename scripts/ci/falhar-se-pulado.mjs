#!/usr/bin/env node
// Gate do job security-e2e: lê o relatório JSON do Playwright e falha quando
// a suíte "passa" sem ter testado nada.
//
// Falha (código 1) quando:
//   - o relatório não existe ou tem erro de carga (spec que nem abriu);
//   - algum teste foi pulado e não está em scripts/ci/security-e2e-skips-permitidos.json;
//   - um item da allowlist passou da data de revisão (o skip vira dívida com prazo);
//   - alguma spec exigida (--exigir) não executou nenhum teste;
//   - nenhum teste foi executado;
//   - houve teste com resultado inesperado.
//
// Uso:
//   node scripts/ci/falhar-se-pulado.mjs <relatorio.json> \
//     --exigir rls.spec.ts,isolamento-entre-clinicas.spec.ts,perfis-rbac.spec.ts \
//     [--permitidos scripts/ci/security-e2e-skips-permitidos.json]
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const SEPARADOR = ' › ';

/** Percorre suites/specs do JSON do Playwright e devolve um item por teste. */
export function listarTestes(relatorio) {
  const saida = [];
  const visitar = (suite, caminho) => {
    // A suíte de topo tem o título igual ao arquivo; não entra no título do teste.
    const ehArquivo = suite.file && suite.title === suite.file;
    const titulos = ehArquivo || !suite.title ? caminho : [...caminho, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const teste of spec.tests ?? []) {
        saida.push({
          arquivo: basename(spec.file ?? suite.file ?? ''),
          titulo: [...titulos, spec.title].join(SEPARADOR),
          projeto: teste.projectName ?? '',
          status: teste.status,
          motivoSkip: (teste.annotations ?? []).find((a) => a.type === 'skip')?.description ?? '',
        });
      }
    }
    for (const filha of suite.suites ?? []) visitar(filha, titulos);
  };
  for (const suite of relatorio.suites ?? []) visitar(suite, []);
  return saida;
}

/**
 * @param {object} relatorio JSON do reporter "json" do Playwright
 * @param {{exigir?: string[], permitidos?: Array<{arquivo:string,titulo:string,motivo:string,dono:string,revisar_ate:string}>, hoje?: string}} opcoes
 * @returns {{ok: boolean, erros: string[], avisos: string[], resumo: Record<string, number>}}
 */
export function avaliarRelatorio(relatorio, { exigir = [], permitidos = [], hoje = new Date().toISOString().slice(0, 10) } = {}) {
  const erros = [];
  const avisos = [];

  for (const erro of relatorio.errors ?? []) {
    erros.push(`erro de carga no Playwright: ${(erro.message ?? String(erro)).split('\n')[0]}`);
  }

  for (const item of permitidos) {
    if (!item.arquivo || !item.titulo || !item.motivo || !item.dono || !item.revisar_ate) {
      erros.push(`item da allowlist incompleto (arquivo, titulo, motivo, dono e revisar_ate são obrigatórios): ${JSON.stringify(item)}`);
    } else if (item.revisar_ate < hoje) {
      erros.push(`skip permitido venceu em ${item.revisar_ate}: ${item.arquivo}${SEPARADOR}${item.titulo} (dono: ${item.dono})`);
    }
  }

  const testes = listarTestes(relatorio);
  const executados = testes.filter((t) => t.status !== 'skipped');
  const pulados = testes.filter((t) => t.status === 'skipped');
  const permitido = (t) => permitidos.some((p) => p.arquivo === t.arquivo && p.titulo === t.titulo);

  for (const t of pulados) {
    if (permitido(t)) {
      avisos.push(`pulado (permitido): ${t.arquivo}${SEPARADOR}${t.titulo}`);
    } else {
      erros.push(`pulado sem permissão: ${t.arquivo}${SEPARADOR}${t.titulo}${t.motivoSkip ? ` — motivo do skip: ${t.motivoSkip}` : ''}`);
    }
  }

  for (const p of permitidos) {
    if (executados.some((t) => t.arquivo === p.arquivo && t.titulo === p.titulo)) {
      avisos.push(`executou e pode sair da allowlist: ${p.arquivo}${SEPARADOR}${p.titulo}`);
    }
  }

  for (const arquivo of exigir) {
    const doArquivo = testes.filter((t) => t.arquivo === arquivo);
    const rodaram = doArquivo.filter((t) => t.status !== 'skipped').length;
    if (doArquivo.length === 0) erros.push(`spec exigida ausente do relatório: ${arquivo}`);
    else if (rodaram === 0) erros.push(`spec exigida não executou nenhum teste: ${arquivo} (${doArquivo.length} pulados)`);
  }

  if (executados.length === 0) erros.push('nenhum teste foi executado');

  const inesperados = testes.filter((t) => t.status === 'unexpected');
  for (const t of inesperados) erros.push(`falhou: ${t.arquivo}${SEPARADOR}${t.titulo}`);
  for (const t of testes.filter((x) => x.status === 'flaky')) avisos.push(`instável (passou na nova tentativa): ${t.arquivo}${SEPARADOR}${t.titulo}`);

  return {
    ok: erros.length === 0,
    erros,
    avisos,
    resumo: {
      total: testes.length,
      executados: executados.length,
      pulados: pulados.length,
      pulados_permitidos: pulados.filter(permitido).length,
      falharam: inesperados.length,
    },
  };
}

function lerArgs(argv) {
  const args = { relatorio: '', exigir: [], permitidos: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--exigir') args.exigir = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--permitidos') args.permitidos = argv[++i] ?? '';
    else if (!args.relatorio) args.relatorio = a;
  }
  return args;
}

function main() {
  const args = lerArgs(process.argv.slice(2));
  if (!args.relatorio) {
    console.error('Uso: falhar-se-pulado.mjs <relatorio.json> --exigir a.spec.ts,b.spec.ts [--permitidos allowlist.json]');
    return 1;
  }
  if (!existsSync(args.relatorio)) {
    console.error(`::error::Relatório do Playwright não encontrado: ${args.relatorio}. A etapa de testes não chegou a rodar.`);
    return 1;
  }
  const relatorio = JSON.parse(readFileSync(args.relatorio, 'utf8'));
  const permitidos = args.permitidos ? JSON.parse(readFileSync(args.permitidos, 'utf8')).permitidos ?? [] : [];
  const r = avaliarRelatorio(relatorio, { exigir: args.exigir, permitidos });

  for (const a of r.avisos) console.log(`::warning::${a}`);
  for (const e of r.erros) console.log(`::error::${e}`);
  const linha = `executados=${r.resumo.executados} pulados=${r.resumo.pulados} (permitidos=${r.resumo.pulados_permitidos}) falharam=${r.resumo.falharam} total=${r.resumo.total}`;
  console.log(linha);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      '### Gate de skip — security-e2e',
      '',
      `Resultado: **${r.ok ? 'aprovado' : 'reprovado'}** — ${linha}`,
      '',
      ...r.erros.map((e) => `- erro: ${e}`),
      ...r.avisos.map((a) => `- aviso: ${a}`),
      '',
    ].join('\n');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  }
  return r.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
