#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const baseURL = process.env.QA_BASE_URL?.replace(/\/$/, '');
const fail = (message) => {
  process.stderr.write(`QA não iniciado: ${message}\n`);
  process.exit(1);
};

if (!baseURL) fail('informe QA_BASE_URL com o endereço que já recebeu o deploy.');
let target;
try { target = new URL(baseURL); } catch { fail('QA_BASE_URL não é um endereço válido.'); }
if (!['https:', 'http:'].includes(target.protocol)) fail('QA_BASE_URL precisa usar HTTP ou HTTPS.');

const localHosts = new Set(['localhost', '127.0.0.1']);
if (!localHosts.has(target.hostname) && process.env.QA_ALLOW_REMOTE !== '1') {
  fail('para testar um ambiente remoto, defina QA_ALLOW_REMOTE=1.');
}
if (target.hostname === 'app.elolab.com.br' && process.env.QA_ALLOW_PRODUCTION !== '1') {
  fail('para testar produção, defina QA_ALLOW_PRODUCTION=1 depois de confirmar o deploy.');
}

if (process.env.QA_DEDICATED_CLINIC !== '1') {
  fail('use uma clínica vazia e exclusiva para QA e confirme isso com QA_DEDICATED_CLINIC=1.');
}

const requiredAccounts = ['ADMIN', 'MEDICO', 'RECEPCAO', 'ENFERMAGEM', 'FINANCEIRO'];
const missing = requiredAccounts.flatMap((role) =>
  ['EMAIL', 'SENHA'].filter((suffix) => !process.env[`E2E_${role}_${suffix}`])
    .map((suffix) => `E2E_${role}_${suffix}`),
);
if (missing.length) fail(`faltam contas de teste para cobrir todos os perfis: ${missing.join(', ')}.`);

let localVersion;
try {
  localVersion = JSON.parse(await readFile(resolve('dist/version.json'), 'utf8'));
} catch {
  fail('rode npm run build para gerar dist/version.json antes do QA.');
}

let deployedVersion;
try {
  const response = await fetch(`${baseURL}/version.json`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) fail(`a versão publicada respondeu HTTP ${response.status}.`);
  deployedVersion = await response.json();
} catch (error) {
  fail(`não consegui conferir a versão publicada (${error instanceof Error ? error.message : 'falha de rede'}).`);
}

if (!localVersion.build_id || deployedVersion.build_id !== localVersion.build_id) {
  fail('o app publicado não corresponde ao build local atual. Publique esta versão antes de testar.');
}

process.stdout.write(`Versão confirmada: ${localVersion.build_id.slice(0, 16)}\n`);
process.stdout.write('Clínica de QA confirmada. Rodando navegador real e verificações dos cinco perfis.\n');

const cli = resolve('node_modules/@playwright/test/cli.js');
const specs = [
  'tests/producao-smoke.spec.ts',
  'tests/qa-real-user.spec.ts',
  'tests/navigation.spec.ts',
  'tests/modulos.spec.ts',
  'tests/perfis-rbac.spec.ts',
];
const result = spawnSync(process.execPath, [cli, 'test', ...specs, '--workers=1'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    QA_BASE_URL: baseURL,
    PRODUCAO_URL: baseURL,
    QA_EXPECTED_BUILD_ID: localVersion.build_id,
  },
});

if (result.error) fail(`não consegui iniciar o Playwright: ${result.error.message}`);
process.exit(result.status ?? 1);
