import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261014220000_patrimonio_manutencao_equipamentos.sql';

describe('patrimônio e manutenção de equipamentos da clínica', () => {
  it('mantém ativos gerais separados dos analisadores cadastrados pelo laboratório', () => {
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/CREATE TABLE public\.clinic_equipment_assets/i);
    expect(sql).toMatch(/CREATE TABLE public\.clinic_equipment_work_orders/i);
    expect(sql).toMatch(/CREATE TABLE public\.clinic_equipment_documents/i);
    expect(sql).toMatch(/CREATE TABLE public\.clinic_equipment_audit/i);
    expect(sql).toMatch(/CREATE POLICY clinic_equipment_docs_upload/i);
    expect(sql).toMatch(/CREATE TRIGGER clinic_equipment_block_room/i);
    expect(sql).toMatch(/protect_room_hygiene_room_release[\s\S]*?clinic_equipment_assets/i);
    expect(sql).not.toMatch(/ALTER TABLE public\.laboratorio_equipamentos|DROP TABLE public\.laboratorio_equipamentos/i);
  });

  it('isola dados por clínica, protege histórico e impede disponibilidade com ativo bloqueado', () => {
    const sql = readFileSync(path, 'utf8');
    for (const table of ['clinic_equipment_assets', 'clinic_equipment_work_orders', 'clinic_equipment_documents', 'clinic_equipment_audit']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, 'i'));
      expect(sql).toMatch(new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`, 'i'));
    }
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.validate_clinic_equipment_asset[\s\S]*?SET search_path = ''/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.validate_clinic_equipment_document[\s\S]*?clinic_id/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.protect_room_equipment_availability[\s\S]*?status = 'disponivel'[\s\S]*?block_room_when_unavailable/i);
    expect(sql).toMatch(/clinic_equipment_audit_no_delete/i);
  });
});
