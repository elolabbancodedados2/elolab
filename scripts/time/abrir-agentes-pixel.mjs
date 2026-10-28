// Abre no Pixel Agents (porta 3100) um terminal do Claude Code para cada agente do time.
// Uso: node scripts/time/abrir-agentes-pixel.mjs [nome-do-agente ...]
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const base = join(homedir(), '.pixel-agents');
const token = readFileSync(join(base, 'standalone-token'), 'utf8').trim();
const { directories } = JSON.parse(readFileSync(join(base, 'config.json'), 'utf8'));
const filtro = process.argv.slice(2);
const sep = '\\';
const alvos = directories.filter((d) => d.path.includes(`${sep}.time${sep}`) &&
  (filtro.length === 0 || filtro.some((f) => d.path.endsWith(sep + f))));

const ws = new WebSocket(`ws://127.0.0.1:3100/ws?token=${encodeURIComponent(token)}`);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
ws.addEventListener('error', () => { console.error('Não foi possível conectar ao Pixel Agents na porta 3100.'); process.exit(1); });
ws.addEventListener('open', async () => {
  // O servidor só associa o cliente ao runtime depois do handshake da interface.
  ws.send(JSON.stringify({ type: 'webviewReady' }));
  await espera(3000);
  for (const d of alvos) {
    ws.send(JSON.stringify({ type: 'launchAgent', directoryPath: d.path }));
    console.log(`aberto: ${d.name}`);
    await espera(2500);
  }
  await espera(1000);
  ws.close();
});
