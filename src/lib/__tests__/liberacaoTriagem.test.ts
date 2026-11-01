import { describe, it, expect } from 'vitest';
import { aguardaTriagemAntesDoInicio, passouPelaTriagem } from '@/lib/liberacaoTriagem';

/**
 * Os mesmos cenÃ¡rios que `supabase/verificacoes/trava-triagem.sql` exercita no
 * banco. Se estes testes e aquele arquivo discordarem, a tela e o trigger estÃ£o
 * divergindo â€” e o sintoma seria botÃ£o que aparece e falha ao clicar, ou
 * paciente preso na fila sem motivo visÃ­vel.
 */

const AG = 'ag-1';
const feitas = new Set([AG]);
const nenhuma = new Set<string>();

describe('passouPelaTriagem', () => {
  it('1. clÃ­nica nÃ£o usa triagem: atende', () => {
    expect(passouPelaTriagem(AG, {}, nenhuma, false)).toBe(true);
  });

  it('2. clÃ­nica usa e nÃ£o hÃ¡ triagem: nÃ£o atende', () => {
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

  it('triagem de outro agendamento nÃ£o libera este', () => {
    expect(passouPelaTriagem(AG, {}, new Set(['ag-2']), true)).toBe(false);
  });

  it('aceita array alÃ©m de Set', () => {
    expect(passouPelaTriagem(AG, {}, [AG], true)).toBe(true);
    expect(passouPelaTriagem(AG, {}, [], true)).toBe(false);
  });

  it('agendamento nÃ£o carregado nÃ£o trava quem jÃ¡ tem triagem', () => {
    expect(passouPelaTriagem(AG, undefined, feitas, true)).toBe(true);
  });
});

describe('aguardaTriagemAntesDoInicio', () => {
  it('nÃ£o bloqueia quando a clÃ­nica nÃ£o exige triagem', () => {
    expect(aguardaTriagemAntesDoInicio({ status: 'confirmado', exige_triagem: true }, false)).toBe(false);
  });

  it('bloqueia o inÃ­cio direto da Agenda antes do check-in', () => {
    expect(aguardaTriagemAntesDoInicio({ status: 'agendado', exige_triagem: true }, true)).toBe(true);
    expect(aguardaTriagemAntesDoInicio({ status: 'confirmado' }, true)).toBe(true);
  });

  it('respeita isenÃ§Ã£o e liberaÃ§Ã£o sem triagem', () => {
    expect(aguardaTriagemAntesDoInicio({ status: 'confirmado', exige_triagem: false }, true)).toBe(false);
    expect(aguardaTriagemAntesDoInicio({ status: 'confirmado', liberado_sem_triagem: true }, true)).toBe(false);
  });

  it('nÃ£o decide depois do check-in, quando a triagem jÃ¡ pode existir', () => {
    expect(aguardaTriagemAntesDoInicio({ status: 'aguardando', exige_triagem: true }, true)).toBe(false);
  });
});
