import { describe, expect, it } from 'vitest';
import { podeExcluirExame, proximaAcaoExame } from '../examesWorkflow';

describe('ações do módulo de exames', () => {
  it('reserva exclusão para admin e recepção', () => {
    expect(podeExcluirExame(['admin'])).toBe(true);
    expect(podeExcluirExame(['recepcao'])).toBe(true);
    expect(podeExcluirExame(['medico'])).toBe(false);
    expect(podeExcluirExame(['enfermagem'])).toBe(false);
  });

  it('encaminha etapas de coleta e laudo laboratorial para o módulo Laboratório', () => {
    expect(proximaAcaoExame('agendado', 'laboratorial')).toEqual({ destino: 'laboratorio' });
    expect(proximaAcaoExame('realizado', 'laboratorial')).toEqual({ destino: 'laboratorio' });
  });

  it('mantém o avanço de status para exames não laboratoriais', () => {
    expect(proximaAcaoExame('agendado', 'imagem')).toEqual({ destino: 'status', status: 'realizado' });
    expect(proximaAcaoExame('realizado', 'imagem')).toEqual({ destino: 'status', status: 'laudo_disponivel' });
    expect(proximaAcaoExame('laudo_disponivel', 'imagem')).toEqual({ destino: 'nenhum' });
  });
});
