/**
 * Confere se o MENU e as ROTAS concordam sobre quem pode acessar cada tela.
 *
 * Quando discordam, dá um de dois defeitos que o usuário sente na hora:
 *
 *   CLIQUE NEGADO      o menu mostra o item e a rota recusa. É o "sem permissão"
 *                      que aparece depois de clicar.
 *   RECURSO ESCONDIDO  a rota permite e o menu não mostra. O recurso existe e
 *                      ninguém acha.
 *
 * Os dois já aconteceram aqui. O médico recebia "sem permissão" na fila mesmo
 * com o banco autorizando, e o painel dele até oferecia um atalho para a tela.
 * Outras quatro estavam liberadas na rota e inalcançáveis pelo menu.
 *
 * DETALHE QUE ENGANA: getFilteredMenuGroups filtra nos DOIS níveis — o papel
 * precisa passar pelo grupo E pelo item. A permissão efetiva é a INTERSEÇÃO.
 * Incluir o papel só no item não resolve: se o grupo não o tem, o grupo inteiro
 * desaparece. Foi exatamente o que aconteceu com a fila.
 *
 * `admin` fica fora da conta: getFilteredMenuGroups devolve true antes de olhar
 * roles quando isAdmin, então admin vê tudo por desenho.
 *
 * Roda sem credencial — é só leitura de arquivo, serve no CI.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const PAPEIS = ['admin', 'medico', 'recepcao', 'enfermagem', 'financeiro'];

// ── Rotas protegidas ────────────────────────────────────────────────────────
const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');

const rotas = new Map();
// Captura também `somentePlataforma`, que restringe ao dono da plataforma
// (tabela platform_admins) e não a um papel de clínica. Sem tratá-la, a rota
// parecia aberta a todos e o verificador acusava "recurso escondido" nas telas
// de plataforma — que o menu esconde de propósito, via superAdminOnly.
const RE_ROTA =
  /path="([^"]+)"\s+element=\{<SupabaseProtectedRoute(\s+somentePlataforma)?(?:\s+allowedRoles=\{\[([^\]]*)\]\})?/g;
for (const m of app.matchAll(RE_ROTA)) {
  // Rota de plataforma não é alcançável por papel nenhum de clínica.
  const papeis = m[2]
    ? []
    : m[3]
      ? [...m[3].matchAll(/'([a-z]+)'/g)].map((x) => x[1])
      : [...PAPEIS]; // sem restrição = qualquer autenticado
  // A mesma rota aparece nos dois modos de roteamento (landing e app); o
  // efetivo é a união.
  const atual = rotas.get(m[1]) || new Set();
  papeis.forEach((p) => atual.add(p));
  rotas.set(m[1], atual);
}

// Redirecionamentos: /triagem -> /fila?tab=triagem, por exemplo.
const aliases = new Map();
for (const m of app.matchAll(/path="([^"]+)"\s+element=\{<Navigate to="([^"?]+)/g)) {
  aliases.set(m[1], m[2]);
}

// ── Menu, respeitando o aninhamento ─────────────────────────────────────────
const menuSrc = fs.readFileSync(path.join(SRC, 'config', 'sidebarMenu.ts'), 'utf8');

const grupos = [];
const marcas = [...menuSrc.matchAll(/^\s{2}\{\s*$/gm)].map((m) => m.index);
marcas.push(menuSrc.length);

for (let i = 0; i < marcas.length - 1; i++) {
  const bloco = menuSrc.slice(marcas[i], marcas[i + 1]);
  const labelGrupo = bloco.match(/^\s*label:\s*'([^']+)'/m)?.[1];
  if (!labelGrupo) continue;

  // Separar cabeça de corpo evita confundir o roles do grupo com o dos itens.
  const iItens = bloco.indexOf('items:');
  const cabeca = iItens >= 0 ? bloco.slice(0, iItens) : bloco;
  const corpo = iItens >= 0 ? bloco.slice(iItens) : '';

  const rg = cabeca.match(/roles:\s*\[([^\]]*)\]/);
  const papeisGrupo = rg ? [...rg[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : [...PAPEIS];
  const soPlataformaGrupo = /superAdminOnly:\s*true/.test(cabeca);

  const itens = [];
  for (const m of corpo.matchAll(/\{[^{}]*href:\s*'([^']+)'[^{}]*\}/g)) {
    const trecho = m[0];
    const label = trecho.match(/label:\s*'([^']+)'/)?.[1] || m[1];
    const ri = trecho.match(/roles:\s*\[([^\]]*)\]/);
    // Item sem roles vale para todos os papéis do grupo.
    const papeisItem = ri ? [...ri[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : [...PAPEIS];
    // superAdminOnly: nenhum papel de clínica enxerga, seja no item ou no grupo.
    const soPlataforma = /superAdminOnly:\s*true/.test(trecho) || soPlataformaGrupo;
    itens.push({ label, href: m[1], papeisItem, soPlataforma });
  }
  grupos.push({ labelGrupo, papeisGrupo, itens });
}

// ── Comparação ──────────────────────────────────────────────────────────────
const cliqueNegado = [];
const recursoEscondido = [];
const grupoAnulaItem = [];
const rotaAbertaDemais = [];
const semRota = [];

for (const g of grupos) {
  for (const it of g.itens) {
    const efetivo = it.papeisItem.filter((p) => g.papeisGrupo.includes(p) && p !== 'admin');
    const anulados = it.papeisItem.filter((p) => !g.papeisGrupo.includes(p) && p !== 'admin');
    if (anulados.length) grupoAnulaItem.push({ ...it, grupo: g.labelGrupo, papeis: anulados });

    const caminho = it.href.split('?')[0];
    const daRota = rotas.get(aliases.get(caminho) || caminho);
    if (!daRota) { semRota.push({ ...it, grupo: g.labelGrupo }); continue; }

    // Tela marcada como só-do-dono no menu, mas cuja ROTA aceita papel de
    // clínica. O menu esconder não protege nada: basta digitar o endereço.
    // Foi assim que /painel-admin ficou aberto ao admin de qualquer clínica,
    // expondo perfis, papéis, assinaturas e planos de todos os clientes.
    if (it.soPlataforma && daRota.size > 0) {
      rotaAbertaDemais.push({ ...it, grupo: g.labelGrupo, papeis: [...daRota] });
      continue;
    }
    if (it.soPlataforma) continue;

    const negados = efetivo.filter((p) => !daRota.has(p));
    const escondidos = [...daRota].filter((p) => p !== 'admin' && !efetivo.includes(p));

    if (negados.length) cliqueNegado.push({ ...it, grupo: g.labelGrupo, papeis: negados });
    if (escondidos.length) recursoEscondido.push({ ...it, grupo: g.labelGrupo, papeis: escondidos });
  }
}

function bloco(titulo, lista, nota) {
  console.log(`\n${titulo} — ${lista.length}`);
  console.log(nota);
  for (const x of lista) {
    console.log(`  ${(x.grupo + ' > ' + x.label).padEnd(42)} ${x.href.padEnd(24)} ${x.papeis.join(', ')}`);
  }
}

const itens = grupos.reduce((a, g) => a + g.itens.length, 0);
console.log(`${grupos.length} grupos, ${itens} itens de menu, ${rotas.size} rotas protegidas`);

const problemas = cliqueNegado.length + recursoEscondido.length + rotaAbertaDemais.length;

if (rotaAbertaDemais.length) {
  bloco('ROTA ABERTA DEMAIS', rotaAbertaDemais,
    'Tela só-do-dono no menu, mas a rota aceita papel de clínica. Esconder do menu não protege: basta digitar o endereço.');
}

if (cliqueNegado.length) {
  bloco('CLIQUE NEGADO', cliqueNegado,
    'O menu mostra e a rota recusa. O usuário clica e recebe "sem permissão".');
}
if (recursoEscondido.length) {
  bloco('RECURSO ESCONDIDO', recursoEscondido,
    'A rota permite e o menu não mostra. O recurso existe e o usuário não encontra.');
}

// Informativo: hoje são 16 casos, todos deliberados — o grupo é o portão real e
// os papéis extras no item nunca surtem efeito. Não falha o CI porque decidir
// quem vê o financeiro é produto, não defeito.
if (grupoAnulaItem.length) {
  console.log(`\n(informativo) item cita papel que o grupo dele não tem: ${grupoAnulaItem.length} — sem efeito prático`);
}
if (semRota.length) {
  console.log(`(informativo) itens sem rota protegida correspondente: ${semRota.map((s) => s.href).join(', ')}`);
}

if (!problemas) {
  console.log('\nOK — menu e rotas concordam sobre quem acessa cada tela.');
}
process.exit(problemas ? 1 : 0);
