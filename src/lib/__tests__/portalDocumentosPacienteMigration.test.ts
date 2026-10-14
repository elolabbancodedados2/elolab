import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261014180000_documentos_portal_paciente_controlados.sql',
  'utf8',
);

describe('controlled patient portal documents migration', () => {
  it('stores publication separately from clinical attachments with origin and optional validity', () => {
    expect(migration).toMatch(/CREATE TABLE public\.documentos_portal_paciente/i);
    expect(migration).toMatch(/anexo_id uuid NOT NULL UNIQUE REFERENCES public\.anexos_prontuario/i);
    expect(migration).toMatch(/paciente_id uuid NOT NULL REFERENCES public\.pacientes/i);
    expect(migration).toMatch(/clinica_id uuid NOT NULL REFERENCES public\.clinicas/i);
    expect(migration).toMatch(/origem text NOT NULL CHECK/i);
    expect(migration).toMatch(/validade_ate date/);
    expect(migration).toMatch(/publicado boolean NOT NULL DEFAULT false/i);
  });

  it('allows publication changes only through a role- and clinic-scoped RPC', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.gerenciar_documento_portal_paciente/i);
    expect(migration).toMatch(/is_admin\(v_user_id\) OR public\.is_medico\(v_user_id\)/i);
    expect(migration).toMatch(/FOR UPDATE/);
    expect(migration).toMatch(/p\.clinica_id = v_clinica_id/);
    expect(migration).toMatch(/p_anexo_id/);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.documentos_portal_paciente FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.documentos_portal_paciente TO authenticated/i);
    expect(migration).toMatch(/CREATE POLICY documentos_portal_paciente_select/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.gerenciar_documento_portal_paciente/i);
  });

  it('rejects invalid origins and publication dates that already expired', () => {
    expect(migration).toMatch(/p_origem NOT IN \('clinica', 'externo'\)/i);
    expect(migration).toMatch(/p_validade_ate < \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date/i);
  });
});
