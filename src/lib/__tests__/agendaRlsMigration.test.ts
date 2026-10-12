import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261011030000_agenda_isolamento_medico.sql'),
  'utf8',
);

describe('isolamento de acesso da Agenda no banco', () => {
  it('vincula o médico ao usuário autenticado e à clínica ativa', () => {
    expect(migration).toMatch(/m\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(migration).toMatch(/m\.id\s*=\s*p_medico_id/i);
    expect(migration).toMatch(/m\.clinica_id\s*=\s*public\.get_my_clinica_id\(\)/i);
  });

  it('restringe leitura e edição dos médicos às próprias consultas', () => {
    expect(migration).toMatch(/CREATE POLICY agendamentos_select[\s\S]*?NOT is_medico\(auth\.uid\(\)\)[\s\S]*?is_medico_da_agenda\(medico_id\)/i);
    expect(migration).toMatch(/CREATE POLICY agendamentos_update[\s\S]*?USING[\s\S]*?is_medico_da_agenda\(medico_id\)[\s\S]*?WITH CHECK[\s\S]*?is_medico_da_agenda\(medico_id\)/i);
  });

  it('limita inclusões de médicos ao seu próprio cadastro e mantém o escopo da clínica', () => {
    expect(migration).toMatch(/CREATE POLICY agendamentos_insert[\s\S]*?is_medico_da_agenda\(medico_id\)/i);
  });

  it('mantém a mesma autorização na RPC e remove a fila antes de cancelar ou marcar falta', () => {
    expect(migration).toMatch(/is_medico_da_agenda\(v_agendamento\.medico_id\)/i);
    expect(migration).toMatch(/DELETE FROM public\.fila_atendimento[\s\S]*?UPDATE public\.agendamentos\s+SET status/i);
  });

  it('allows no-show only before triage and cancellation only before treatment', () => {
    expect(migration).toMatch(/p_status = 'faltou'[\s\S]*?v_agendamento\.status::text NOT IN\s*\(\s*'agendado',\s*'confirmado',\s*'aguardando'\s*\)[\s\S]*?RETURN jsonb_build_object\('atualizado', false/i);
    expect(migration).toMatch(/p_status = 'cancelado'[\s\S]*?v_agendamento\.status::text NOT IN\s*\(\s*'agendado',\s*'confirmado',\s*'aguardando',\s*'aguardando_triagem',\s*'em_triagem'\s*\)[\s\S]*?RETURN jsonb_build_object\('atualizado', false/i);
  });
});
