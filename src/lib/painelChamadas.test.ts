import { beforeEach, describe, expect, it } from 'vitest';
import {
  chaveChamada, fraseChamada, lerChamadasAnunciadas, lerChamadasRecentes, lerFiltroPainel,
  registrarChamadaRecente, salaNoFiltro, salvarChamadasAnunciadas, salvarChamadasRecentes,
  type ChamadaRecente,
} from './painelChamadas';

describe('chamadas já anunciadas no painel', () => {
  beforeEach(() => localStorage.clear());

  it('identifica cada chamada pela linha e pelo instante da chamada', () => {
    expect(chaveChamada({ id: 'f1', updated_at: '2026-10-24T13:00:00Z', horario_chegada: 'x' })).toBe('f1:2026-10-24T13:00:00Z');
    expect(chaveChamada({ id: 'f1', updated_at: null, horario_chegada: '2026-10-24T12:00:00Z' })).toBe('f1:2026-10-24T12:00:00Z');
  });

  it('sobrevive à recarga do painel, separado por clínica', () => {
    salvarChamadasAnunciadas('c1', ['f1:t1', 'f2:t2']);
    expect([...lerChamadasAnunciadas('c1')]).toEqual(['f1:t1', 'f2:t2']);
    expect(lerChamadasAnunciadas('c2').size).toBe(0);
  });

  it('tolera armazenamento corrompido ou bloqueado', () => {
    localStorage.setItem('elolab:painel-tv:chamadas-anunciadas:c1', '{nao-json');
    expect(lerChamadasAnunciadas('c1').size).toBe(0);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('bloqueado'); };
    try {
      expect(() => salvarChamadasAnunciadas('c1', ['f1:t1'])).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('frase da chamada', () => {
  it('usa o artigo certo pelo nome da sala', () => {
    expect(fraseChamada('N001', 'Consultório 2')).toBe('Senha N001, por favor dirija-se ao Consultório 2.');
    expect(fraseChamada('N001', 'Sala 3')).toBe('Senha N001, por favor dirija-se à Sala 3.');
    expect(fraseChamada('N001', 'Recepção')).toBe('Senha N001, por favor dirija-se à Recepção.');
  });

  it('dispensa a preposição quando não sabe o gênero', () => {
    expect(fraseChamada('N001', 'Dr. Ana')).toBe('Senha N001. Local: Dr. Ana.');
  });
});

describe('filtro do painel por sala ou setor', () => {
  it('sem parâmetros não filtra', () => {
    expect(lerFiltroPainel('')).toBeNull();
    expect(salaNoFiltro(null, null)).toBe(true);
  });

  it('aceita ids de sala e setor sem acento', () => {
    const filtro = lerFiltroPainel('?salas=s1,s2&setor=Triagem');
    expect(salaNoFiltro(filtro, { id: 's1' })).toBe(true);
    expect(salaNoFiltro(filtro, { id: 's9', tipo: 'triagem' })).toBe(true);
    expect(salaNoFiltro(filtro, { id: 's9', tipo: 'consultorio' })).toBe(false);
    expect(salaNoFiltro(filtro, null)).toBe(false);
    expect(salaNoFiltro(lerFiltroPainel('?setor=consultorio'), { id: 'x', setor: 'Consultório' })).toBe(true);
  });
});

describe('últimas chamadas', () => {
  beforeEach(() => localStorage.clear());

  it('mantém as mais recentes primeiro, sem repetir e com limite', () => {
    let lista: ChamadaRecente[] = [];
    for (let i = 1; i <= 7; i += 1) lista = registrarChamadaRecente(lista, { chave: `k${i}`, senha: `S${i}`, sala: 'Sala', em: '' });
    expect(lista.map(item => item.chave)).toEqual(['k7', 'k6', 'k5', 'k4', 'k3']);
    lista = registrarChamadaRecente(lista, { chave: 'k5', senha: 'S5', sala: 'Sala', em: '' });
    expect(lista.map(item => item.chave)).toEqual(['k5', 'k7', 'k6', 'k4', 'k3']);
  });

  it('descarta chamadas guardadas de outro dia', () => {
    salvarChamadasRecentes('c1', '2026-11-01', [{ chave: 'k', senha: 'S', sala: 'Sala', em: '' }]);
    expect(lerChamadasRecentes('c1', '2026-11-01')).toHaveLength(1);
    expect(lerChamadasRecentes('c1', '2026-11-02')).toEqual([]);
  });
});
