// Envia a tarefa de cada agente (docs/time/rodada-1/TAREFAS.json) ao terminal dele no Pixel Agents.
// Descobre o id de cada agente lendo o cabeçalho "@<agente>" dos terminais abertos.
// Uso: node scripts/time/orquestrar.mjs [arquivo-de-tarefas] [--ids-ate 40]
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const arquivo = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'docs/time/rodada-1/TAREFAS.json';
const { tarefas } = JSON.parse(readFileSync(arquivo, 'utf8'));
const token = readFileSync(join(homedir(), '.pixel-agents', 'standalone-token'), 'utf8').trim();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const limpar = (s) => s.replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

function abrir(id) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:3100/terminal/${id}?token=${encodeURIComponent(token)}`);
    let tela = '';
    let pronto = false;
    ws.addEventListener('message', (e) => {
      const f = JSON.parse(e.data);
      if (f.type === 'replay' || f.type === 'output') tela += f.data;
    });
    ws.addEventListener('open', async () => { pronto = true; await espera(1200); resolve({ ws, tela: limpar(tela) }); });
    ws.addEventListener('close', () => { if (!pronto) resolve(null); });
    ws.addEventListener('error', () => {});
  });
}

const limite = Number(process.argv[process.argv.indexOf('--ids-ate') + 1]) || 40;
const ids = {};
for (let id = 1; id <= limite; id++) {
  const t = await abrir(id);
  if (!t) continue;
  const m = t.tela.match(/@([a-z-]+)/);
  if (m && tarefas[m[1]] && !ids[m[1]]) ids[m[1]] = { id, ws: t.ws };
  else t.ws.close(1000);
}

for (const agente of Object.keys(tarefas)) {
  const alvo = ids[agente];
  if (!alvo) { console.log(`SEM TERMINAL: ${agente}`); continue; }
  // Textos longos colados no terminal podem chegar cortados; envie só o apontamento para o arquivo.
  const texto = `Sua tarefa está em ${arquivo}: siga o campo 'comum' (troque {agente} por ${agente}) e execute a tarefa da chave '${agente}'.`;
  alvo.ws.send(JSON.stringify({ type: 'input', data: texto }));
  await espera(600);
  alvo.ws.send(JSON.stringify({ type: 'input', data: '\r' }));
  await espera(400);
  alvo.ws.close(1000);
  console.log(`enviado: ${agente} (agente ${alvo.id})`);
}
