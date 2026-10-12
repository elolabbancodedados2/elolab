import { describe, expect, it } from 'vitest';
import { autorizarAcaoMemed } from '../../../supabase/functions/_shared/memedAuthorization';

const medico = { user_id: 'medico-1', clinica_id: 'clinica-1', ativo: true };

describe('autorização do prescritor na integração Memed', () => {
  it('permite preparar e registrar eventos somente para o próprio médico ativo', () => {
    expect(autorizarAcaoMemed('prepare', 'medico-1', ['medico'], medico, 'clinica-1')).toBe(true);
    expect(autorizarAcaoMemed('prescription_printed', 'medico-1', ['medico'], medico, 'clinica-1')).toBe(true);
  });

  it('nega recepção/financeiro mesmo quando o médico informado pertence à clínica', () => {
    expect(autorizarAcaoMemed('prepare', 'recepcao-1', ['recepcao'], medico, 'clinica-1')).toBe(false);
    expect(autorizarAcaoMemed('prescription_deleted', 'financeiro-1', ['financeiro'], medico, 'clinica-1')).toBe(false);
  });

  it('nega médico que tente agir em nome de outro profissional', () => {
    expect(autorizarAcaoMemed('prepare', 'medico-2', ['medico'], medico, 'clinica-1')).toBe(false);
  });

  it('nega prescritor inativo ou de outra clínica', () => {
    expect(autorizarAcaoMemed('prepare', 'medico-1', ['medico'], { ...medico, ativo: false }, 'clinica-1')).toBe(false);
    expect(autorizarAcaoMemed('prepare', 'medico-1', ['medico'], medico, 'clinica-2')).toBe(false);
  });
});
