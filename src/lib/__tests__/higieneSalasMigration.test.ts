import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261014210000_higiene_salas.sql';

describe('persistência de higiene e liberação segura de salas', () => {
  it('versiona checklists e mantém execuções/revisões imutáveis por clínica e sala', () => {
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/CREATE TABLE public\.room_hygiene_checklist_versions/i);
    expect(sql).toMatch(/CREATE TABLE public\.room_hygiene_executions/i);
    expect(sql).toMatch(/CREATE TABLE public\.room_hygiene_audit/i);
    expect(sql).toMatch(/UNIQUE\s*\(clinic_id, version\)/i);
    expect(sql).toMatch(/room_id uuid NOT NULL REFERENCES public\.salas/i);
    expect(sql).toMatch(/checklist_version_id uuid NOT NULL REFERENCES public\.room_hygiene_checklist_versions/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.start_room_hygiene_execution[\s\S]*?SET search_path = ''/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.submit_room_hygiene_execution[\s\S]*?SET search_path = ''/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.review_room_hygiene_execution[\s\S]*?SET search_path = ''/i);
    expect(sql).toMatch(/CREATE TRIGGER room_hygiene_execution_immutable/i);
  });

  it('não libera sala antes da revisão de todos os itens obrigatórios', () => {
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/jsonb_array_elements[\s\S]*?required[\s\S]*?completed/i);
    expect(sql).toMatch(/p_decision = 'approved'[\s\S]*?UPDATE public\.salas[\s\S]*?status = 'disponivel'/i);
    expect(sql).toMatch(/status = 'limpeza'/i);
    expect(sql).toMatch(/OLD\.status = 'limpeza'[\s\S]*?NEW\.status = 'disponivel'[\s\S]*?auth\.uid\(\) IS NOT NULL/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.room_hygiene_executions FROM PUBLIC, anon, authenticated/i);
  });
});
