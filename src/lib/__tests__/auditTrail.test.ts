import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A trilha de auditoria do prontuário é exigência da CFM 1.821/07 e roda em
 * computador de recepção compartilhado. Os dois riscos andam juntos: perder o
 * registro (não prova nada) e guardá-lo demais (vaza dado de paciente para o
 * turno seguinte).
 *
 * Estes testes travam os dois lados.
 */

const inserts: any[] = [];
let respostaDoInsert: { error: any } = { error: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: (linha: any) => {
        inserts.push(linha);
        return Promise.resolve(respostaDoInsert);
      },
    }),
  },
}));

const CHAVE = 'auditoria_pendente';

const entrada = {
  action: 'access' as any,
  collection: 'prontuarios',
  recordId: 'prontuario-1',
  recordName: 'Maria Aparecida da Silva', // nome de paciente: não pode vazar
  userId: 'user-1',
  userName: 'Dra. Ana',
};

beforeEach(() => {
  inserts.length = 0;
  respostaDoInsert = { error: null };
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('gravação bem-sucedida', () => {
  it('grava e não deixa nada na fila', async () => {
    const { logAudit } = await import('@/lib/auditTrail');
    const ok = await logAudit(entrada);

    expect(ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(sessionStorage.getItem(CHAVE)).toBeNull();
  });

  it('o registro gravado direto leva o nome (só a FILA é que omite)', async () => {
    const { logAudit } = await import('@/lib/auditTrail');
    await logAudit(entrada);
    expect(inserts[0].record_name).toBe('Maria Aparecida da Silva');
  });
});

describe('falha ao gravar', () => {
  it('devolve false e enfileira para reenvio', async () => {
    respostaDoInsert = { error: { message: 'timeout', code: '08006' } };
    const { logAudit } = await import('@/lib/auditTrail');

    const ok = await logAudit(entrada);
    expect(ok).toBe(false);

    const fila = JSON.parse(sessionStorage.getItem(CHAVE) || '[]');
    expect(fila).toHaveLength(1);
  });

  /**
   * O ponto mais importante deste arquivo. Uma versão anterior guardava
   * `record_name` (nome do paciente) e `changes` (qualquer campo do prontuário)
   * no `localStorage` — que sobrevive à troca de turno num PC compartilhado e
   * contraria o compromisso do próprio projeto de não deixar rastro clínico.
   */
  it('a fila NÃO guarda nome de paciente nem conteúdo clínico', async () => {
    respostaDoInsert = { error: { message: 'timeout', code: '08006' } };
    const { logAudit } = await import('@/lib/auditTrail');

    await logAudit({
      ...entrada,
      changes: [{ field: 'hipotese_diagnostica', oldValue: 'x', newValue: 'HIV+' }],
    });

    const bruto = sessionStorage.getItem(CHAVE) || '';
    expect(bruto).not.toContain('Maria Aparecida');
    expect(bruto).not.toContain('HIV+');
    expect(bruto).not.toContain('hipotese_diagnostica');
    expect(bruto).not.toContain('Dra. Ana');

    // Mas o essencial para a norma continua: quem, o quê, onde.
    const fila = JSON.parse(bruto);
    expect(fila[0].record_id).toBe('prontuario-1');
    expect(fila[0].user_id).toBe('user-1');
    expect(fila[0].action).toBe('access');
  });

  it('usa sessionStorage, não localStorage', async () => {
    respostaDoInsert = { error: { message: 'timeout', code: '08006' } };
    const { logAudit } = await import('@/lib/auditTrail');
    await logAudit(entrada);

    expect(sessionStorage.getItem(CHAVE)).not.toBeNull();
    expect(localStorage.getItem(CHAVE), 'vazou para o localStorage').toBeNull();
  });

  it('a fila não cresce sem limite', async () => {
    respostaDoInsert = { error: { message: 'timeout', code: '08006' } };
    const { logAudit } = await import('@/lib/auditTrail');

    for (let i = 0; i < 260; i++) {
      await logAudit({ ...entrada, recordId: `p-${i}` });
    }

    const fila = JSON.parse(sessionStorage.getItem(CHAVE) || '[]');
    expect(fila.length).toBeLessThanOrEqual(200);
    // Mantém as mais recentes.
    expect(fila[fila.length - 1].record_id).toBe('p-259');
  });
});

describe('reenvio da fila', () => {
  it('escoa o que ficou pendente na próxima gravação bem-sucedida', async () => {
    const { logAudit } = await import('@/lib/auditTrail');

    respostaDoInsert = { error: { message: 'timeout', code: '08006' } };
    await logAudit({ ...entrada, recordId: 'pendente-1' });
    expect(JSON.parse(sessionStorage.getItem(CHAVE)!)).toHaveLength(1);

    respostaDoInsert = { error: null };
    await logAudit({ ...entrada, recordId: 'nova' });

    expect(sessionStorage.getItem(CHAVE)).toBeNull();
    expect(inserts.some(i => i.record_id === 'pendente-1')).toBe(true);
  });

  /**
   * O reenvio era `insert(fila)` em lote, que é atômico: uma linha inválida
   * fazia o lote inteiro falhar para sempre e travava a fila, inclusive para
   * os registros válidos atrás dela.
   */
  it('linha inválida é descartada em vez de travar a fila', async () => {
    const { logAudit } = await import('@/lib/auditTrail');

    respostaDoInsert = { error: { message: 'timeout', code: '08006' } };
    await logAudit({ ...entrada, recordId: 'ruim' });
    await logAudit({ ...entrada, recordId: 'boa' });
    expect(JSON.parse(sessionStorage.getItem(CHAVE)!)).toHaveLength(2);

    // Agora a gravação nova passa, e o reenvio encontra violação de constraint
    // (código 23xxx) nas pendentes: elas não podem ficar bloqueando para sempre.
    let chamada = 0;
    respostaDoInsert = { error: null };
    const original = await import('@/integrations/supabase/client');
    vi.spyOn(original.supabase, 'from').mockImplementation((() => ({
      insert: (linha: any) => {
        inserts.push(linha);
        chamada++;
        // a primeira é a gravação nova (ok); as seguintes são o reenvio
        return Promise.resolve(
          chamada === 1 ? { error: null } : { error: { message: 'fk violada', code: '23503' } },
        );
      },
    })) as any);

    await logAudit({ ...entrada, recordId: 'nova' });

    // Fila esvaziada: as inválidas foram descartadas com log, não represadas.
    expect(sessionStorage.getItem(CHAVE)).toBeNull();
  });
});

describe('logout', () => {
  it('limparAuditoriaPendente esvazia a fila', async () => {
    respostaDoInsert = { error: { message: 'timeout', code: '08006' } };
    const { logAudit, limparAuditoriaPendente } = await import('@/lib/auditTrail');

    await logAudit(entrada);
    expect(sessionStorage.getItem(CHAVE)).not.toBeNull();

    limparAuditoriaPendente();
    expect(sessionStorage.getItem(CHAVE)).toBeNull();
  });
});
