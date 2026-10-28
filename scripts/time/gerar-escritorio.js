// Gera ~/.pixel-agents/layout.json com o escritório do time EloLab e as áreas por sala.
const fs = require('fs');
const path = require('path');

const COLS = 44, ROWS = 28, VOID = 255, WALL = 0;
const tiles = Array(COLS * ROWS).fill(VOID);
const tileColors = Array(COLS * ROWS).fill(null);
const areaTiles = Array(COLS * ROWS).fill(null);
const furniture = [];
let uid = 0;
const idx = (c, r) => r * COLS + c;

const COR_PAREDE = { h: 214, s: 30, b: -100, c: -55 };
const PISOS = {
  madeira: [7, { h: 25, s: 48, b: -43, c: -88 }],
  azul: [1, { h: 209, s: 39, b: -25, c: -80 }],
  cinza: [9, { h: 209, s: 0, b: -16, c: -8 }],
  verde: [1, { h: 150, s: 25, b: -30, c: -80 }],
  areia: [8, { h: 35, s: 30, b: 15, c: 0 }],
  vinho: [7, { h: 350, s: 30, b: -45, c: -85 }],
};

function floor(c1, r1, c2, r2, piso, area) {
  const [t, cor] = PISOS[piso];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    tiles[idx(c, r)] = t; tileColors[idx(c, r)] = cor; areaTiles[idx(c, r)] = area ?? null;
  }
}
function wall(c1, r1, c2, r2) {
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    tiles[idx(c, r)] = WALL; tileColors[idx(c, r)] = COR_PAREDE; areaTiles[idx(c, r)] = null;
  }
}
const put = (type, col, row, extra = {}) => furniture.push({ uid: `elolab-${++uid}`, type, col, row, ...extra });

// Estação de trabalho: mesa 3x2, monitor no meio, banco abaixo (agente de costas, olhando o monitor).
function estacao(col, row, pc = 'PC_FRONT_ON_1') {
  put('DESK_FRONT', col, row);
  put(pc, col + 1, row);
  put('CUSHIONED_BENCH', col + 1, row + 2);
}
// Estação virada para a frente: banco acima, mesa abaixo.
function estacaoFrente(col, row) {
  put('CUSHIONED_BENCH', col + 1, row);
  put('DESK_FRONT', col, row + 1);
  put('PC_BACK', col + 1, row + 1);
}

// ── Estrutura ──────────────────────────────────────────────────────────────
wall(0, 1, COLS - 1, 1);            // parede norte
wall(0, 1, 0, 26); wall(COLS - 1, 1, COLS - 1, 26);
wall(0, 26, COLS - 1, 26);          // parede sul
wall(0, 12, COLS - 1, 12);          // salas de cima | corredor
wall(0, 16, COLS - 1, 16);          // corredor | salas de baixo
for (const c of [13, 22, 31]) wall(c, 1, c, 12);
for (const c of [15, 30, 37]) wall(c, 16, c, 26);

// Salas (piso + área)
const SALAS = [
  ['Produto', 1, 2, 12, 11, 'madeira', '#c8a26b'],
  ['Design e UX', 14, 2, 21, 11, 'verde', '#7fb59a'],
  ['Arquitetura', 23, 2, 30, 11, 'azul', '#6b8fc8'],
  ['Diretoria', 32, 2, 42, 11, 'vinho', '#b06b7a'],
  ['Engenharia', 1, 17, 14, 25, 'azul', '#5a7fb8'],
  ['Qualidade e Seguranca', 16, 17, 29, 25, 'cinza', '#9aa3ad'],
  ['Comercial', 31, 17, 36, 25, 'areia', '#d9b36c'],
  ['Copa', 38, 17, 42, 25, 'madeira', '#a8845a'],
];
for (const [label, c1, r1, c2, r2, piso] of SALAS) floor(c1, r1, c2, r2, piso, label);
floor(1, 13, 42, 15, 'cinza', null); // corredor

// Portas
for (const c of [6, 7, 17, 26, 36, 37]) floor(c, 12, c, 12, 'cinza', null);
for (const c of [12, 13, 27, 28, 33, 40]) floor(c, 16, c, 16, 'cinza', null);

// ── Produto: PM, PO, BA, Especialista de Saúde ───────────────────────────
estacao(2, 3); estacao(6, 3); estacao(10, 3);
estacao(2, 7, 'PC_FRONT_ON_2');
put('SMALL_TABLE_FRONT', 8, 8); put('WOODEN_BENCH', 7, 9); put('WOODEN_BENCH', 10, 9);
put('DOUBLE_BOOKSHELF', 2, 0); put('CLOCK', 6, 0); put('DOUBLE_BOOKSHELF', 9, 0);
put('PLANT', 12, 10);

// ── Design e UX: UX Researcher, Product Designer ─────────────────────────
estacao(14, 3, 'PC_FRONT_ON_2'); estacao(18, 3, 'PC_FRONT_ON_3');
put('WHITEBOARD', 15, 0); put('SMALL_PAINTING', 19, 0); put('HANGING_PLANT', 21, 0);
put('SMALL_TABLE_FRONT', 16, 8); put('WOODEN_BENCH', 15, 9); put('WOODEN_BENCH', 18, 9);
put('CACTUS', 21, 10);

