import { describe, it, expect } from 'vitest';
import { mensagemDeErro, detalheTecnico } from '../erros';

describe('mensagemDeErro', () => {
  it('traduz coluna obrigatória usando o nome que aparece na tela', () => {
    // Erro real que apareceu ao gravar triagem sem o profissional.
    expect(
      mensagemDeErro({
        code: '23502',
        message: 'null value in column "enfermeiro_id" of relation "triagens" violates not-null constraint',
      })
    ).toBe('Falta preencher: profissional responsável.');
  });

  it('traduz duplicidade citando o campo', () => {
    expect(
      mensagemDeErro({ code: '23505', message: 'duplicate key value violates unique constraint, Key (cpf)=(1) already exists' })
    ).toBe('Já existe um registro com esse CPF.');
  });

  it('traduz falta de permissão sem falar em RLS', () => {
    const msg = mensagemDeErro({ code: '42501', message: 'permission denied for function has_any_role' });
    expect(msg).toContain('não tem permissão');
    expect(msg).not.toContain('has_any_role');
  });

  it('reconhece falta de permissão mesmo sem código', () => {
    expect(mensagemDeErro({ message: 'new row violates row-level security policy' }))
      .toContain('não tem permissão');
  });

  it('traduz senha fraca com a regra concreta', () => {
    expect(mensagemDeErro({ message: 'Password should be at least 10 characters' }))
      .toContain('10 caracteres');
  });

  it('preserva mensagem própria do app, que é mais específica', () => {
    const proprio = new Error('Informe data e hora');
    expect(mensagemDeErro(proprio)).toBe('Informe data e hora');
  });

  it('nunca devolve vazio', () => {
    for (const entrada of [null, undefined, {}, '', 0]) {
      expect(mensagemDeErro(entrada).length).toBeGreaterThan(0);
    }
  });

  it('não vaza objeto cru na tela', () => {
    expect(mensagemDeErro({ foo: 'bar' })).not.toContain('[object');
  });
});

describe('detalheTecnico', () => {
  it('junta código e detalhe para quem for investigar', () => {
    expect(detalheTecnico({ code: '23503', details: 'Key (item_id) is not present' }))
      .toBe('23503 — Key (item_id) is not present');
  });

  it('fica de fora quando não há nada técnico a mostrar', () => {
    expect(detalheTecnico(new Error('qualquer'))).toBeUndefined();
  });
});
