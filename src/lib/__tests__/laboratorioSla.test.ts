import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { buscarSlaLaboratorio, SLA_LAB_PADRAO_HORAS, validarSlaHoras } from '@/lib/laboratorioSla';

const migration = readFileSync('supabase/migrations/20261024160000_sla_laboratorio_por_etapa.sql', 'utf8');

describe('SLA do laboratório por setor e etapa', () => {
  beforeEach(() => rpc.mockReset());

  it('aceita limite inteiro entre 1 e 720 horas, ou vazio para usar o padrão', () => {
    expect(validarSlaHoras('')).toBeNull();
    expect(validarSlaHoras(' 36 ')).toBe(36);
    expect(() => validarSlaHoras('0')).toThrow(/1 e 720/);
    expect(() => validarSlaHoras('721')).toThrow(/1 e 720/);
    expect(() => validarSlaHoras('2.5')).toThrow(/1 e 720/);
    expect(SLA_LAB_PADRAO_HORAS).toBe(24);
  });

  it('consulta o RPC desde o início do período e propaga erro do servidor', async () => {
    rpc.mockResolvedValueOnce({ data: [{ setor_id: null, setor_nome: 'Sem setor' }], error: null });
    const linhas = await buscarSlaLaboratorio('2026-10-01T00:00:00.000Z');
    expect(rpc).toHaveBeenCalledWith('laboratorio_sla_etapas', { p_inicio: '2026-10-01T00:00:00.000Z' });
    expect(linhas).toHaveLength(1);
    rpc.mockResolvedValueOnce({ data: null, error: new Error('permission denied') });
    await expect(buscarSlaLaboratorio('2026-10-01T00:00:00.000Z')).rejects.toThrow('permission denied');
  });

  it('migration é aditiva, respeita RLS e usa o mesmo padrão de limite', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS sla_alerta_horas integer/);
    expect(migration).toMatch(/BETWEEN 1 AND 720/);
    expect(migration).toMatch(/SECURITY INVOKER/);
    expect(migration).not.toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/public\.get_my_clinica_id\(\)/);
    expect(migration).toMatch(/coalesce\(s\.sla_alerta_horas, 24\)/);
    expect(migration).toMatch(/e\.tipo = 'recebida'/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.laboratorio_sla_etapas\(timestamptz\) FROM PUBLIC, anon/);
  });
});
