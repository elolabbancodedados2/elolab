import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MERGE_FIELDS, describeDuplicateReasons, diffPatientFields } from './patientMerge';

const migration = readFileSync('supabase/migrations/20261024110000_duplicidades_e_mesclagem_pacientes.sql', 'utf8');

describe('patient duplicate detection and merge', () => {
  it('lists only fields that differ and that the source can contribute', () => {
    const diff = diffPatientFields(
      { nome: 'Ana Souza', telefone: '11999990000', email: null, cidade: 'Santos', id: 'd' },
      { nome: 'Ana Sousa', telefone: '11988887777', email: 'ana@exemplo.com', cidade: '', id: 'o' },
    );
    expect(diff.map(item => item.campo)).toEqual(['nome', 'telefone', 'email']);
    expect(diff.find(item => item.campo === 'email')).toMatchObject({ destino: null, origem: 'ana@exemplo.com' });
  });

  it('describes the matching reasons in plain language', () => {
    expect(describeDuplicateReasons(['cpf', 'telefone'])).toBe('CPF igual · Telefone igual');
    expect(describeDuplicateReasons(['nome_data_nascimento'])).toBe('Nome e nascimento iguais');
  });

  it('scores CPF, phone and name/birth date inside the clinic with a configurable threshold', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.listar_duplicidades_pacientes\(\s*p_limiar integer/);
    expect(migration).toMatch(/p_limiar < 20 OR p_limiar > 100/);
    expect(migration).toMatch(/a\.cpf = b\.cpf/);
    expect(migration).toMatch(/a\.tel = b\.tel/);
    expect(migration).toMatch(/a\.nome_n = b\.nome_n/);
    expect(migration).toMatch(/p\.clinica_id = v_clinica_id/);
    expect(migration).toMatch(/pacientes_duplicidade_descartes/);
  });

  it('merges through an admin RPC that keeps clinical records, audits and inactivates the source', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.mesclar_pacientes\(/);
    expect(migration).toMatch(/public\.is_admin\(v_user_id\)/);
    expect(migration).toMatch(/FOR UPDATE/);
    expect(migration).toMatch(/INSERT INTO public\.pacientes_mesclagens/);
    expect(migration).toMatch(/INSERT INTO public\.paciente_status_eventos/);
    expect(migration).toMatch(/INSERT INTO public\.audit_log/);
    expect(migration).toMatch(/SET ativo = false, mesclado_em_paciente_id = p_destino/);
    expect(migration).toMatch(/UPDATE public\.paciente_portal_tokens/);
    expect(migration).not.toMatch(/DELETE FROM public\.(pacientes|prontuarios|agendamentos)/i);
    for (const field of MERGE_FIELDS.map(item => item.campo)) {
      expect(migration).toContain(`'${field}'`);
    }
  });
});
