import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  aplicarVariaveis, calcularNps, classificarNota, evolucaoMensal, inserirVariavel, leituraNps,
  normalizarPrevia, npsPorMedico, previaMensagem, resumoResultado, validarRascunho, MENSAGEM_PADRAO,
} from '../relacionamento';
import { mensagemDeCampanha } from '../../../supabase/functions/_shared/notificationDeliveryPolicy';

describe('cálculo do NPS (notas de 1 a 5)', () => {
  it('classifica pelo mesmo corte da view nps_resumo_mensal', () => {
    expect(classificarNota(5)).toBe('promotor');
    expect(classificarNota(4)).toBe('neutro');
    expect(classificarNota(3)).toBe('neutro');
    expect(classificarNota(2)).toBe('detrator');
    expect(classificarNota(1)).toBe('detrator');
    expect(classificarNota(0)).toBeNull();
    expect(classificarNota(6)).toBeNull();
  });

  it('calcula o NPS e a distribuição', () => {
    const r = calcularNps([5, 5, 5, 5, 5, 4, 3, 2, 1, 1]);
    expect(r).toMatchObject({ total: 10, promotores: 5, neutros: 2, detratores: 3, nps: 20 });
    expect(r.pctPromotores + r.pctNeutros + r.pctDetratores).toBe(100);
    expect([r.pctPromotores, r.pctNeutros, r.pctDetratores]).toEqual([50, 20, 30]);
  });

  it('fecha os percentuais em 100 quando há dízimas', () => {
    const r = calcularNps([5, 3, 1]);
    expect(r.pctPromotores + r.pctNeutros + r.pctDetratores).toBe(100);
    expect(r.nps).toBe(0);
  });

  it('devolve null sem avaliações e ignora notas fora da escala', () => {
    expect(calcularNps([]).nps).toBeNull();
    expect(calcularNps([7, 0]).total).toBe(0);
    expect(leituraNps(null)).toBe('Sem avaliações no período');
    expect(leituraNps(-10)).toBe('Precisa de atenção');
    expect(leituraNps(80)).toBe('Excelente');
  });

  it('monta a evolução mensal a partir da view, em ordem', () => {
    const e = evolucaoMensal([
      { mes: '2026-10-01T00:00:00+00:00', total: 4, promotores: 3, neutros: 0, detratores: 1 },
      { mes: '2026-09-01T00:00:00+00:00', total: 2, promotores: 0, neutros: 0, detratores: 2 },
    ]);
    expect(e).toEqual([
      { mes: '2026-09', rotulo: 'set/26', total: 2, nps: -100 },
      { mes: '2026-10', rotulo: 'out/26', total: 4, nps: 50 },
    ]);
  });

  it('agrupa por profissional, com os de mais avaliações primeiro', () => {
    const lista = npsPorMedico([
      { nota: 5, created_at: null, medico_id: 'a', medico_nome: 'Dra. Ana' },
      { nota: 1, created_at: null, medico_id: 'b', medico_nome: 'Dr. Bruno' },
      { nota: 5, created_at: null, medico_id: 'b', medico_nome: 'Dr. Bruno' },
      { nota: 4, created_at: null, medico_id: null },
    ]);
    expect(lista.map((m) => [m.nome, m.total, m.nps])).toEqual([
      ['Dr. Bruno', 2, 0],
      ['Dra. Ana', 1, 100],
      ['Sem profissional', 1, 0],
    ]);
  });
});

