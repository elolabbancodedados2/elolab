import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261011240000_financeiro_integridade_e_gravacao_controlada.sql';
const migration = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('integridade das gravações financeiras', () => {
  it('bloqueia alterações diretas em pagamentos e valida a clínica das linhas vinculadas', () => {
    expect(migration).toMatch(/REVOKE\s+UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.pagamentos\s+FROM\s+authenticated/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS pagamentos_update ON public\.pagamentos/i);
    expect(migration).toMatch(/CREATE TRIGGER lancamento_itens_validar_clinica_lancamento/i);
    expect(migration).toMatch(/CREATE TRIGGER pagamentos_validar_clinica_lancamento/i);
  });

  it('obriga a transição e a baixa dos repasses a passar pela RPC atômica', () => {
    expect(migration).toMatch(/REVOKE\s+INSERT\s*,\s*UPDATE\s+ON\s+TABLE\s+public\.repasses_medicos\s+FROM\s+authenticated/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS repasses_financeiro_update ON public\.repasses_medicos/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.aprovar_repasse_medico/i);
    expect(migration).toMatch(/COMMENT ON FUNCTION public\.aprovar_repasse_medico/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.validar_origem_quitada_repasse/i);
    expect(migration).toMatch(/NEW\.status NOT IN \('aprovado', 'pago'\)[\s\S]*FOR UPDATE/i);
    expect(migration).toMatch(/CREATE TRIGGER repasses_validar_origem_quitada/i);
  });
  it('protege status e valores pagos de UPDATE direto e valida limites na RPC', () => {
    const hardeningPath = 'supabase/migrations/20261011270000_proteger_lancamentos_e_limites_de_desconto.sql';
    const hardening = existsSync(hardeningPath) ? readFileSync(hardeningPath, 'utf8') : '';
    expect(hardening).toMatch(/REVOKE\s+UPDATE\s+ON\s+TABLE\s+public\.lancamentos\s+FROM\s+authenticated/i);
    expect(hardening).toMatch(/GRANT\s+UPDATE\s*\(descricao,\s*valor,\s*forma_pagamento,\s*desconto,\s*acrescimo,\s*observacoes\)\s+ON\s+TABLE\s+public\.lancamentos\s+TO\s+authenticated/i);
    expect(hardening).toMatch(/CREATE OR REPLACE FUNCTION public\.cancelar_lancamento_pendente/i);
    expect(hardening).toMatch(/CREATE OR REPLACE FUNCTION public\.marcar_atendimento_nao_realizado[\s\S]*SECURITY DEFINER[\s\S]*p_clinica_id IS DISTINCT FROM public\.get_my_clinica_id\(\)/i);
    expect(hardening).toMatch(/NEW\.desconto[\s\S]*NEW\.valor\s*\*\s*0\.50/i);
    expect(hardening).toMatch(/NEW\.acrescimo[\s\S]*NEW\.valor\s*\*\s*0\.30/i);
  });
  it('restringe a inclusão de pagamentos ao RPC com escopo de clínica validado', () => {
    const controlledPaymentsPath = 'supabase/migrations/20261011310000_pagamentos_insercao_controlada.sql';
    const controlledPayments = existsSync(controlledPaymentsPath) ? readFileSync(controlledPaymentsPath, 'utf8') : '';
    expect(controlledPayments).toMatch(/REVOKE\s+INSERT\s+ON\s+TABLE\s+public\.pagamentos\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i);
    expect(controlledPayments).toMatch(/DROP POLICY IF EXISTS pagamentos_insert ON public\.pagamentos/i);
    expect(controlledPayments).toMatch(/SECURITY DEFINER[\s\S]*can_access_financial\(auth\.uid\(\)\)[\s\S]*is_recepcao\(auth\.uid\(\)\)/i);
    expect(controlledPayments).toMatch(/v_conta\.clinica_id IS DISTINCT FROM v_clinica_id/i);
  });
});
