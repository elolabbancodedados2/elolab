import { describe, expect, it } from 'vitest';
import { gerarCsvVitais } from '@/lib/vitalsHistory';

describe('gerarCsvVitais', () => {
  it('exporta as medições com hora de Brasília e vírgula decimal', () => {
    const csv = gerarCsvVitais([{
      id: '1', paciente_id: 'p', created_at: '2026-10-10T15:30:00Z',
      pressao_sistolica: 120, pressao_diastolica: 80, frequencia_cardiaca: 72, frequencia_respiratoria: null,
      temperatura: 36.7, peso: 70.5, altura: null, imc: null, oxigenacao: 98, glicemia: null, dor_escala: 0,
    }]);
    const [cabecalho, linha] = csv.split('\r\n');
    expect(cabecalho.startsWith('"Data e hora";"PA sistólica"')).toBe(true);
    expect(linha).toBe('"10/10/2026 12:30";"120";"80";"72";"";"36,7";"70,5";"";"98";"";"0"');
  });
});