describe('variáveis e prévia da campanha', () => {
  it('substitui todas as ocorrências como a função do banco', () => {
    expect(aplicarVariaveis('Oi {{primeiro_nome}}! {{nome}}, a {{clinica}} lembra de você, {{primeiro_nome}}.', {
      nome: '  Maria da Silva ', clinica: 'Clínica Sol',
    })).toBe('Oi Maria! Maria da Silva, a Clínica Sol lembra de você, Maria.');
  });

  it('usa textos neutros quando falta nome ou clínica', () => {
    expect(aplicarVariaveis('{{primeiro_nome}} / {{nome}} / {{clinica}}', { nome: '', clinica: null }))
      .toBe('paciente / paciente / a clínica');
  });

  it('mostra a prévia com o primeiro paciente do público ou um exemplo', () => {
    const previa = normalizarPrevia({ total: 3, amostra: [{ id: 'p1', nome: 'João Lima' }, { id: 'p2', nome: 'Ana' }], clinica: 'EloLab Centro' });
    expect(previaMensagem('Olá, {{primeiro_nome}} da {{clinica}}', previa)).toEqual({
      exemplo: false, destinatario: 'João Lima', texto: 'Olá, João da EloLab Centro',
    });
    const vazia = previaMensagem('Olá, {{primeiro_nome}}', normalizarPrevia({ total: 0, amostra: [] }));
    expect(vazia.exemplo).toBe(true);
    expect(vazia.texto).toBe('Olá, Maria');
  });

  it('normaliza a resposta da RPC e nunca guarda mais que 20 nomes', () => {
    const amostra = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, nome: `P${i}`, telefone: '11999990000' }));
    const previa = normalizarPrevia({ total: '30', amostra });
    expect(previa.total).toBe(30);
    expect(previa.amostra).toHaveLength(20);
    expect(previa.amostra[0]).toEqual({ id: 'p0', nome: 'P0' });
    expect(normalizarPrevia(null)).toEqual({ total: 0, amostra: [], clinica: null });
  });

  it('insere a variável no cursor', () => {
    expect(inserirVariavel('Olá, !', '{{nome}}', 5)).toEqual({ texto: 'Olá, {{nome}}!', cursor: 13 });
    expect(inserirVariavel('Olá XX', '{{nome}}', 4, 6).texto).toBe('Olá {{nome}}');
    expect(inserirVariavel('Oi', '{{clinica}}').texto).toBe('Oi{{clinica}}');
  });

  it('valida o rascunho', () => {
    const base = { nome: 'Retorno', canal: 'whatsapp' as const, publico: 'ativos' as const, publico_dias: 180, mensagem: MENSAGEM_PADRAO.ativos, agendada_para: null };
    expect(validarRascunho(base)).toBeNull();
    expect(validarRascunho({ ...base, nome: 'a' })).toMatch(/nome/);
    expect(validarRascunho({ ...base, publico_dias: 0 })).toMatch(/dias/);
    expect(validarRascunho({ ...base, agendada_para: 'amanhã' })).toMatch(/Data/);
  });

  it('resume o resultado da fila, somando incertos aos erros', () => {
    expect(resumoResultado({ campanha_id: 'c', pendente: 2, enviando: 1, enviado: 10, erro: 1, cancelado: 3, incerto: 1 }))
      .toEqual({ enviados: 10, erros: 2, pendentes: 3, cancelados: 3 });
    expect(resumoResultado(undefined)).toEqual({ enviados: 0, erros: 0, pendentes: 0, cancelados: 0 });
  });
});

describe('contrato com a fila de notificações', () => {
  const migration = readFileSync('supabase/migrations/20261031122000_campanhas_relacionamento.sql', 'utf8');
  const worker = readFileSync('supabase/functions/process-notification-queue/index.ts', 'utf8');

  it('enfileira itens pendentes, idempotentes e limitados', () => {
    expect(migration).toMatch(/^[\s\S]*BEGIN;[\s\S]*COMMIT;\s*$/);
    expect(migration).toContain("'pendente', v_envio");
    expect(migration).toContain("jsonb_build_object('tipo', 'campanha', 'campanha_id', v_campanha.id)");
    expect(migration).toContain("'campanha:' || v_campanha.id || ':' || x.paciente_id");
    expect(migration).toContain('ON CONFLICT (clinica_id, tipo, dedupe_key) DO NOTHING');
    expect(migration).toContain('v_limite constant integer := 2000');
    expect(migration).toContain("IN ('ambos', 'whatsapp')");
    expect(migration).toContain("IN ('ambos', 'email')");
    const semComentarios = migration.split('\n').filter((linha) => !linha.trim().startsWith('--')).join('\n');
    expect(semComentarios).not.toMatch(/\b(lancamentos|pagamentos_mercadopago)\b/);
  });

  it('a edge function revalida preferência e janela também para campanhas', () => {
    expect(worker).toContain('if (lembreteDeConsulta || mensagemDeCampanha(dadosExtras)) {');
    expect(mensagemDeCampanha({ tipo: 'campanha', campanha_id: 'c1' })).toBe(true);
    expect(mensagemDeCampanha({ tipo: 'aniversario' })).toBe(false);
    expect(mensagemDeCampanha(undefined)).toBe(false);
  });
});
