import { describe, expect, it } from 'vitest';
import { parseResultadoNumerico, podeRetificarResultado, deveNotificarRetificacao, perfilPodeRetificarResultado } from '../laudoWorkflow';

describe('correção de resultados laboratoriais', () => {
  it('interpreta resultados decimais brasileiros e americanos sem inventar números', () => {
    expect(parseResultadoNumerico('1.234,56 mg/dL')).toBe(1234.56);
    expect(parseResultadoNumerico('1,234.56 mg/dL')).toBe(1234.56);
    expect(parseResultadoNumerico('13,8')).toBe(13.8);
    expect(parseResultadoNumerico('qualitativo')).toBeNull();
    expect(parseResultadoNumerico(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('permite correção antes da liberação apenas após validação técnica', () => {
    expect(podeRetificarResultado('validado', false)).toBe(true);
    expect(podeRetificarResultado('liberado', true)).toBe(true);
    expect(podeRetificarResultado('em_analise', false)).toBe(false);
    expect(podeRetificarResultado('cancelado', false)).toBe(false);
  });

  it('só notifica paciente se a correção alterar um resultado já liberado', () => {
    expect(deveNotificarRetificacao(true, false)).toBe(true);
    expect(deveNotificarRetificacao(false, false)).toBe(false);
  });

  it('usa o estado persistido após a RPC para decidir a notificação da retificação', () => {
    expect(deveNotificarRetificacao(true, false)).toBe(true);
    expect(deveNotificarRetificacao(false, true)).toBe(false);
    expect(deveNotificarRetificacao(null, true)).toBe(true);
    expect(deveNotificarRetificacao(null, false)).toBe(false);
  });

  it('respeita os perfis autorizados pela RPC para retificar resultados validados', () => {
    expect(perfilPodeRetificarResultado(['admin'])).toBe(true);
    expect(perfilPodeRetificarResultado(['enfermagem'])).toBe(true);
    expect(perfilPodeRetificarResultado(['medico'])).toBe(false);
    expect(perfilPodeRetificarResultado(['recepcao'])).toBe(false);
  });
});
