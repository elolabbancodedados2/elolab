// Lê a tela ou envia texto ao terminal de um agente aberto no Pixel Agents (porta 3100).
// Uso: node scripts/time/terminal-agente.mjs <agentId> [texto a enviar] [--enter]
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [agentId, texto, flag] = process.argv.slice(2);
const token = readFileSync(join(homedir(), '.pixel-agents', 'standalone-token'), 'utf8').trim();
const ws = new WebSocket(`ws://127.0.0.1:3100/terminal/${agentId}?token=${encodeURIComponent(token)}`);
const limpar = (s) => s.replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r/g, '');
let tela = '';
ws.addEventListener('message', (e) => {
  const f = JSON.parse(e.data);
  if (f.type === 'replay' || f.type === 'output') tela += f.data;
  if (f.type === 'exit') console.log('[sessão encerrada]');
});
ws.addEventListener('close', (e) => { if (e.code !== 1000 && e.code !== 1005) console.error('fechado:', e.code, e.reason); });
ws.addEventListener('open', async () => {
  await new Promise((r) => setTimeout(r, 1500));
  if (texto) {
    ws.send(JSON.stringify({ type: 'input', data: texto }));
    if (flag === '--enter') {
      await new Promise((r) => setTimeout(r, 400));
      ws.send(JSON.stringify({ type: 'input', data: '\r' }));
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  const linhas = limpar(tela).split('\n').map((l) => l.trimEnd()).filter(Boolean);
  console.log(linhas.slice(-25).join('\n'));
  ws.close(1000);
});
