import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261011080000_risco_faltas_perfil_e_lembrete.sql',
  'utf8',
);
const page = readFileSync('src/pages/AnalisePreditiva.tsx', 'utf8');

describe('permissao e lembrete de risco de faltas', () => {
  it('restringe os scores e valida o lembrete antes de enfileirar', () => {
    expect(migration).toMatch(/CREATE POLICY predicoes_no_show_clinica[\s\S]*?is_admin\(auth\.uid\(\)\)[\s\S]*?is_recepcao\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/FUNCTION public\.enfileirar_lembrete_risco[\s\S]*?SECURITY DEFINER/i);
    expect(migration).toMatch(/ag.clinica_id = v_clinica_id/i);
    expect(migration).toMatch(/agendamento-online|lembrete-risco/);
    expect(migration).toMatch(/notification_queue/);
    expect(migration).toMatch(/prevencao_no_show/);
    expect(migration).toMatch(/CREATE TRIGGER notification_queue_dedupe_lembrete_risco[\s\S]*?BEFORE INSERT ON public\.notification_queue/i);
    expect(migration).toMatch(/evitar_lembrete_risco_duplicado[\s\S]*?pg_advisory_xact_lock[\s\S]*?RETURN NULL/i);
  });

  it('calcula e envia prevenção automática apenas com dados da mesma clínica', () => {
    expect(migration).toMatch(/FUNCTION public\.atualizar_predicoes_no_show\(\)[\s\S]*?SECURITY DEFINER/i);
    expect(migration).toMatch(/JOIN public\.pacientes p ON p\.id = ag\.paciente_id AND p\.clinica_id = ag\.clinica_id/i);
    expect(migration).toMatch(/JOIN public\.medicos m ON m\.id = ag\.medico_id AND m\.clinica_id = ag\.clinica_id/i);
    expect(migration).toMatch(/hist\.clinica_id = a\.clinica_id[\s\S]*?hist\.paciente_id = a\.paciente_id/i);
    expect(migration).toMatch(/notification_queue[\s\S]*?clinica_id = a\.clinica_id/i);
    expect(migration).toMatch(/America\/Sao_Paulo/);
  });

  it('deduplica só lembretes ativos ou enviados e deixa tentar de novo após erro', () => {
    expect(migration).toMatch(/COALESCE\(NEW\.dados_extras->>'tipo_notificacao', ''\) NOT IN/i);
    expect(migration.match(/q\.status IN \('pendente', 'enviando'\)[\s\S]*?q\.status = 'enviado'/gi)).toHaveLength(3);
    expect(migration.match(/COALESCE\(q\.enviado_em, q\.created_at\) > now\(\) - interval '20 hours'/gi)).toHaveLength(3);
    expect(page).toContain('Já existe um lembrete na fila ou enviado nas últimas 20 horas');
    expect(page).toContain('não é uma previsão estatística confirmada');
  });
});
