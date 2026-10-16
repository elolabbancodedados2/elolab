import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261014172000_hardening_onboarding_clinica.sql';

describe('onboarding baseado em recursos reais da clínica', () => {
  it('fixa search_path e restringe leitura à clínica da sessão por administrador', () => {
    const migration = readFileSync(path, 'utf8');
    expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path = ''/i);
    expect(migration).toMatch(/v_clinica uuid := public\.current_clinica_id\(\)/i);
    expect(migration).toMatch(/IF v_clinica IS NULL OR NOT public\.has_role\(auth\.uid\(\), 'admin'\)/i);
    expect(migration).toMatch(/FROM public\.profiles p[\s\S]*p\.clinica_id = v_clinica/i);
    expect(migration).toMatch(/FROM public\.configuracoes_clinica c[\s\S]*c\.clinica_id = v_clinica/i);
    expect(migration).toMatch(/FROM public\.medicos m JOIN public\.medico_disponibilidade md[\s\S]*m\.clinica_id = v_clinica/i);
    expect(migration).toMatch(/FROM public\.tipos_consulta t[\s\S]*t\.clinica_id = v_clinica/i);
    expect(migration).toMatch(/FROM public\.agendamentos a WHERE a\.clinica_id = v_clinica/i);
  });

  it('conta apenas quatro etapas essenciais e mantém WhatsApp opcional', () => {
    const migration = readFileSync(path, 'utf8');
    expect(migration).toMatch(/v_is_complete := v_completed = 4/i);
    expect(migration).toMatch(/'total_steps', 4[\s\S]*'progress', v_completed \* 25/i);
    expect(migration).toMatch(/'key', 'whatsapp'[\s\S]*'complete', v_whatsapp_count > 0/i);
    expect(migration).not.toMatch(/v_completed[\s\S]*CASE WHEN v_whatsapp_count > 0/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.clinic_onboarding_overview\(\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.clinic_onboarding_overview\(\) TO authenticated/i);
  });
});
