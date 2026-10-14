import { afterEach, describe, it, expect } from 'vitest';
import {
  formatCPF,
  formatCNPJ,
  formatPhone,
  formatCEP,
  formatCurrency,
  parseCurrency,
  formatDate,
  formatTime,
  calculateAge,
  getInitials,
  validateCPF,
  validateEmail,
} from '@/lib/formatters';

describe('formatCPF', () => {
  it('formata CPF completo', () => {
    expect(formatCPF('12345678901')).toBe('123.456.789-01');
  });
  it('formata CPF parcial (3 dígitos)', () => {
    expect(formatCPF('123')).toBe('123');
  });
  it('formata CPF parcial (6 dígitos)', () => {
    expect(formatCPF('123456')).toBe('123.456');
  });
  it('formata CPF parcial (9 dígitos)', () => {
    expect(formatCPF('123456789')).toBe('123.456.789');
  });
  it('remove caracteres não numéricos', () => {
    expect(formatCPF('123.456.789-01')).toBe('123.456.789-01');
  });
  it('string vazia retorna vazio', () => {
    expect(formatCPF('')).toBe('');
  });
  it('trunca após 11 dígitos', () => {
    expect(formatCPF('123456789012345')).toBe('123.456.789-01');
  });
});

describe('formatCNPJ', () => {
  it('formata CNPJ completo', () => {
    expect(formatCNPJ('12345678000190')).toBe('12.345.678/0001-90');
  });
  it('formata parcial', () => {
    expect(formatCNPJ('12345')).toBe('12.345');
  });
  it('string vazia', () => {
    expect(formatCNPJ('')).toBe('');
  });
});

describe('formatPhone', () => {
  it('formata celular 11 dígitos', () => {
    expect(formatPhone('11999887766')).toBe('(11) 99988-7766');
  });
  it('formata fixo 10 dígitos', () => {
    expect(formatPhone('1133445566')).toBe('(11) 3344-5566');
  });
  it('string vazia', () => {
    expect(formatPhone('')).toBe('');
  });
  it('parcial DDD', () => {
    expect(formatPhone('11')).toBe('(11');
  });
});

describe('formatCEP', () => {
  it('formata CEP completo', () => {
    expect(formatCEP('01310100')).toBe('01310-100');
  });
  it('parcial', () => {
    expect(formatCEP('01310')).toBe('01310');
  });
  it('vazio', () => {
    expect(formatCEP('')).toBe('');
  });
});

describe('formatCurrency', () => {
  it('formata valor positivo', () => {
    const result = formatCurrency(1500.5);
    expect(result).toContain('1.500,50');
  });
  it('formata zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0,00');
  });
  it('formata negativo', () => {
    const result = formatCurrency(-100);
    expect(result).toContain('100,00');
  });
});

describe('parseCurrency', () => {
  it('converte formato BR', () => {
    expect(parseCurrency('R$ 1.500,50')).toBe(1500.5);
  });
  it('retorna 0 para inválido', () => {
    expect(parseCurrency('abc')).toBe(0);
  });
  it('string vazia', () => {
    expect(parseCurrency('')).toBe(0);
  });
});

describe('formatDate', () => {
  afterEach(() => { delete document.documentElement.dataset.dateFormat; });
  it('formato short', () => {
    const result = formatDate('2024-01-15', 'short');
    expect(result).toMatch(/15/);
  });
  it('formato iso', () => {
    expect(formatDate('2024-01-15T10:00:00Z', 'iso')).toBe('2024-01-15');
  });
  it('usa o formato curto de data escolhido nas preferências', () => {
    document.documentElement.dataset.dateFormat = 'YYYY-MM-DD';
    expect(formatDate('2024-01-15', 'short')).toBe('2024-01-15');
  });
  it('aceita Date object', () => {
    const d = new Date(2024, 0, 15);
    expect(formatDate(d, 'iso')).toBe('2024-01-15');
  });
});

describe('formatTime', () => {
  it('formata horário de string', () => {
    const result = formatTime('2024-01-15T14:30:00Z');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe('calculateAge', () => {
  it('calcula idade corretamente', () => {
    const age = calculateAge('2000-01-01');
    expect(age).toBeGreaterThanOrEqual(24);
  });
});

describe('getInitials', () => {
  it('retorna iniciais de nome completo', () => {
    expect(getInitials('Maria Silva')).toBe('MS');
  });
  it('retorna uma letra para nome simples', () => {
    expect(getInitials('Ana')).toBe('A');
  });
  it('limita a 2 iniciais', () => {
    expect(getInitials('Maria da Silva Santos')).toBe('MD');
  });
});

describe('validateCPF', () => {
  it('CPF válido retorna true', () => {
    expect(validateCPF('529.982.247-25')).toBe(true);
  });
  it('CPF inválido retorna false', () => {
    expect(validateCPF('111.111.111-11')).toBe(false);
  });
  it('CPF com menos dígitos retorna false', () => {
    expect(validateCPF('123')).toBe(false);
  });
});

describe('validateEmail', () => {
  it('email válido', () => {
    expect(validateEmail('test@test.com')).toBe(true);
  });
  it('email inválido', () => {
    expect(validateEmail('invalid')).toBe(false);
  });
  it('email sem domínio', () => {
    expect(validateEmail('test@')).toBe(false);
  });
});
