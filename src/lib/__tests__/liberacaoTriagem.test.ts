import { describe, it, expect } from 'vitest';
import { passouPelaTriagem } from '@/lib/liberacaoTriagem';

/**
 * Os mesmos cenários que `supabase/verificacoes/trava-triagem.sql` exercita no
 * banco. Se estes testes e aquele arquivo discordarem, a tela e o trigger estão
 * divergindo — e o sintoma seria botão que aparece e falha ao clicar, ou
 * paciente preso na fila sem motivo visível.
 */

const AG = 'ag-1';
const feitas = new Set([AG]);
const nenhuma = new Set<string>();

describe('passouPelaTriagem', () => {
  it('1. clínica não usa triagem: atende', () => {
    expect(passouPelaTriagem(AG, {}, nenhuma, false)).toBe(true);
  });

  it('2. clínica usa e não há triagem: não atende', () => {
    expect(passouPelaTriagem(AG, {}, nenhuma, true)).toBe(false);
  });

  it('3. com triagem registrada: atende', () => {
    expect(passouPelaTriagem(AG, {}, feitas, true)).toBe(true);
  });

  it('4. atendimento marcado como isento: atende', () => {
    expect(passouPelaTriagem(AG, { exige_triagem: false }, nenhuma, true)).toBe(true);
  });

  it('5. liberado com justificativa: atende', () => {
    expect(passouPelaTriagem(AG, { liberado_sem_triagem: true }, nenhuma, true)).toBe(true);
  });

  it('triagem de outro agendamento não libera este', () => {
    expect(passouPelaTriagem(AG, {}, new Set(['ag-2']), true)).toBe(false);
  });

  it('aceita array além de Set', () => {
    expect(passouPelaTriagem(AG, {}, [AG], true)).toBe(true);
    expect(passouPelaTriagem(AG, {}, [], true)).toBe(false);
  });

  it('agendamento não carregado não trava quem já tem triagem', () => {
    expect(passouPelaTriagem(AG, undefined, feitas, true)).toBe(true);
  });
});
