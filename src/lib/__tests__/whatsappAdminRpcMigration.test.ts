import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261011360000_whatsapp_rpcs_admin_only.sql', 'utf8');

describe('RPCs do Agente de IA', () => {
  it('exige admin dentro das funções SECURITY DEFINER', () => {
    const functions = migration.split('CREATE OR REPLACE FUNCTION public.').slice(1);
    expect(functions).toHaveLength(2);
    for (const definition of functions) {
      expect(definition).toContain('SECURITY DEFINER');
      expect(definition).toContain('IF NOT public.is_admin(auth.uid()) THEN');
      expect(definition).toContain('clinica_id = public.get_my_clinica_id()');
    }
  });

  it('mantém execução autenticada e revoga acesso público e anônimo', () => {
    expect(migration.match(/REVOKE ALL ON FUNCTION/g)).toHaveLength(2);
    expect(migration.match(/FROM PUBLIC, anon/g)).toHaveLength(2);
    expect(migration.match(/TO authenticated/g)).toHaveLength(2);
  });
});
