import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { explicarBloqueioFila } from './filaBloqueio';

const LIBERACAO = 'Liberação excepcional: médico ou administrador, com justificativa registrada.';

describe('explicação do bloqueio na fila', () => {
  it('explica pagamento pendente, quem resolve e quem pode liberar', () => {
    expect(explicarBloqueioFila({ tipo: 'pagamento' })).toEqual({
      motivo: 'Pagamento pendente.',
      resolve: 'A recepção registra o pagamento em Recepção → Balcão.',
      liberacao: LIBERACAO,
    });
  });

  it('não oferece liberação excepcional enquanto a cobrança do check-in não foi confirmada', () => {
    expect(explicarBloqueioFila({ tipo: 'pagamento', cobrancaEstado: 'pendente' })).toEqual({
      motivo: 'Cobrança do check-in ainda não confirmada.',
      resolve: 'A recepção confirma a cobrança em Recepção → Balcão.',
      liberacao: null,
    });
  });

  it('distingue falha de validação de pagamento e de regras da clínica', () => {
    expect(explicarBloqueioFila({ tipo: 'pagamento', erroVerificacao: true }).motivo)
      .toBe('Não foi possível validar o pagamento agora.');
    expect(explicarBloqueioFila({ tipo: 'pagamento', verificando: true }).motivo)
      .toBe('Verificando o pagamento.');
    expect(explicarBloqueioFila({ tipo: 'triagem', erroRegras: true })).toEqual({
      motivo: 'As regras de liberação da clínica não carregaram.',
      resolve: 'Atualize a fila; o atendimento fica bloqueado até a confirmação.',
      liberacao: null,
    });
  });

  it('explica triagem obrigatória', () => {
    expect(explicarBloqueioFila({ tipo: 'triagem' })).toEqual({
      motivo: 'Triagem obrigatória ainda não registrada.',
      resolve: 'Enfermagem, médico ou administrador registra os sinais vitais em Triagem.',
      liberacao: LIBERACAO,
    });
  });

  it('o banco recusa liberação excepcional fora dos perfis explicados', () => {
    const migration = readFileSync('supabase/migrations/20261024100000_liberacao_excepcional_perfis.sql', 'utf8');
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.restringir_liberacao_excepcional\(\)/);
    expect(migration).toMatch(/public\.is_admin\(auth\.uid\(\)\)\s+OR public\.is_medico\(auth\.uid\(\)\)/);
    expect(migration).toMatch(/liberado_sem_pagamento/);
    expect(migration).toMatch(/liberado_sem_triagem/);
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS agendamentos_restringir_liberacao_excepcional/);
    expect(migration).toMatch(/ERRCODE = '42501'/);
  });
});
