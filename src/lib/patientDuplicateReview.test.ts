import { describe, expect, it } from 'vitest';
import { maskDuplicateReviewPhone } from './patientDuplicateReview';
import { readFileSync } from 'node:fs';

describe('patient duplicate review', () => {
  it('masks contact numbers in duplicate candidates', () => {
    expect(maskDuplicateReviewPhone('11987654321')).toBe('•••••4321');
    expect(maskDuplicateReviewPhone(null)).toBe('Telefone não informado');
    expect(maskDuplicateReviewPhone('123')).toBe('•••');
  });

  it('checks same-clinic phone/name-and-birthdate matches and requires human confirmation', () => {
    const migration = readFileSync('supabase/migrations/20261014130000_revisao_duplicidade_paciente.sql', 'utf8');
    const page = readFileSync('src/pages/Pacientes.tsx', 'utf8');
    expect(migration).toMatch(/public\.is_same_clinica\(v_clinica_id\)/);
    expect(migration).toMatch(/v_telefone_normalizado/);
    expect(migration).toMatch(/data_nascimento\s*=\s*p_data_nascimento/);
    expect(migration).toMatch(/LIMIT 5/);
    expect(page).toMatch(/rpc\('buscar_possiveis_duplicidades_paciente'/);
    expect(page).toMatch(/Continuar com novo cadastro/);
    expect(page).toMatch(/setSearchTerm\(candidate\.nome\)/);
    expect(page).not.toMatch(/merge.*paciente/i);
  });
});
