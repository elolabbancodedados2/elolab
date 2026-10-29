import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20261011340000_equipe_privacidade_campos.sql');
const migration = readFileSync(migrationPath, 'utf8').toLowerCase();
const useSupabaseData = readFileSync(resolve(process.cwd(), 'src/hooks/useSupabaseData.ts'), 'utf8');
const medicosPage = readFileSync(resolve(process.cwd(), 'src/pages/Medicos.tsx'), 'utf8');
const funcionariosPage = readFileSync(resolve(process.cwd(), 'src/pages/Funcionarios.tsx'), 'utf8');
const chatPage = readFileSync(resolve(process.cwd(), 'src/pages/ChatInterno.tsx'), 'utf8');
const repassesPage = readFileSync(resolve(process.cwd(), 'src/pages/RepassesMedicos.tsx'), 'utf8');
const planLimits = readFileSync(resolve(process.cwd(), 'src/hooks/usePlanLimits.ts'), 'utf8');
const patientsPage = readFileSync(resolve(process.cwd(), 'src/pages/Pacientes.tsx'), 'utf8');
const reportsPage = readFileSync(resolve(process.cwd(), 'src/pages/Relatorios.tsx'), 'utf8');

describe('Equipe: privacidade de dados pessoais', () => {
  it('remove leitura ampla e concede somente colunas operacionais às tabelas base', () => {
    expect(migration).toMatch(/revoke\s+select\s+on\s+table\s+public\.medicos\s+from\s+public,\s*anon,\s*authenticated/);
    expect(migration).toMatch(/revoke\s+select\s+on\s+table\s+public\.funcionarios\s+from\s+public,\s*anon,\s*authenticated/);
    expect(migration).toMatch(/drop\s+policy\s+if\s+exists\s+"medicos_select"/);
    expect(migration).toMatch(/create\s+policy\s+"medicos_select"[\s\S]*?public\.has_any_role\(auth\.uid\(\)\)[\s\S]*?clinica_id\s*=\s*public\.get_my_clinica_id\(\)/);
    expect(migration).toMatch(/grant\s+select\s*\([^;]*\)\s*on\s+table\s+public\.medicos\s+to\s+authenticated/s);
    expect(migration).toMatch(/grant\s+select\s*\([^;]*\)\s*on\s+table\s+public\.funcionarios\s+to\s+authenticated/s);
    expect(migration).not.toMatch(/grant\s+select\s+on\s+table\s+public\.(medicos|funcionarios)\s+to\s+authenticated/);
    const medicoGrant = migration.match(/grant\s+select\s*\(([^)]*)\)\s*on\s+table\s+public\.medicos\s+to\s+authenticated/s)?.[1] ?? '';
    expect(medicoGrant).not.toMatch(/cpf|data_nascimento|cns|carimbo_url|email|telefone|user_id|repasse/);
  });

  it('permite leitura pessoal de funcionário só ao admin ou ao próprio usuário', () => {
    expect(migration).toMatch(/create\s+policy\s+"funcionarios_select"[\s\S]*?public\.is_admin\(auth\.uid\(\)\)\s+or\s+user_id\s*=\s*auth\.uid\(\)/);
    expect(migration).toMatch(/drop\s+policy\s+if\s+exists\s+"anon_select_funcionarios_for_invite"/);
  });

  it('entrega detalhes de médicos e funcionários por RPC administrativa com escopo da clínica', () => {
    for (const fn of ['listar_medicos_equipe_admin', 'listar_funcionarios_equipe_admin']) {
      expect(migration).toContain(`create or replace function public.${fn}()`);
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon`));
    }
    expect(migration.match(/security definer/g)).toHaveLength(7);
    expect(migration.match(/public\.is_admin\(auth\.uid\(\)\)/g)).toHaveLength(5);
    expect(migration.match(/clinica_id\s*=\s*public\.get_my_clinica_id\(\)/g)).toHaveLength(10);
    expect(migration).toContain('public.buscar_medico_atual()');
    expect(migration).toContain('public.buscar_contato_medico_notificacao(p_medico_id uuid)');
    expect(migration).toMatch(/clinica_id\s*=\s*public\.get_my_clinica_id\(\)[\s\S]*?clinica_id\s*=\s*public\.get_my_clinica_id\(\)/);
  });

  it('usa RPCs estreitas para repasses, chat e limites do plano', () => {
    expect(migration).toContain('public.listar_medicos_repasse_equipe()');
    expect(migration).toContain('public.listar_funcionarios_chat_equipe()');
    expect(migration).toContain('public.contar_equipe_ativa()');
    expect(migration).toMatch(/public\.is_financeiro\(auth\.uid\(\)\)/);
    expect(migration).toMatch(/public\.has_any_role\(auth\.uid\(\)\)/);
  });

  it('mantém os consumidores nas projeções e RPCs autorizadas', () => {
    expect(useSupabaseData).not.toContain('medicos(*)');
    expect(useSupabaseData).toMatch(/'id, nome, crm/);
    expect(patientsPage).toMatch(/useSupabaseQuery<any>\('medicos', \{ select: 'id, nome, crm, especialidade'/);
    expect(reportsPage).toMatch(/medicosQuery\s*=\s*useMedicos\(/);
    expect(medicosPage).toContain("rpc('listar_medicos_equipe_admin')");
    expect(funcionariosPage).toContain("rpc('listar_funcionarios_equipe_admin')");
    expect(chatPage).toContain("rpc('listar_funcionarios_chat_equipe')");
    expect(repassesPage).toContain("rpc('listar_medicos_repasse_equipe')");
    expect(planLimits).toContain("rpc('uso_plano_clinica')");
  });

  it('associa os rótulos dos formulários de equipe aos controles', () => {
    for (const id of ['medico-nome', 'medico-cpf', 'medico-nascimento', 'medico-email', 'medico-telefone', 'medico-tipo-registro', 'medico-crm', 'medico-uf', 'medico-rqe', 'medico-cns', 'medico-intervalo', 'medico-especialidade']) {
      expect(medicosPage).toContain(`htmlFor="${id}"`);
      expect(medicosPage).toContain(`id="${id}"`);
    }
    for (const id of ['func-tipo', 'func-nome', 'func-cpf', 'func-data-nascimento', 'func-email', 'func-telefone', 'func-registro', 'func-conselho', 'func-uf', 'func-especialidade', 'func-cargo', 'func-departamento', 'func-turno', 'func-carga-horaria', 'func-ativo']) {
      expect(funcionariosPage).toContain(`htmlFor="${id}"`);
      expect(funcionariosPage).toContain(`id="${id}"`);
    }
  });
});

