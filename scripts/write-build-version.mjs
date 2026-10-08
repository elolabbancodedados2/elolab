#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const dist = resolve('dist');
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name !== 'version.json') files.push(path);
  }
}

await walk(dist);
files.sort();
const hash = createHash('sha256');
for (const path of files) {
  hash.update(relative(dist, path).replaceAll('\\', '/'));
  hash.update(await readFile(path));
}

const version = {
  build_id: process.env.APP_BUILD_ID || hash.digest('hex'),
  built_at: new Date().toISOString(),
};
await writeFile(join(dist, 'version.json'), `${JSON.stringify(version, null, 2)}\n`, 'utf8');
process.stdout.write(`Build EloLab: ${version.build_id.slice(0, 16)}\n`);
