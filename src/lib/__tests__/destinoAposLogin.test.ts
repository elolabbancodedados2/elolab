import { describe, expect, it } from 'vitest';
import { destinoAposLogin } from '../destinoAposLogin';

describe('destino após o login', () => {
  it('volta para a página interna guardada pela rota protegida', () => {
    expect(destinoAposLogin({ pathname: '/pacientes/p1', search: '?aba=historico', hash: '' })).toBe('/pacientes/p1?aba=historico');
    expect(destinoAposLogin('/agenda')).toBe('/agenda');
  });

  it('ignora destinos externos, a própria tela de login e valores inválidos', () => {
    expect(destinoAposLogin('https://golpe.example')).toBe('/dashboard');
    expect(destinoAposLogin('//golpe.example/x')).toBe('/dashboard');
    expect(destinoAposLogin('/\\golpe.example')).toBe('/dashboard');
    expect(destinoAposLogin({ pathname: '/auth', search: '?x=1' })).toBe('/dashboard');
    expect(destinoAposLogin('/login')).toBe('/dashboard');
    expect(destinoAposLogin(undefined)).toBe('/dashboard');
    expect(destinoAposLogin({ pathname: 42 })).toBe('/dashboard');
  });
});
