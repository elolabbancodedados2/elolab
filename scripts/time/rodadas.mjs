// Executa um plano de levas em sequência no Pixel Agents (porta 3100):
// fecha os agentes abertos, abre os da leva, entrega a tarefa, espera os resumos e segue.
// Uso: node scripts/time/rodadas.mjs docs/time/rodada-N/PLANO.json
// Formato do plano: [{ "aguardar": ["arquivo", ...] } | { "tarefas": "arquivo.json", "saidas": ["arquivo", ...] }]
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const planoArq = process.argv[2];
const plano = JSON.parse(readFileSync(planoArq, 'utf8'));
const base = join(homedir(), '.pixel-agents');
const token = readFileSync(join(base, 'standalone-token'), 'utf8').trim();
const LOG = 'docs/time/rodadas.log';
const TIMEOUT_LEVA_MIN = 120;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => { const l = `${new Date().toLocaleString('pt-BR')} ${m}`; console.log(l); appendFileSync(LOG, l + '\n'); };
const limpar = (s) => s.replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

function controle() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:3100/ws?token=${encodeURIComponent(token)}`);
    let estado = null;
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'existingAgents') estado = m;
    });
    ws.addEventListener('error', () => reject(new Error('Pixel Agents indisponível na porta 3100')));
    ws.addEventListener('open', async () => {
      ws.send(JSON.stringify({ type: 'webviewReady' }));
      await espera(2500);
      resolve({ ws, estado });
    });
  });
}

function terminal(id) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:3100/terminal/${id}?token=${encodeURIComponent(token)}`);
    let tela = '';
    let aberto = false;
    ws.addEventListener('message', (e) => { const f = JSON.parse(e.data); if (f.data) tela += f.data; });
    ws.addEventListener('open', async () => { aberto = true; await espera(1200); resolve({ ws, tela: limpar(tela) }); });
    ws.addEventListener('close', () => { if (!aberto) resolve(null); });
    ws.addEventListener('error', () => {});
  });
}

async function enviar(id, texto) {
  const t = await terminal(id);
  if (!t) return false;
  t.ws.send(JSON.stringify({ type: 'input', data: texto }));
  await espera(600);
  t.ws.send(JSON.stringify({ type: 'input', data: '\r' }));
  await espera(400);
  t.ws.close(1000);
  return true;
}

async function fecharTodos() {
  const { ws, estado } = await controle();
  const externos = estado?.externalAgents ?? {};
  for (const id of estado?.agents ?? []) {
    if (externos[id]) continue;
    ws.send(JSON.stringify({ type: 'closeAgent', id }));
    await espera(400);
  }
  await espera(1500);
  ws.close(1000);
}

async function abrirLeva(agentes) {
  const { directories } = JSON.parse(readFileSync(join(base, 'config.json'), 'utf8'));
  const { ws } = await controle();
  for (const a of agentes) {
    const d = directories.find((x) => x.path.endsWith('\\' + a));
    if (!d) { log(`sem Directory para ${a}`); continue; }
    ws.send(JSON.stringify({ type: 'launchAgent', directoryPath: d.path }));
    await espera(2500);
  }
  await espera(15000);
  const { estado } = await controle();
  ws.close(1000);
  const ids = {};
  for (const id of estado?.agents ?? []) {
    if (estado.externalAgents?.[id]) continue;
    const t = await terminal(id);
    if (!t) continue;
    const m = t.tela.match(/@([a-z-]+)/);
    t.ws.close(1000);
    if (m && agentes.includes(m[1])) ids[m[1]] = id;
  }
  return ids;
}

const ocupado = (tela) => /esc to interrupt|…\s*\(\d|tokens\)/.test(tela.slice(-1500));

