import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src');
const generatedTypesPath = path.join(sourceRoot, 'integrations/supabase/types.ts');

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)
      ? [entryPath]
      : [];
  });
}

describe('destructive RPC client surface', () => {
  it('does not expose the legacy app-wide delete RPC in generated client types', () => {
    const generatedTypes = readFileSync(generatedTypesPath, 'utf8');
    expect(generatedTypes).not.toMatch(/^\s*delete_all_app_data\s*:/m);
  });

  it('does not call the legacy app-wide delete RPC from application code', () => {
    const directCall = /\.rpc\s*\(\s*['"]delete_all_app_data['"]/;
    const references = listSourceFiles(sourceRoot)
      .filter(file => directCall.test(readFileSync(file, 'utf8')))
      .map(file => path.relative(sourceRoot, file));

    expect(references).toEqual([]);
  });
});
