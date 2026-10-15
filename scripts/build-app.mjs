#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'vite';

function resolveBuildId() {
  const configured = process.env.APP_BUILD_ID || process.env.VITE_APP_BUILD_ID;
  if (configured) return configured;

  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const changes = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
    if (!changes) return commit;

    const timestamp = new Date().toISOString().replaceAll(/[-:.]/g, '');
    return `${commit}-dirty-${timestamp}`;
  } catch {
    return `local-${new Date().toISOString().replaceAll(/[-:.]/g, '')}`;
  }
}

const buildId = resolveBuildId();
process.env.APP_BUILD_ID = buildId;
process.env.VITE_APP_BUILD_ID = buildId;

await build({ mode: 'production' });
await import('./write-build-version.mjs');

const version = JSON.parse(await readFile(resolve('dist/version.json'), 'utf8'));
if (version.build_id !== buildId) {
  throw new Error(`Build ID divergente: version.json=${version.build_id}, bundle=${buildId}`);
}

async function javascriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(path));
    else if (entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

const bundles = await javascriptFiles(resolve('dist'));
const embedded = await Promise.all(bundles.map(async path => (await readFile(path, 'utf8')).includes(buildId)));
if (!embedded.some(Boolean)) {
  throw new Error(`Build ID ${buildId} não foi encontrado nos bundles JavaScript.`);
}

process.stdout.write(`Release verificado: ${buildId}\n`);
