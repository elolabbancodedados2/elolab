/**
 * Procura escrita no banco seguida de aviso de sucesso SEM checagem de erro.
 *
 * O supabase-js NAO lança em erro de API: devolve { data, error }. Um await sem
 * checar o error faz a tela dizer "salvo!" quando nada foi salvo. Esse padrão
 * causou, entre outros, o laudo que dizia "paciente notificado" sem notificar e
 * a edição de permissões que deixava a conta sem nenhum acesso.
 */
import fs from 'fs';
import path from 'path';

const arquivos = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name).split(path.sep).join('/');
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !/__tests__|\.test\./.test(p)) arquivos.push(p);
  }
})('src');

const achados = [];
for (const f of arquivos) {
  const linhas = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const escreve = /await\s+\(?supabase/.test(linhas[i]) &&
                    /\.(insert|update|delete|upsert)\(/.test(linhas[i]);
    if (!escreve) continue;
    if (/const\s*\{/.test(linhas[i])) continue;
    if (/return\s+/.test(linhas[i])) continue;
    if (/await must\(/.test(linhas[i])) continue;

    const janela = linhas.slice(i + 1, i + 9).join('\n');
    if (/toast\.success/.test(janela)) {
      achados.push({ f, linha: i + 1, trecho: linhas[i].trim() });
    }
  }
}

const porArquivo = new Map();
for (const a of achados) {
  if (!porArquivo.has(a.f)) porArquivo.set(a.f, []);
  porArquivo.get(a.f).push(a);
}

console.log(`${achados.length} caso(s) em ${porArquivo.size} arquivo(s):\n`);
for (const [f, lista] of porArquivo) {
  console.log(`${f}`);
  for (const a of lista) console.log(`   ${a.linha}: ${a.trecho.slice(0, 110)}`);
}

if (achados.length) process.exit(1);
