import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { buscarAuditoriaAcessos, gerarCsvAcessos, intervaloAuditoria, LIMITE_LINHAS_AUDITORIA } from '@/lib/auditoriaAcessos';

const migrationPath = 'supabase/migrations/20261024151000_auditoria_acessos_intervalo.sql';

describe('auditoria de acessos por intervalo', () => {
  beforeEach(() => rpc.mockReset());

  it('exige intervalo completo, ordenado e de até 93 dias', () => {
    expect(() => intervaloAuditoria('', '2026-10-10')).toThrow(/data inicial e final/);
    expect(() => intervaloAuditoria('2026-10-10', '2026-10-01')).toThrow(/anterior/);
    expect(() => intervaloAuditoria('2026-01-01', '2026-06-01')).toThrow(/93 dias/);
    const r = intervaloAuditoria('2026-10-01', '2026-10-01');
    expect(new Date(r.p_fim).getTime()).toBeGreaterThan(new Date(r.p_inicio).getTime());
  });

  it('consulta o RPC restrito e sinaliza quando o limite de linhas foi atingido', async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: LIMITE_LINHAS_AUDITORIA }, (_, i) => ({ evento_id: String(i) })), error: null });
    const res = await buscarAuditoriaAcessos('2026-10-01', '2026-10-02');
    expect(rpc).toHaveBeenCalledWith('auditoria_acessos_intervalo', expect.objectContaining({ p_inicio: expect.any(String), p_fim: expect.any(String) }));
    expect(res.truncado).toBe(true);
  });

  it('propaga recusa de permissão do servidor', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Apenas administradores') });
    await expect(buscarAuditoriaAcessos('2026-10-01', '2026-10-02')).rejects.toThrow('Apenas administradores');
  });

  it('gera CSV com período no cabeçalho, aviso de truncamento e proteção contra fórmula', () => {
    const csv = gerarCsvAcessos([{
      evento_id: 'e1', origem: 'prontuario_acessos', ocorrido_em: '2026-10-01T12:00:00Z', acao: 'visualizacao',
      usuario_id: 'u1', usuario_nome: '=HYPERLINK("x")', recurso: 'prontuarios', registro_id: 'p1',
    }], '2026-10-01', '2026-10-02', true);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('2026-10-01');
    expect(csv).toMatch(/limite/i);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('o banco restringe a administradores da clínica, limita intervalo/linhas e registra a exportação', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.auditoria_acessos_intervalo\(/i);
    expect(sql).toMatch(/is_admin\(auth\.uid\(\)\)/i);
    expect(sql).toMatch(/get_my_clinica_id\(\)/i);
    expect(sql).toMatch(/interval '93 days'/i);
    expect(sql).toMatch(/LIMIT 5000/i);
    expect(sql).toMatch(/FROM public\.prontuario_acessos/i);
    expect(sql).toMatch(/action = 'access'/i);
    expect(sql).toMatch(/INSERT INTO public\.audit_log/i);
    expect(sql).not.toMatch(/record_name|changes|justificativa|paciente_id/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.auditoria_acessos_intervalo\(timestamptz, timestamptz\) FROM PUBLIC, anon/i);
  });
});
