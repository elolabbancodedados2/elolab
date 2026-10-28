// Esteira contínua do time: uma fila de tarefas com dependências e travas de arquivo.
// Cada agente recebe a próxima tarefa do seu papel assim que entrega a anterior (mesma sessão);
// papéis sem tarefa pendente são fechados para liberar vaga. Tarefas "codex" rodam via `codex exec`.
// Uso: node scripts/time/esteira.mjs docs/time/esteira/FILA.json [--aguardar-log "<texto>"]
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const filaArq = process.argv[2];
const iAguardar = process.argv.indexOf('--aguardar-log');
const aguardarLog = iAguardar > 0 ? process.argv[iAguardar + 1] : null;
const MAX_CLAUDE = 6;
const MAX_CODEX = 3;
const TIMEOUT_TAREFA_MIN = 60;
const LOG = 'docs/time/rodadas.log';
const base = join(homedir(), '.pixel-agents');
const token = readFileSync(join(base, 'standalone-token'), 'utf8').trim();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => { const l = `${new Date().toLocaleString('pt-BR')} [esteira] ${m}`; console.log(l); appendFileSync(LOG, l + '\n'); };
const limpar = (s) => s.replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

// ── Pixel Agents ───────────────────────────────────────────────────────────
function controle() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:3100/ws?token=${encodeURIComponent(token)}`);
    let estado = null;
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.type === 'existingAgents') estado = m; });
    ws.addEventListener('error', () => reject(new Error('Pixel Agents indisponível na porta 3100')));
    ws.addEventListener('open', async () => { ws.send(JSON.stringify({ type: 'webviewReady' })); await espera(2000); resolve({ ws, estado }); });
  });
}
function terminal(id) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:3100/terminal/${id}?token=${encodeURIComponent(token)}`);
    let tela = ''; let aberto = false;
    ws.addEventListener('message', (e) => { const f = JSON.parse(e.data); if (f.data) tela += f.data; });
    ws.addEventListener('open', async () => { aberto = true; await espera(1000); resolve({ ws, tela: limpar(tela) }); });
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
  await espera(300);
  t.ws.close(1000);
  return true;
}
async function fechar(ids) {
  const { ws } = await controle();
  for (const id of ids) { ws.send(JSON.stringify({ type: 'closeAgent', id })); await espera(300); }
  await espera(800);
  ws.close(1000);
}
async function fecharTodos() {
  const { ws, estado } = await controle();
  ws.close(1000);
  await fechar((estado?.agents ?? []).filter((id) => !estado.externalAgents?.[id]));
}
async function abrir(agente) {
  const { directories } = JSON.parse(readFileSync(join(base, 'config.json'), 'utf8'));
  const d = directories.find((x) => x.path.endsWith('\\' + agente));
  if (!d) throw new Error(`sem Directory para ${agente}`);
  const { ws, estado: antes } = await controle();
  const conhecidos = new Set(antes?.agents ?? []);
  ws.send(JSON.stringify({ type: 'launchAgent', directoryPath: d.path }));
  ws.close(1000);
  for (let i = 0; i < 12; i++) {
    await espera(5000);
    const { ws: w, estado } = await controle();
    w.close(1000);
    for (const id of estado?.agents ?? []) {
      if (conhecidos.has(id) || estado.externalAgents?.[id]) continue;
      const t = await terminal(id);
      if (!t) continue;
      const ok = t.tela.includes('@' + agente);
      t.ws.close(1000);
      if (ok) return id;
    }
  }
  throw new Error(`terminal de ${agente} não apareceu`);
}
const ocupado = (tela) => /esc to interrupt|…\s*\(\d|tokens\)/.test(tela.slice(-1500));

// ── Fila ───────────────────────────────────────────────────────────────────
// Só conta como entregue quando o resumo termina com a marca (evita fechar a sessão no meio de uma tarefa longa).
const MARCA = "ESTEIRA: CONCLUIDO";
function pronta(saida) {
  if (!existsSync(saida)) return false;
  if (Date.now() - statSync(saida).mtimeMs < 20000) return false;
  return readFileSync(saida, "utf8").trimEnd().endsWith(MARCA);
}
const fila = JSON.parse(readFileSync(filaArq, 'utf8'));
const tarefas = fila.tarefas.map((t) => ({ ...t, estado: 'pendente', executor: t.executor ?? 'claude' }));
for (const t of tarefas) { t.saida ??= `docs/time/esteira/${t.id}.md`; if (pronta(t.saida)) t.estado = 'feita'; }
mkdirSync(dirname(tarefas[0].saida), { recursive: true });
const porId = Object.fromEntries(tarefas.map((t) => [t.id, t]));
const sessoes = {}; // agente -> { id, tarefa, desde, cutucadas, ultima }
const travasEmUso = () => tarefas.filter((t) => t.estado === 'rodando').flatMap((t) => t.trava ?? []);
const conflita = (t) => (t.trava ?? []).some((a) => travasEmUso().some((b) => a.startsWith(b) || b.startsWith(a)));
const liberada = (t) => t.estado === 'pendente' && (t.depois ?? []).every((d) => porId[d]?.estado === 'feita') && !conflita(t);
const apontamento = (t) => `Nova tarefa da esteira: item '${t.id}' de ${filaArq}. Siga o campo 'comum' do arquivo e a 'tarefa' do item. Ao terminar, grave o resumo em ${t.saida}; a ÚLTIMA linha do resumo deve ser exatamente "${MARCA}" (só escreva essa linha quando a tarefa estiver de fato terminada, incluindo verificações demoradas).`;

