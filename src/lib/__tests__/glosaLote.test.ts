import { describe, expect, it } from 'vitest';
import { executarEmSequencia, podePrepararRecurso, prontaParaEnvio } from '@/lib/glosaLote';

describe('glosaLote', () => {
  it('identifica glosas elegíveis para preparo e para envio', () => {
    expect(podePrepararRecurso({ id: '1', status: 'pendente' })).toBe(true);
    expect(podePrepararRecurso({ id: '1', status: 'recurso_enviado' })).toBe(false);
    expect(prontaParaEnvio({ id: '1', status: 'recurso_preparacao', recurso_justificativa: 'Justificativa ok', recurso_prazo: '2026-11-10', recurso_responsavel_id: 'u' })).toBe(true);
    expect(prontaParaEnvio({ id: '1', status: 'recurso_preparacao', recurso_justificativa: 'curta', recurso_prazo: '2026-11-10', recurso_responsavel_id: 'u' })).toBe(false);
  });

  it('continua depois de uma falha e informa o que falhou', async () => {
    const chamadas: string[] = [];
    const resultado = await executarEmSequencia(['a', 'b', 'c'], async id => {
      chamadas.push(id);
      if (id === 'b') throw new Error('falhou');
    });
    expect(chamadas).toEqual(['a', 'b', 'c']);
    expect(resultado.concluidas).toEqual(['a', 'c']);
    expect(resultado.falhas.map(f => f.id)).toEqual(['b']);
  });
});
