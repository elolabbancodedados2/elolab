// Executar: node --test scripts/ci/falhar-se-pulado.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarRelatorio, listarTestes } from './falhar-se-pulado.mjs';

// Mesmo formato do reporter "json" do Playwright: suíte de topo = arquivo,
// suítes filhas = test.describe, specs = test(), tests[] = um por projeto.
function relatorio(testes, errors = []) {
  const porArquivo = new Map();
  for (const t of testes) {
    if (!porArquivo.has(t.arquivo)) porArquivo.set(t.arquivo, new Map());
    const describes = porArquivo.get(t.arquivo);
    if (!describes.has(t.describe)) describes.set(t.describe, []);
    describes.get(t.describe).push(t);
  }
  return {
    errors,
    suites: [...porArquivo].map(([arquivo, describes]) => ({
      title: arquivo,
      file: arquivo,
      specs: [],
      suites: [...describes].map(([describe, lista]) => ({
        title: describe,
        file: arquivo,
        specs: lista.map((t) => ({
          title: t.titulo,
          file: arquivo,
          tests: [{
            projectName: 'chromium',
            status: t.status,
            annotations: t.status === 'skipped' ? [{ type: 'skip', description: 'motivo sintético' }] : [],
          }],
        })),
      })),
    })),
  };
}

const EXIGIR = ['rls.spec.ts', 'isolamento-entre-clinicas.spec.ts'];
const HOJE = '2026-10-27';
const permitidoEdge = {
  arquivo: 'rls.spec.ts',
  titulo: 'Edge › whatsapp recusa anônimo',
  motivo: 'stub ausente',
  dono: 'backend-developer',
  revisar_ate: '2026-11-30',
};

const verde = [
  { arquivo: 'rls.spec.ts', describe: 'RLS — leitura anônima', titulo: 'pacientes: anônimo não lê', status: 'expected' },
  { arquivo: 'isolamento-entre-clinicas.spec.ts', describe: 'Isolamento', titulo: 'A não lê B', status: 'expected' },
];

test('monta o título como describe › teste e usa o nome do arquivo', () => {
  const [t] = listarTestes(relatorio([verde[0]]));
  assert.equal(t.arquivo, 'rls.spec.ts');
  assert.equal(t.titulo, 'RLS — leitura anônima › pacientes: anônimo não lê');
  assert.equal(t.status, 'expected');
});

test('aprova quando tudo executou', () => {
  const r = avaliarRelatorio(relatorio(verde), { exigir: EXIGIR, hoje: HOJE });
  assert.equal(r.ok, true, r.erros.join('\n'));
  assert.equal(r.resumo.executados, 2);
});

test('reprova a suíte inteira pulada (o defeito atual: 41 skipped, saída 0)', () => {
  const pulado = verde.map((t) => ({ ...t, status: 'skipped' }));
  const r = avaliarRelatorio(relatorio(pulado), { exigir: EXIGIR, hoje: HOJE });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('nenhum teste foi executado')));
  assert.ok(r.erros.some((e) => e.includes('spec exigida não executou nenhum teste: rls.spec.ts')));
  assert.ok(r.erros.some((e) => e.startsWith('pulado sem permissão')));
});

test('reprova um único skip fora da allowlist', () => {
  const r = avaliarRelatorio(relatorio([...verde,
    { arquivo: 'rls.spec.ts', describe: 'RLS — escrita anônima', titulo: 'insert bloqueado', status: 'skipped' }]),
  { exigir: EXIGIR, permitidos: [permitidoEdge], hoje: HOJE });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erros, ['pulado sem permissão: rls.spec.ts › RLS — escrita anônima › insert bloqueado — motivo do skip: motivo sintético']);
});

test('aceita skip da allowlist dentro do prazo, como aviso', () => {
  const r = avaliarRelatorio(relatorio([...verde,
    { arquivo: 'rls.spec.ts', describe: 'Edge', titulo: 'whatsapp recusa anônimo', status: 'skipped' }]),
  { exigir: EXIGIR, permitidos: [permitidoEdge], hoje: HOJE });
  assert.equal(r.ok, true, r.erros.join('\n'));
  assert.equal(r.resumo.pulados_permitidos, 1);
  assert.ok(r.avisos.some((a) => a.startsWith('pulado (permitido)')));
});

test('allowlist casa arquivo e título exatos, não por trecho', () => {
  const r = avaliarRelatorio(relatorio([...verde,
    { arquivo: 'isolamento-entre-clinicas.spec.ts', describe: 'Edge', titulo: 'whatsapp recusa anônimo', status: 'skipped' }]),
  { exigir: EXIGIR, permitidos: [permitidoEdge], hoje: HOJE });
  assert.equal(r.ok, false);
});

test('reprova item da allowlist vencido ou incompleto', () => {
  const vencido = avaliarRelatorio(relatorio(verde), { exigir: EXIGIR, permitidos: [{ ...permitidoEdge, revisar_ate: '2026-10-01' }], hoje: HOJE });
  assert.equal(vencido.ok, false);
  assert.ok(vencido.erros[0].includes('venceu em 2026-10-01'));
  const semDono = avaliarRelatorio(relatorio(verde), { exigir: EXIGIR, permitidos: [{ ...permitidoEdge, dono: '' }], hoje: HOJE });
  assert.equal(semDono.ok, false);
});

test('reprova spec exigida ausente, erro de carga e teste falho', () => {
  const ausente = avaliarRelatorio(relatorio([verde[0]]), { exigir: EXIGIR, hoje: HOJE });
  assert.ok(ausente.erros.includes('spec exigida ausente do relatório: isolamento-entre-clinicas.spec.ts'));

  const carga = avaliarRelatorio(relatorio(verde, [{ message: 'Error: QA_SUPABASE_URL ausente em CI\n at x' }]), { exigir: EXIGIR, hoje: HOJE });
  assert.equal(carga.ok, false);
  assert.ok(carga.erros[0].startsWith('erro de carga no Playwright: Error: QA_SUPABASE_URL ausente em CI'));

  const falho = avaliarRelatorio(relatorio([verde[0], { ...verde[1], status: 'unexpected' }]), { exigir: EXIGIR, hoje: HOJE });
  assert.equal(falho.ok, false);
  assert.equal(falho.resumo.falharam, 1);
});

test('avisa quando um item da allowlist passou a executar', () => {
  const r = avaliarRelatorio(relatorio([...verde,
    { arquivo: 'rls.spec.ts', describe: 'Edge', titulo: 'whatsapp recusa anônimo', status: 'expected' }]),
  { exigir: EXIGIR, permitidos: [permitidoEdge], hoje: HOJE });
  assert.equal(r.ok, true);
  assert.ok(r.avisos.some((a) => a.startsWith('executou e pode sair da allowlist')));
});
