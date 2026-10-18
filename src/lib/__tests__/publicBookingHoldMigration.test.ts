import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261015100000_reserva_temporaria_agendamento_publico.sql', 'utf8');
const edgeFunction = readFileSync('supabase/functions/public-booking/index.ts', 'utf8');

describe('reservas temporárias do agendamento público', () => {
  it('guarda somente o hash do token, com validade e isolamento por clínica', () => {
    expect(migration).toMatch(/CREATE TABLE (?:IF NOT EXISTS )?public\.public_booking_holds/i);
    expect(migration).toMatch(/clinica_id uuid NOT NULL REFERENCES public\.clinicas/i);
    expect(migration).toMatch(/token_hash text NOT NULL UNIQUE CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
    expect(migration).toMatch(/expires_at timestamptz NOT NULL/i);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.public_booking_holds FROM PUBLIC, anon, authenticated/i);
  });

  it('serializa reservas e libera apenas a vaga que não venceu', () => {
    expect(migration).toMatch(/reservar_horario_publico_atomico/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/expires_at > pg_catalog\.now\(\)/i);
    expect(migration).toMatch(/interval '5 minutes'/i);
    expect(migration).toMatch(/agendar_consulta_online_atomico[\s\S]*?p_hold_token_hash text/i);
    expect(migration).toMatch(/WHERE h\.token_hash = p_hold_token_hash/i);
    expect(migration).toMatch(/DELETE FROM public\.public_booking_holds WHERE id = v_hold\.id/i);
  });

  it('conecta a Edge Function às ações de reserva, liberação e confirmação com token hash', () => {
    expect(edgeFunction).toMatch(/action === 'hold'/);
    expect(edgeFunction).toMatch(/action === 'release'/);
    expect(edgeFunction).toMatch(/crypto\.subtle\.digest\('SHA-256'/);
    expect(edgeFunction).toMatch(/reservar_horario_publico_atomico/);
    expect(edgeFunction).toMatch(/p_hold_token_hash:\s*await hashHoldToken\(holdToken\)/);
  });
});
