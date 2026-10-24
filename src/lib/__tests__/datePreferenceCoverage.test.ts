import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Telas devem formatar datas numéricas curtas pela preferência do usuário
// (formatWithDatePreference / formatDate 'short'). PDFs e planilhas em src/lib
// mantêm o formato documental e ficam fora desta verificação.
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap(nome => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : arquivos(caminho);
    return /\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome) ? [caminho] : [];
  });
}

describe('cobertura da preferência de formato de data', () => {
  it('nenhuma tela formata data numérica curta ignorando a preferência', () => {
    const violacoes = [...arquivos('src/pages'), ...arquivos('src/components')].flatMap(arquivo => {
      const fonte = readFileSync(arquivo, 'utf8');
      const dateFnsFormat = /import\s*\{[^}]*\bformat\b[^}]*\}\s*from\s*'date-fns'/.test(fonte) && /\bformat\([^;\n]*?'dd\/MM/.test(fonte);
      const localeCurto = /toLocaleDateString\('pt-BR'(\)|,\s*\{\s*timeZone:[^}]*\}\))/.test(fonte);
      return dateFnsFormat || localeCurto ? [arquivo.replace(/\\/g, '/')] : [];
    });
    expect(violacoes).toEqual([]);
  });
});
