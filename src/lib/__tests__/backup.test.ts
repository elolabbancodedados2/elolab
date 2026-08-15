import { describe, it, expect } from 'vitest';
import { validateBackup, clinicaDoBackup, TABELAS_QUE_NAO_SE_RESTAURA } from '@/lib/backup';

/**
 * `validateBackup` é o portão da restauração: é ele que decide se um arquivo
 * pode ser derramado por cima do banco da clínica. Recusar o que é lixo importa
 * mais do que aceitar o que é bom.
 */

const valido = {
  version: '3.0',
  createdAt: '2026-08-15T12:00:00.000Z',
  type: 'manual',
  completo: true,
  collections: { pacientes: [{ id: '1' }, { id: '2' }], agendamentos: [] },
  metadata: {
    totalRecords: 2, tablesCount: 2,
    tabelasComFalha: [], tabelasTruncadas: [], collectionCounts: { pacientes: 2, agendamentos: 0 },
  },
};

describe('validateBackup', () => {
  it('aceita um arquivo 3.0 completo', () => {
    const r = validateBackup(valido);
    expect(r.valid).toBe(true);
    expect(r.backup?.completo).toBe(true);
    expect(r.backup?.metadata.totalRecords).toBe(2);
  });

  it('preserva a marca de incompleto — é o que decide se dá para restaurar', () => {
    const r = validateBackup({
      ...valido,
      completo: false,
      metadata: { ...valido.metadata, tabelasComFalha: ['triagens: permission denied'] },
    });
    expect(r.backup?.completo).toBe(false);
    expect(r.backup?.metadata.tabelasComFalha).toEqual(['triagens: permission denied']);
  });

  it('lê arquivo antigo 2.0 sem os campos novos', () => {
    const r = validateBackup({
      version: '2.0.0',
      createdAt: '2026-05-01T00:00:00.000Z',
      collections: { pacientes: [{ id: 'a' }] },
    });
    expect(r.valid).toBe(true);
    expect(r.backup?.metadata.totalRecords).toBe(1);
    expect(r.backup?.metadata.tabelasComFalha).toEqual([]);
  });

  /**
   * Sem `completo` no arquivo, assumir `true` é a escolha certa: arquivo 2.0
   * antigo é o que a clínica tem guardado, e recusá-lo tiraria o único backup
   * dela na hora do aperto.
   */
  it('arquivo antigo sem a marca é tratado como completo', () => {
    const r = validateBackup({ version: '2.0.0', createdAt: 'x', collections: {} });
    expect(r.backup?.completo).toBe(true);
  });

  it('recusa arquivo vazio', () => {
    expect(validateBackup(null).valid).toBe(false);
    expect(validateBackup(undefined).valid).toBe(false);
  });

  it('recusa JSON que não é backup', () => {
    expect(validateBackup({ foo: 'bar' }).valid).toBe(false);
    expect(validateBackup({ version: '3.0' }).valid).toBe(false);
  });

  it('recusa collections que é lista em vez de objeto', () => {
    const r = validateBackup({ version: '3.0', createdAt: 'x', collections: [] });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('inválidas');
  });

  it('recusa coleção que não é lista, dizendo qual', () => {
    const r = validateBackup({
      version: '3.0', createdAt: 'x',
      collections: { pacientes: [{ id: '1' }], agendamentos: { id: 'nao-e-lista' } },
    });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('agendamentos');
  });

  it('recalcula o total quando o metadata mente', () => {
    // Arquivo editado à mão ou truncado no meio do download.
    const r = validateBackup({
      version: '3.0', createdAt: 'x',
      collections: { pacientes: [{ id: '1' }, { id: '2' }, { id: '3' }] },
      metadata: {},
    });
    expect(r.backup?.metadata.totalRecords).toBe(3);
    expect(r.backup?.metadata.collectionCounts).toEqual({ pacientes: 3 });
  });
});


/**
 * A restauração escreve por cima do banco de uma clínica em produção. Estes
 * testes cobrem as duas decisões que impedem isso de virar estrago: o que NÃO
 * se restaura, e de que clínica o arquivo é.
 */
describe('o que a restauração recusa a tocar', () => {
  it('não restaura contas, papéis nem a plataforma', () => {
    for (const t of ['platform_admins', 'user_roles', 'profiles', 'clinicas', 'plataforma_estado']) {
      expect(TABELAS_QUE_NAO_SE_RESTAURA.has(t)).toBe(true);
    }
  });

  it('não reescreve trilha de auditoria', () => {
    for (const t of ['audit_log', 'prontuario_acessos', 'lgpd_consent_log']) {
      expect(TABELAS_QUE_NAO_SE_RESTAURA.has(t)).toBe(true);
    }
  });

  it('mas restaura o dado clínico e financeiro, que é o motivo do backup', () => {
    for (const t of ['pacientes', 'agendamentos', 'prontuarios', 'lancamentos', 'pagamentos', 'triagens']) {
      expect(TABELAS_QUE_NAO_SE_RESTAURA.has(t)).toBe(false);
    }
  });
});

describe('clinicaDoBackup', () => {
  it('acha a clínica de origem na primeira linha que tiver', () => {
    expect(clinicaDoBackup({
      collections: { convenios: [{ id: '1' }], pacientes: [{ id: '2', clinica_id: 'cli-A' }] },
    } as any)).toBe('cli-A');
  });

  it('devolve null quando não dá para saber, em vez de chutar', () => {
    expect(clinicaDoBackup({ collections: { cid10: [{ id: '1' }] } } as any)).toBeNull();
    expect(clinicaDoBackup({ collections: {} } as any)).toBeNull();
  });
});
