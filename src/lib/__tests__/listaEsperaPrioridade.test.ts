import { describe, expect, it } from 'vitest';
import { getPrioridadeListaEspera, PRIORIDADES_LISTA_ESPERA } from '@/lib/listaEsperaPrioridade';

describe('prioridade da lista de espera', () => {
  it('segue o domínio persistido no banco', () => {
    expect(PRIORIDADES_LISTA_ESPERA).toEqual(['normal', 'preferencial', 'urgente']);
    expect(getPrioridadeListaEspera('normal')).toMatchObject({ value: 'normal', label: 'Normal' });
    expect(getPrioridadeListaEspera('preferencial')).toMatchObject({ value: 'preferencial', label: 'Preferencial' });
    expect(getPrioridadeListaEspera('preferencial').className).toContain('text-info');
    expect(getPrioridadeListaEspera('urgente')).toMatchObject({ value: 'urgente', label: 'Urgente' });
    expect(getPrioridadeListaEspera('urgente').className).toContain('text-destructive');
  });

  it('trata vazio como o default normal do banco', () => {
    expect(getPrioridadeListaEspera(null)).toMatchObject({ value: 'normal', label: 'Normal' });
    expect(getPrioridadeListaEspera('')).toMatchObject({ value: 'normal', label: 'Normal' });
  });

  it('sinaliza valor fora do domínio sem confundir com prioridade real', () => {
    const info = getPrioridadeListaEspera('alta');
    expect(info.value).toBeNull();
    expect(info.label).toBe('Prioridade desconhecida (alta)');
    expect(info.className).not.toContain('text-destructive');
    expect(info.className).not.toContain('text-info');
  });
});
