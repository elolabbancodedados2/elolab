import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261011350000_whatsapp_admin_perfil.sql';
const migration = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('políticas administrativas do WhatsApp', () => {
  it('substitui as políticas tenant-only anteriores', () => {
    for (const table of ['whatsapp_conversations', 'whatsapp_messages', 'whatsapp_agents', 'whatsapp_sessions', 'whatsapp_agent_actions']) {
      expect(migration).toContain(`ON public.${table}`);
    }
    expect(migration).toContain("('whatsapp_notas_internas', 'whatsapp_notas_select_scoped')");
    expect(migration).toContain('DROP POLICY IF EXISTS');
  });

  it('exige admin e igualdade estrita de clínica em todas as políticas novas', () => {
    const createdPolicies = migration.split('CREATE POLICY ').slice(1);
    expect(createdPolicies.length).toBeGreaterThanOrEqual(23);
    for (const policy of createdPolicies) {
      const statement = policy.split(';')[0];
      expect(statement).toContain('public.is_admin(auth.uid())');
      expect(statement).toContain('clinica_id = public.get_my_clinica_id()');
    }
  });

  it('vincula notas criadas ou apagadas ao autor autenticado', () => {
    expect(migration).toContain('AND autor_id = auth.uid()');
    expect(migration).toContain('WHERE c.id = conversation_id AND c.clinica_id = public.get_my_clinica_id()');
  });
});
