import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261011180000_integridade_tenant_laboratorio.sql',
  'utf8',
);
const mapaColeta = readFileSync('src/pages/MapaColeta.tsx', 'utf8');
const laboratorio = readFileSync('src/pages/Laboratorio.tsx', 'utf8');

describe('integridade de tenant no fluxo laboratorial', () => {
  it('valida paciente, profissional, convênio e catálogo antes de salvar pedidos e exames', () => {
    expect(migration).toMatch(/FUNCTION public\.validar_tenant_pedido_laboratorio/i);
    expect(migration).toMatch(/FUNCTION public\.validar_tenant_exame_laboratorial/i);
    expect(migration).toMatch(/v_clinica IS DISTINCT FROM NEW\.clinica_id/i);
    expect(migration).toMatch(/pa\.clinica_id IS DISTINCT FROM p\.clinica_id/i);
    expect(migration).toMatch(/m\.clinica_id IS DISTINCT FROM p\.clinica_id/i);
    expect(migration).toMatch(/c\.clinica_id IS DISTINCT FROM p\.clinica_id/i);
    expect(migration).toMatch(/tipo_exames_catalog/i);
    expect(migration).toMatch(/pedido_laboratorio_id/i);
  });

  it('impede que amostras e resultados apontem para paciente, exame ou setor de outra clínica', () => {
    expect(migration).toMatch(/FUNCTION public\.validar_tenant_coleta_laboratorio/i);
    expect(migration).toMatch(/FUNCTION public\.validar_tenant_resultado_laboratorio/i);
    expect(migration).toMatch(/coletas_laboratorio/i);
    expect(migration).toMatch(/recoleta_de_id/i);
    expect(migration).toMatch(/FOR SHARE/i);
    expect(migration).toMatch(/trg_validar_tenant_coleta_laboratorio/i);
    expect(migration).toMatch(/trg_validar_tenant_resultado_laboratorio/i);
  });

  it('aborta sem alterar dados caso já existam referências laboratoriais entre clínicas', () => {
    expect(migration).toMatch(/DO \$\$[\s\S]*?IF v_invalidos > 0[\s\S]*?RAISE EXCEPTION/i);
  });

  it('exige a RPC auditada para validar coleta, publicar resultados e retificar laudo', () => {
    expect(migration).toMatch(/FUNCTION public\.proteger_transicao_coleta_laboratorio/i);
    expect(migration).toMatch(/current_setting\('elolab\.lab_transition'/i);
    expect(migration).toMatch(/FUNCTION public\.validar_coleta_laboratorio/i);
    expect(migration).toMatch(/set_config\('elolab\.lab_transition', 'validado:' \|\| p_coleta_id::text/i);
    expect(migration).toMatch(/FUNCTION public\.liberar_resultados_laboratorio/i);
    expect(migration).toMatch(/set_config\('elolab\.lab_transition', 'liberado:' \|\| p_coleta_id::text/i);
    expect(migration).toMatch(/set_config\('elolab\.liberar_resultado_coleta', p_coleta_id::text/i);
    expect(migration).toMatch(/set_config\('elolab\.retificar_resultado', p_resultado_id::text/i);
    expect(migration).toMatch(/v_status = 'validado'[\s\S]*?current_setting\('elolab\.retificar_resultado'[\s\S]*?NEW\.liberado IS NOT DISTINCT FROM OLD\.liberado/i);
    expect(migration).toMatch(/OLD\.liberado IS TRUE AND NEW\.liberado IS TRUE/i);
  });

  it('recalcula os pedidos antigo e novo ao mover ou excluir exames', () => {
    expect(migration).toMatch(/FUNCTION public\.laboratorio_recalcular_pedido/i);
    expect(migration).toMatch(/TG_OP IN \('UPDATE', 'DELETE'\)[\s\S]*?OLD\.pedido_laboratorio_id/i);
    expect(migration).toMatch(/AFTER INSERT OR UPDATE OF status, pedido_laboratorio_id OR DELETE ON public\.exames/i);
    expect(migration).toMatch(/WHEN v_total = 0 THEN 'cancelado'/i);
    expect(migration).toMatch(/ORDER BY item\.pedido_id/i);
    expect(migration).toMatch(/FUNCTION public\.validar_tenant_exame_laboratorial[\s\S]*?ORDER BY p\.id FOR UPDATE/i);
  });

  it('abre recoleta rastreável por RPC e não grava status diretamente pela tela', () => {
    expect(mapaColeta).toMatch(/const handleRecoleta = \(id: string\) => \{[\s\S]*?setEventoTipo\('recoleta'\)[\s\S]*?setDetailId\(id\)/i);
    expect(mapaColeta).not.toMatch(/transitionStatus\(id, \['coletado'\], 'recoleta'/i);
    expect(migration).toMatch(/p_tipo = 'recoleta'[\s\S]*?v_coleta\.status IN \('coletado', 'em_analise'\)/i);
    expect(migration).toMatch(/'recoleta', concat_ws/i);
    expect(laboratorio).not.toMatch(/coletado:\s*\['em_analise', 'recoleta'\]/i);
  });
});