// ── Arquitetura: Software Architect, Tech Lead ───────────────────────────
estacao(23, 3); estacao(27, 3, 'PC_FRONT_ON_3');
put('WHITEBOARD', 24, 0); put('WHITEBOARD', 28, 0);
put('SMALL_TABLE_FRONT', 25, 8); put('WOODEN_BENCH', 24, 9); put('WOODEN_BENCH', 27, 9);
put('PLANT_2', 30, 10);

// ── Diretoria: Quality Director + sala de reunião ────────────────────────
estacao(33, 3, 'PC_FRONT_ON_2');
put('TABLE_FRONT', 37, 6);
put('WOODEN_CHAIR_SIDE', 36, 6); put('WOODEN_CHAIR_SIDE', 36, 8);
put('WOODEN_CHAIR_SIDE:left', 40, 6); put('WOODEN_CHAIR_SIDE:left', 40, 8);
put('LARGE_PAINTING', 34, 0); put('SMALL_PAINTING_2', 38, 0); put('HANGING_PLANT', 41, 0);
put('LARGE_PLANT', 32, 8);

// ── Engenharia: Frontend, Backend, Database (+ 3 mesas extras) ────────────
estacao(1, 18); estacao(5, 18, 'PC_FRONT_ON_2'); estacao(9, 18, 'PC_FRONT_ON_3');
estacao(1, 22, 'PC_FRONT_OFF'); estacao(5, 22, 'PC_FRONT_OFF'); estacao(9, 22, 'PC_FRONT_OFF');
put('PLANT', 13, 18); put('BIN', 14, 25);

// ── Qualidade e Segurança: QA, Security, DevOps/SRE ──────────────────────
estacao(16, 18); estacao(20, 18, 'PC_FRONT_ON_2'); estacao(24, 18, 'PC_FRONT_ON_3');
put('SMALL_TABLE_FRONT', 18, 22); put('WOODEN_BENCH', 17, 23); put('WOODEN_BENCH', 20, 23);
put('DOUBLE_BOOKSHELF', 24, 22); put('LARGE_PLANT', 27, 22); put('BIN', 29, 25);

// ── Comercial: Growth, Sales/CS ──────────────────────────────────────────
estacaoFrente(31, 18); estacaoFrente(34, 18);
// As mesas ocupam a largura toda nas linhas 19-20; abaixo delas só decoração, sem assentos inalcançáveis.
put('PLANT_2', 31, 23); put('LARGE_PLANT', 34, 22);

// ── Copa ─────────────────────────────────────────────────────────────────
put('SOFA_FRONT', 39, 19); put('COFFEE_TABLE', 39, 20); put('SOFA_BACK', 39, 22);
put('SOFA_SIDE', 38, 20); put('SOFA_SIDE:left', 41, 20);
put('COFFEE', 39, 21); put('PLANT', 42, 17); put('POT', 38, 25);

// ── Corredor ─────────────────────────────────────────────────────────────
put('PLANT', 1, 13); put('PLANT_2', 21, 13); put('PLANT', 42, 13);

const areas = SALAS.map(([label, , , , , , color]) => ({ label, color }));
const destino = path.join(process.env.USERPROFILE, '.pixel-agents', 'layout.json');
const atual = JSON.parse(fs.readFileSync(destino, 'utf8'));
const layout = {
  version: 1, cols: COLS, rows: ROWS, layoutRevision: atual.layoutRevision ?? 1,
  tiles, tileColors, furniture, pets: atual.pets ?? [], areas, areaTiles,
};
fs.writeFileSync(destino, JSON.stringify(layout));

// Directory → sala
const MAPA = {
  '01 Product Manager': 'Produto', '02 Product Owner': 'Produto', '03 Business Analyst': 'Produto',
  '14 Especialista Saude': 'Produto',
  '06 UX Researcher': 'Design e UX', '07 Product Designer': 'Design e UX',
  '04 Software Architect': 'Arquitetura', '05 Tech Lead': 'Arquitetura',
  '17 Quality Director': 'Diretoria',
  '08 Frontend': 'Engenharia', '09 Backend': 'Engenharia', '10 Database': 'Engenharia',
  '11 QA': 'Qualidade e Seguranca', '12 Security': 'Qualidade e Seguranca', '13 DevOps SRE': 'Qualidade e Seguranca',
  '15 Growth': 'Comercial', '16 Sales CS': 'Comercial',
};
const cfgPath = path.join(process.env.USERPROFILE, '.pixel-agents', 'config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
cfg.standalone.areaMappings = Object.fromEntries(Object.entries(MAPA).map(([k, v]) => [k, [v]]));
cfg.standalone.showAreas = true;
cfg.standalone.alwaysShowLabels = true;
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

const assentos = furniture.filter((f) => /BENCH|CHAIR|SOFA/.test(f.type)).length;
console.log(`layout ${COLS}x${ROWS}: ${furniture.length} móveis, ~${assentos} assentos, ${areas.length} áreas; ${Object.keys(MAPA).length} agentes mapeados`);