function rodarCodex(t) {
  const prompt = `Você atua como o agente definido em .claude/agents/${t.papel ?? t.agente}.md (leia e siga o papel e os limites). ${apontamento(t)} Você roda em paralelo com agentes do Claude Code no mesmo repositório.`;
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE')));
  const filho = spawn('codex', ['exec', '-C', process.cwd(), '-s', 'workspace-write', '--skip-git-repo-check', JSON.stringify(prompt)], {
    shell: process.platform === 'win32', stdio: 'ignore', windowsHide: true, env,
  });
  t.estado = 'rodando'; t.desde = Date.now();
  filho.on('exit', (code) => { log(`codex ${t.id} saiu (exit ${code})`); t.codexSaiu = true; });
  log(`codex iniciado: ${t.id}`);
}

if (aguardarLog) {
  log(`aguardando "${aguardarLog}" no log`);
  while (!readFileSync(LOG, 'utf8').includes(aguardarLog)) await espera(15000);
}
await fecharTodos();
log(`início: ${tarefas.filter((t) => t.estado !== 'feita').length} tarefas na fila`);

while (tarefas.some((t) => t.estado !== 'feita' && t.estado !== 'falhou')) {
  // 1. Conclusões
  for (const t of tarefas.filter((x) => x.estado === 'rodando')) {
    if (pronta(t.saida) || (t.executor === 'codex' && t.codexSaiu && existsSync(t.saida))) {
      t.estado = 'feita'; log(`feita: ${t.id}`);
      if (t.executor === 'claude') sessoes[t.agente].tarefa = null;
    } else if (Date.now() - t.desde > TIMEOUT_TAREFA_MIN * 60000 || (t.executor === 'codex' && t.codexSaiu)) {
      t.estado = 'falhou'; log(`FALHOU (sem resumo): ${t.id}`);
      if (t.executor === 'claude') sessoes[t.agente].tarefa = null;
    }
  }
  // 2. Sessões livres: próxima tarefa do mesmo papel, ou fecha
  for (const [agente, s] of Object.entries(sessoes)) {
    if (s.tarefa) continue;
    const prox = tarefas.find((t) => t.executor === 'claude' && t.agente === agente && liberada(t));
    if (prox) {
      await enviar(s.id, apontamento(prox));
      Object.assign(prox, { estado: 'rodando', desde: Date.now() });
      Object.assign(s, { tarefa: prox.id, cutucadas: 0, ultima: 0 });
      log(`enviada (mesma sessão): ${prox.id} -> ${agente}`);
    } else if (!tarefas.some((t) => t.executor === 'claude' && t.agente === agente && t.estado === 'pendente')) {
      await fechar([s.id]); delete sessoes[agente]; log(`sessão fechada: ${agente}`);
    }
  }
  // 3. Novas sessões e Codex dentro do limite
  for (const t of tarefas.filter(liberada)) {
    if (t.executor === 'codex') {
      if (tarefas.filter((x) => x.executor === 'codex' && x.estado === 'rodando').length < MAX_CODEX) rodarCodex(t);
      continue;
    }
    if (sessoes[t.agente] || Object.keys(sessoes).length >= MAX_CLAUDE) continue;
    try {
      const id = await abrir(t.agente);
      sessoes[t.agente] = { id, tarefa: t.id, cutucadas: 0, ultima: 0 };
      await espera(3000);
      await enviar(id, apontamento(t));
      Object.assign(t, { estado: 'rodando', desde: Date.now() });
      log(`enviada: ${t.id} -> ${t.agente} (agente ${id})`);
    } catch (e) { log(`erro ao abrir ${t.agente}: ${e.message}`); }
  }
  // 4. Lembrete a quem parou sem entregar
  for (const [agente, s] of Object.entries(sessoes)) {
    const t = s.tarefa && porId[s.tarefa];
    if (!t || existsSync(t.saida) || s.cutucadas >= 3) continue;
    if (Date.now() - t.desde < 3 * 60000 || Date.now() - s.ultima < 120000) continue;
    const tela = await terminal(s.id);
    if (!tela) continue;
    const parado = !ocupado(tela.tela);
    tela.ws.close(1000);
    if (parado) {
      s.cutucadas++; s.ultima = Date.now();
      await enviar(s.id, `Lembrete da esteira: não há decisão do responsável disponível agora. Registre pendências, siga com o possível e grave ${t.saida}.`);
      log(`lembrete ${s.cutucadas} -> ${agente} (${t.id})`);
    }
  }
  await espera(15000);
}
await fecharTodos();
const falhas = tarefas.filter((t) => t.estado === 'falhou').map((t) => t.id);
log(`esteira concluída. ${falhas.length ? 'Sem resumo: ' + falhas.join(', ') : 'Todas as tarefas entregaram resumo.'}`);