// Tarefa com "executor": "codex" roda via `codex exec` (não aparece no escritório do Pixel Agents).
// O papel vem de .claude/agents/<papel>.md; o resumo é gravado pelo próprio Codex como nos agentes Claude.
function rodarCodex(nome, papel, arquivoTarefas) {
  const prompt = [
    `Você atua como o agente definido em .claude/agents/${papel}.md (leia o arquivo e siga o papel e os limites dele).`,
    `Sua tarefa está em ${arquivoTarefas}: siga o campo 'comum' (troque {agente} por ${nome}) e execute a tarefa da chave '${nome}'.`,
    'Você roda em paralelo com agentes do Claude Code no mesmo repositório.',
  ].join(' ');
  // Sem as variáveis de uma sessão do Claude Code que tenha iniciado o orquestrador.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE')));
  const filho = spawn('codex', ['exec', '-C', process.cwd(), '-s', 'workspace-write', '--skip-git-repo-check', JSON.stringify(prompt)], {
    shell: process.platform === 'win32', stdio: 'ignore', windowsHide: true, env,
  });
  filho.on('exit', (code) => log(`codex ${nome} terminou (exit ${code})`));
  log(`codex iniciado: ${nome} (papel ${papel})`);
}

async function executarLeva(passo) {
  const { tarefas } = JSON.parse(readFileSync(passo.tarefas, 'utf8'));
  const codex = Object.entries(tarefas).filter(([, t]) => typeof t === 'object' && t.executor === 'codex');
  const agentes = Object.keys(tarefas).filter((a) => !codex.some(([c]) => c === a));
  await fecharTodos();
  for (const [nome, t] of codex) rodarCodex(nome, t.papel ?? nome, passo.tarefas);
  log(`leva ${passo.tarefas}: abrindo ${agentes.join(', ') || '(só codex)'}`);
  const ids = agentes.length ? await abrirLeva(agentes) : {};
  for (const a of agentes) {
    if (!ids[a]) { log(`AVISO: terminal de ${a} não encontrado`); continue; }
    await enviar(ids[a], `Sua tarefa está em ${passo.tarefas}: siga o campo 'comum' (troque {agente} por ${a}) e execute a tarefa da chave '${a}'.`);
    log(`tarefa enviada: ${a} (agente ${ids[a]})`);
  }
  await aguardar(passo.saidas, ids);
}

// Uma saída "arquivo::MARCA" só conta quando o arquivo contém MARCA. Em todos os casos o arquivo
// precisa estar 40 s sem mudar, porque agentes gravam resumos longos em partes.
function pronta(saida) {
  const [arquivo, marca] = saida.split('::');
  if (!existsSync(arquivo)) return false;
  if (Date.now() - statSync(arquivo).mtimeMs < 40000) return false;
  return !marca || readFileSync(arquivo, 'utf8').includes(marca);
}

async function aguardar(saidasBrutas, ids = {}) {
  const saidas = saidasBrutas;
  const inicio = Date.now();
  const cutucadas = {};
  const ultimaCutucada = {};
  const existsSyncSaida = (s) => existsSync(s.split('::')[0]);
  while (saidas.some((s) => !pronta(s))) {
    if (Date.now() - inicio > TIMEOUT_LEVA_MIN * 60000) { log(`TIMEOUT: faltaram ${saidas.filter((s) => !pronta(s)).join(', ')}`); return; }
    await espera(20000);
    // Agente parado sem resumo: lembra de concluir (no máximo 3 vezes).
    for (const [a, id] of Object.entries(ids)) {
      const saida = saidas.find((s) => s.includes(a));
      if (!saida || pronta(saida) || existsSyncSaida(saida) || (cutucadas[a] ?? 0) >= 3) continue;
      const t = await terminal(id);
      if (!t) continue;
      const parado = !ocupado(t.tela);
      t.ws.close(1000);
      if (parado && Date.now() - inicio > 3 * 60000 && Date.now() - (ultimaCutucada[a] ?? 0) > 120000) {
        ultimaCutucada[a] = Date.now();
        cutucadas[a] = (cutucadas[a] ?? 0) + 1;
        await enviar(id, `Lembrete do orquestrador: não há decisão do responsável disponível agora. Registre pendências e siga com o que for possível; ao terminar, grave ${saida.split('::')[0]}.`);
        log(`lembrete enviado a ${a} (${cutucadas[a]})`);
      }
    }
  }
  log(`concluído: ${saidas.map((s) => s.split('::')[0]).join(', ')}`);
}

for (const passo of plano) {
  if (passo.aguardar) { log(`aguardando ${passo.aguardar.length} arquivos`); await aguardar(passo.aguardar); }
  else await executarLeva(passo);
}
await fecharTodos();
log(`plano ${planoArq} concluído`);
