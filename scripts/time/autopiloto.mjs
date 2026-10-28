// Piloto automático: planeja a próxima fila e roda a esteira, em ciclo, até não haver trabalho local.
// O planejamento é uma tarefa do tech-lead que grava docs/time/esteira/FILA-<n>.json no formato das filas anteriores.
// Uso: node scripts/time/autopiloto.mjs <n-inicial> [--max-ciclos 8]
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const inicial = Number(process.argv[2] ?? 3);
const iMax = process.argv.indexOf('--max-ciclos');
const maxCiclos = iMax > 0 ? Number(process.argv[iMax + 1]) : 8;
const LOG = 'docs/time/rodadas.log';
const log = (m) => { const l = `${new Date().toLocaleString('pt-BR')} [autopiloto] ${m}`; console.log(l); appendFileSync(LOG, l + '\n'); };
const esteira = (fila) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['scripts/time/esteira.mjs', fila], { stdio: 'inherit' });
  p.on('exit', resolve);
});

for (let n = inicial; n < inicial + maxCiclos; n++) {
  const fila = `docs/time/esteira/FILA-${n}.json`;
  if (!existsSync(fila)) {
    const plano = `docs/time/esteira/PLANO-${n}.json`;
    writeFileSync(plano, JSON.stringify({
      comum: "Worktree: C:\\Users\\lopes\\orca\\workspaces\\elolab\\time-estabilizacao. Não implemente nada nesta tarefa: só planeje. A ÚLTIMA linha do resumo deve ser exatamente 'ESTEIRA: CONCLUIDO'.",
      tarefas: [{
        id: `P${n}-planejar`, agente: 'tech-lead', trava: [fila],
        tarefa: `Planeje a próxima fila da esteira e grave ${fila}, no MESMO formato de docs/time/esteira/FILA-2.json (campo 'comum' igual ao da FILA-2, e 'tarefas' com id, agente, tarefa, trava, depois; para Codex use executor 'codex' e papel). Fontes: o consolidado mais recente em docs/time/esteira/ (F08 ou o último *-consolidado.md), docs/produto/backlog/README.md, docs/estrategia/DIAGNOSTICO_16_FUNCOES.md (roadmap e gates) e docs/time/GATES.md. Regras: até 12 tarefas de trabalho, executáveis localmente SEM decisão do responsável, priorizando por gates (estabilização e usabilidade antes de diferenciação); agentes = nomes de .claude/agents (sem repetir o mesmo agente em tarefas que poderiam rodar em paralelo, porque cada papel faz uma por vez); travas por arquivo ou pasta para evitar conflito; use Codex (até 3) para tarefas de código que não exijam rodar Vitest no sandbox dele, e deixe a execução dos testes dessas tarefas para um agente Claude; termine sempre com a verificação completa (tech-lead) dependente de todas e o consolidado (clinical-quality-director) dependente da verificação, como em FILA-2. Se não houver mais trabalho local útil, grave {"comum":"","tarefas":[]}. Valide o JSON com node antes de terminar. O resumo de planejamento lista as tarefas escolhidas e o que ficou de fora por depender do responsável.`,
      }],
    }, null, 2));
    log(`planejando ciclo ${n}`);
    await esteira(plano);
  }
  if (!existsSync(fila)) { log(`fila ${fila} não foi gerada; parando`); break; }
  let dados;
  try { dados = JSON.parse(readFileSync(fila, 'utf8')); } catch { log(`fila ${fila} inválida; parando`); break; }
  if (!dados.tarefas?.length) { log('planejador indicou que não há mais trabalho local; fim'); break; }
  log(`ciclo ${n}: ${dados.tarefas.length} tarefas`);
  await esteira(fila);
}
log('autopiloto encerrado');
