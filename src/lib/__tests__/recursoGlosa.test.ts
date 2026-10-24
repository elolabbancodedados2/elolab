import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { caminhoDocumentoRecurso, situacaoPrazoRecurso, validarDocumentoRecurso } from '../recursoGlosa';

describe('documentos do recurso de glosa', () => {
  it('aceita PDF/JPEG/PNG até 10 MB', () => {
    expect(validarDocumentoRecurso({ name: 'a.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 })).toBeNull();
    expect(validarDocumentoRecurso({ name: 'a.docx', type: 'application/msword', size: 10 })).toMatch(/PDF, JPEG ou PNG/);
    expect(validarDocumentoRecurso({ name: 'a.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
    expect(validarDocumentoRecurso({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatch(/vazio/);
  });

  it('monta o caminho por clínica e glosa, sem caracteres perigosos', () => {
    expect(caminhoDocumentoRecurso('c1', 'g1', '../Laudo médico (1).pdf', 'u1')).toBe('c1/g1/u1-Laudo-medico-1-.pdf');
  });
});

describe('prazo do recurso', () => {
  it('classifica vencido, vence em até 3 dias e no prazo', () => {
    expect(situacaoPrazoRecurso(null, '2026-10-24')).toBeNull();
    expect(situacaoPrazoRecurso('2026-10-23', '2026-10-24')).toBe('vencido');
    expect(situacaoPrazoRecurso('2026-10-24', '2026-10-24')).toBe('vence_em_breve');
    expect(situacaoPrazoRecurso('2026-10-27', '2026-10-24')).toBe('vence_em_breve');
    expect(situacaoPrazoRecurso('2026-10-28', '2026-10-24')).toBe('no_prazo');
  });
});

describe('migration do recurso de glosa', () => {
  const sql = readFileSync('supabase/migrations/20261024131000_recurso_glosa_prazo_responsavel_documentos.sql', 'utf8');
  it('guarda prazo, responsável e documentos privados por clínica', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS recurso_prazo date/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS recurso_responsavel_id uuid/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.glosa_recurso_documentos/);
    expect(sql).toMatch(/'recursos-glosa', 'recursos-glosa', false/);
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = public\.get_my_clinica_id\(\)::text/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*glosa_recurso_documentos TO authenticated/);
  });
  it('exige prazo e responsável para marcar o recurso como enviado', () => {
    const envio = sql.split("p_status = 'recurso_enviado'")[1].split('ELSIF')[0];
    expect(envio).toMatch(/recurso_prazo IS NULL OR v_glosa\.recurso_responsavel_id IS NULL/);
  });
});
