import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pacienteDivergeDoRegistro, pacienteDoRegistro, paraIdentificacao } from '@/lib/pacienteDoRegistro';

const pacienteA = { id: 'paciente-a', nome: 'Paciente Sintético A' };
const pacienteB = { id: 'paciente-b', nome: 'Paciente Sintético B' };

describe('pacienteDivergeDoRegistro (CLIN-QA-545)', () => {
  it('não acusa divergência quando o registro e a tela apontam o mesmo paciente', () => {
    expect(pacienteDivergeDoRegistro('paciente-a', 'paciente-a')).toBe(false);
  });

  it('acusa divergência quando a tela mostra outro paciente', () => {
    expect(pacienteDivergeDoRegistro('paciente-a', 'paciente-b')).toBe(true);
  });

  it('acusa divergência quando a tela perdeu o paciente selecionado', () => {
    expect(pacienteDivergeDoRegistro('paciente-a', null)).toBe(true);
  });

  it('não acusa divergência sem registro aberto', () => {
    expect(pacienteDivergeDoRegistro(undefined, 'paciente-b')).toBe(false);
  });
});

describe('pacienteDoRegistro', () => {
  it('devolve o paciente carregado quando é o paciente do registro', () => {
    expect(pacienteDoRegistro('paciente-a', pacienteA)).toBe(pacienteA);
  });

  it('não devolve outro paciente, mesmo que esteja carregado', () => {
    expect(pacienteDoRegistro('paciente-a', pacienteB)).toBeNull();
  });

  it('devolve null sem registro ou sem paciente', () => {
    expect(pacienteDoRegistro(undefined, pacienteA)).toBeNull();
    expect(pacienteDoRegistro('paciente-a', null)).toBeNull();
  });
});

describe('paraIdentificacao', () => {
  it('converte a lista vazia do banco em alergias não informadas', () => {
    expect(paraIdentificacao({ nome: 'X', alergias: [] }).alergias).toBeNull();
    expect(paraIdentificacao({ nome: 'X', alergias: null }).alergias).toBeNull();
    expect(paraIdentificacao({ nome: 'X', alergias: ['  '] }).alergias).toBeNull();
  });

  it('mantém as alergias registradas', () => {
    expect(paraIdentificacao({ nome: 'X', alergias: ['Dipirona', ' Látex '] }).alergias).toEqual(['Dipirona', 'Látex']);
  });

  it('só inclui o convênio quando a tela o informa', () => {
    expect('convenio' in paraIdentificacao({ nome: 'X' })).toBe(false);
    expect(paraIdentificacao({ nome: 'X' }, 'Particular').convenio).toBe('Particular');
  });
});

// Regressão de CLIN-QA-545 na própria tela: lê o código-fonte de Prontuarios.tsx.
describe('Prontuarios.tsx mantém a invariante do paciente (CLIN-QA-545)', () => {
  const fonte = readFileSync(resolve(process.cwd(), 'src/pages/Prontuarios.tsx'), 'utf-8').replace(/\r\n/g, '\n');

  it('recusa gravar antes de qualquer escrita quando o paciente diverge', () => {
    const inicio = fonte.indexOf('const performSave = async');
    const guarda = fonte.indexOf('pacienteDivergeDoRegistro(currentProntuario.paciente_id, selectedPacienteId)', inicio);
    const primeiraEscrita = fonte.indexOf("supabase.from('prontuarios')", inicio);
    expect(inicio).toBeGreaterThan(-1);
    expect(guarda).toBeGreaterThan(inicio);
    expect(guarda).toBeLessThan(primeiraEscrita);
  });

  it('o diálogo de evolução não lê o paciente selecionado na lista', () => {
    const inicio = fonte.indexOf('<Dialog open={isProntuarioOpen}');
    const fim = fonte.indexOf('<Dialog open={showProtocols}');
    const dialogo = fonte.slice(inicio, fim);
    expect(inicio).toBeGreaterThan(-1);
    expect(dialogo).not.toMatch(/selectedPaciente\b/);
    expect(dialogo).not.toMatch(/selectedPacienteId\b/);
    expect(dialogo).toContain('<IdentificacaoPaciente');
  });

  it('o clique no rascunho invalida aberturas em andamento', () => {
    const clique = fonte.indexOf('setRascunhoParaAbrir(draft);');
    const trecho = fonte.slice(Math.max(0, clique - 300), clique);
    expect(trecho).toContain('prescricoesRequestRef.current += 1;');
  });
});
