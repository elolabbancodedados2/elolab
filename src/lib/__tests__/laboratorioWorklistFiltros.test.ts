import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gravarFiltrosWorklist, lerFiltrosWorklist, resumirPendenciasPorSetor } from '../laboratorioWorkflow';

const SETOR = '7b0f3a52-1c1e-4f7a-9a51-0d8e3f2c9b10';

describe('filtros da worklist preservados na URL', () => {
  it('usa padrões quando a URL não tem filtros e ignora valores inválidos', () => {
    expect(lerFiltrosWorklist(new URLSearchParams())).toEqual({ status: 'todos', setor: 'todos', periodo: 'hoje', urgente: false });
    expect(lerFiltrosWorklist(new URLSearchParams('status=hack&setor=x;drop&periodo=ano&urgente=talvez')))
      .toEqual({ status: 'todos', setor: 'todos', periodo: 'hoje', urgente: false });
  });

  it('lê setor, status, período e prioridade gravados', () => {
    const params = gravarFiltrosWorklist(new URLSearchParams('aba=worklist'), { status: 'em_analise', setor: SETOR, periodo: '7dias', urgente: true });
    expect(params.get('aba')).toBe('worklist');
    expect(lerFiltrosWorklist(params)).toEqual({ status: 'em_analise', setor: SETOR, periodo: '7dias', urgente: true });
  });

  it('remove da URL os filtros que voltaram ao padrão', () => {
    const params = gravarFiltrosWorklist(new URLSearchParams(`setor=${SETOR}&urgente=1`), { status: 'todos', setor: 'todos', periodo: 'hoje', urgente: false });
    expect(params.toString()).toBe('');
  });
});

describe('pendências por setor e prioridade', () => {
  it('conta pendentes e urgentes por setor, com urgentes primeiro e amostras sem setor separadas', () => {
    const resumo = resumirPendenciasPorSetor(
      [
        { setor_id: 'b', urgente: false }, { setor_id: 'b', urgente: false }, { setor_id: 'b', urgente: false },
        { setor_id: 'a', urgente: true }, { setor_id: 'a', urgente: false },
        { setor_id: null, urgente: true },
      ],
      [{ id: 'a', nome: 'Bioquímica' }, { id: 'b', nome: 'Hematologia' }, { id: 'c', nome: 'Urinálise' }],
    );
    expect(resumo).toEqual([
      { id: 'a', nome: 'Bioquímica', total: 2, urgentes: 1 },
      { id: null, nome: 'Sem setor', total: 1, urgentes: 1 },
      { id: 'b', nome: 'Hematologia', total: 3, urgentes: 0 },
    ]);
  });

  it('a worklist usa os filtros da URL e mostra as pendências por setor', () => {
    const tela = readFileSync('src/pages/Laboratorio.tsx', 'utf8');
    expect(tela).toMatch(/lerFiltrosWorklist\(searchParams\)/);
    expect(tela).toMatch(/gravarFiltrosWorklist\(/);
    expect(tela).toMatch(/aria-label="Pendências por setor"/);
  });
});
