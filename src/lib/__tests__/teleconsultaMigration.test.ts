import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261014190000_teleconsulta_sessoes_seguras.sql';

describe('persistência segura das teleconsultas', () => {
  it('limita o tipo telemedicina sem reescrever agendamentos existentes', () => {
    const migration = readFileSync(path, 'utf8');
    expect(migration).toMatch(/agendamentos_tipo_check[\s\S]*'telemedicina'::text/i);
    expect(migration).not.toMatch(/UPDATE public\.agendamentos[\s\S]*SET tipo/);
  });

  it('armazena hash, clínica e expiração; nega acesso direto do navegador às sessões e sinais', () => {
    const migration = readFileSync(path, 'utf8');
    expect(migration).toMatch(/CREATE TABLE public\.teleconsulta_sessions/i);
    expect(migration).toMatch(/guest_token_hash text NOT NULL/i);
    expect(migration).toMatch(/expires_at timestamptz NOT NULL/i);
    expect(migration).toMatch(/CREATE TABLE public\.teleconsulta_signals/i);
    expect(migration).toMatch(/ALTER TABLE public\.teleconsulta_sessions ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ALTER TABLE public\.teleconsulta_signals ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.teleconsulta_sessions FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.teleconsulta_signals FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT ALL ON TABLE public\.teleconsulta_sessions TO service_role/i);
    expect(migration).toMatch(/GRANT ALL ON TABLE public\.teleconsulta_signals TO service_role/i);
  });

  it('retém só metadados de consentimento e presença, sem coluna de mídia ou conteúdo clínico', () => {
    const migration = readFileSync(path, 'utf8');
    expect(migration).toMatch(/provider_consented_at timestamptz/);
    expect(migration).toMatch(/guest_consented_at timestamptz/);
    expect(migration).toMatch(/provider_last_seen_at timestamptz/);
    expect(migration).toMatch(/guest_last_seen_at timestamptz/);
    expect(migration).not.toMatch(/recording|audio_blob|video_blob|patient_name|prontuario/i);
  });
});
