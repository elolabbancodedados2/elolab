import { describe, expect, it } from 'vitest';
import { gravarFiltrosExames, lerFiltrosExames } from '@/lib/examesFiltros';

describe('filtros de exames na URL', () => {
  it('restaura status, tipo e indicador válidos após recarregar', () => {
    const filtros = lerFiltrosExames(new URLSearchParams('status=agendado&tipo=Hemograma&indicador=criticos&paciente=p1'));
    expect(filtros).toEqual({ status: 'agendado', tipo: 'Hemograma', indicador: 'criticos' });
  });

  it('ignora valores desconhecidos e volta ao padrão', () => {
    expect(lerFiltrosExames(new URLSearchParams('status=apagado&indicador=xyz&tipo=' + 'a'.repeat(200))))
      .toEqual({ status: 'todos', tipo: 'todos', indicador: 'todos' });
  });

  it('grava só o que difere do padrão e preserva o filtro de paciente', () => {
    const params = gravarFiltrosExames(new URLSearchParams('paciente=p1&status=agendado'), { status: 'todos', indicador: 'hoje' });
    expect(params.get('paciente')).toBe('p1');
    expect(params.has('status')).toBe(false);
    expect(params.get('indicador')).toBe('hoje');
  });
});
