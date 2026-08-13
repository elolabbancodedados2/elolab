import { describe, it, expect } from 'vitest';
import { pacienteCorresponde, normalizarTexto, apenasDigitos } from '@/lib/buscaPaciente';

/**
 * A busca comparava texto cru contra campos mascarados. A recepcionista lia o
 * CPF do documento, digitava sem pontos e não achava ninguém — então cadastrava
 * o paciente de novo. Duplicata de paciente racha o histórico clínico em dois.
 */
const JOSE = {
  nome: 'José Antônio da Silva',
  cpf: '123.456.789-00',
  telefone: '(11) 98888-7777',
  email: 'jose@exemplo.com',
};

describe('busca por CPF', () => {
  it('acha digitando o CPF sem máscara, como está no documento', () => {
    expect(pacienteCorresponde(JOSE, '12345678900')).toBe(true);
  });

  it('acha digitando o CPF com máscara', () => {
    expect(pacienteCorresponde(JOSE, '123.456.789-00')).toBe(true);
  });

  it('acha por pedaço do CPF', () => {
    expect(pacienteCorresponde(JOSE, '456789')).toBe(true);
  });

  it('não acha CPF de outra pessoa', () => {
    expect(pacienteCorresponde(JOSE, '99999999999')).toBe(false);
  });
});

describe('busca por telefone', () => {
  it('acha digitando o telefone sem máscara', () => {
    expect(pacienteCorresponde(JOSE, '11988887777')).toBe(true);
  });

  it('acha só pelo número, sem DDD', () => {
    expect(pacienteCorresponde(JOSE, '988887777')).toBe(true);
  });
});

describe('busca por nome', () => {
  it('acha sem acento', () => {
    expect(pacienteCorresponde(JOSE, 'jose')).toBe(true);
    expect(pacienteCorresponde(JOSE, 'jose antonio')).toBe(true);
  });

  it('acha com acento', () => {
    expect(pacienteCorresponde(JOSE, 'José')).toBe(true);
  });

  it('acha pelo sobrenome', () => {
    expect(pacienteCorresponde(JOSE, 'silva')).toBe(true);
  });

  it('ignora caixa', () => {
    expect(pacienteCorresponde(JOSE, 'ANTONIO')).toBe(true);
  });

  it('acha pelo nome social', () => {
    const maria = { nome: 'João Pereira', nome_social: 'Maria Pereira' };
    expect(pacienteCorresponde(maria, 'maria')).toBe(true);
  });

  it('não acha quem não corresponde', () => {
    expect(pacienteCorresponde(JOSE, 'carlos')).toBe(false);
  });
});

describe('casos de borda do balcão', () => {
  it('termo vazio devolve todo mundo', () => {
    expect(pacienteCorresponde(JOSE, '')).toBe(true);
    expect(pacienteCorresponde(JOSE, '   ')).toBe(true);
  });

  it('paciente sem CPF nem telefone não quebra a busca', () => {
    const semDados = { nome: 'Recém-cadastrado' };
    expect(pacienteCorresponde(semDados, '12345678900')).toBe(false);
    expect(pacienteCorresponde(semDados, 'recem')).toBe(true);
  });

  it('termo numérico não casa por nome', () => {
    const numerico = { nome: 'Paciente 123', cpf: '999.888.777-66' };
    expect(pacienteCorresponde(numerico, '123')).toBe(false);
  });

  it('acha por e-mail', () => {
    expect(pacienteCorresponde(JOSE, 'jose@exemplo')).toBe(true);
  });
});

describe('normalizarTexto', () => {
  it('remove acento e baixa a caixa', () => {
    expect(normalizarTexto('José Antônio')).toBe('jose antonio');
    expect(normalizarTexto('ÇÃO')).toBe('cao');
  });

  it('trata nulo e indefinido', () => {
    expect(normalizarTexto(null)).toBe('');
    expect(normalizarTexto(undefined)).toBe('');
  });
});

describe('apenasDigitos', () => {
  it('tira máscara de CPF e telefone', () => {
    expect(apenasDigitos('123.456.789-00')).toBe('12345678900');
    expect(apenasDigitos('(11) 98888-7777')).toBe('11988887777');
  });

  it('trata nulo', () => {
    expect(apenasDigitos(null)).toBe('');
  });
});
