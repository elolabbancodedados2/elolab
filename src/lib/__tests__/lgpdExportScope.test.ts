import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { ESCOPOS_EXPORTACAO_LGPD, filtrarEscopoExportacao, normalizarEscopoExportacao } from '@/lib/lgpdCompliance';

const migration = readFileSync('supabase/migrations/20261024111000_exportacao_lgpd_protocolo_escopo.sql', 'utf8');

describe('exportação LGPD com escopo', () => {
  it('mantém sempre o cadastro e remove categorias não selecionadas', () => {
    const pacote = {
      paciente: { id: 'p1' },
      consentimentos_lgpd: [{}],
      agendamentos: [{}],
      prontuarios: [{}],
      attachments: [{}],
      lancamentos: [{}],
      whatsapp_messages: [{}],
      audit_log: [{}],
    };
    const filtrado = filtrarEscopoExportacao(pacote, ['agenda']);
    expect(Object.keys(filtrado).sort()).toEqual(['agendamentos', 'consentimentos_lgpd', 'paciente']);
  });

  it('normaliza o escopo para categorias conhecidas, com cadastro obrigatório', () => {
    expect(normalizarEscopoExportacao(['clinico', 'xyz', 'clinico'])).toEqual(['cadastro', 'clinico']);
    expect(normalizarEscopoExportacao(undefined)).toEqual(ESCOPOS_EXPORTACAO_LGPD.map(e => e.id));
  });

  it('gera protocolo imutável, guarda escopo e conclui só por RPC auditada de admin', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS protocolo text/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS escopo text\[\]/);
    expect(migration).toMatch(/NEW\.protocolo := OLD\.protocolo/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.concluir_exportacao_lgpd_paciente\(/);
    expect(migration).toMatch(/public\.is_admin\(v_user_id\)/);
    expect(migration).toMatch(/public\.is_same_clinica\(v_pedido\.clinica_id\)/);
    expect(migration).toMatch(/v_pedido\.status <> 'pending'/);
    expect(migration).toMatch(/INSERT INTO public\.audit_log/);
  });
});
