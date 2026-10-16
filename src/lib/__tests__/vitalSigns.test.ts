import { describe, expect, it } from 'vitest';
import { formatVitalMeasurement } from '../vitalSigns';

describe('formatVitalMeasurement', () => {
  it('identifica medidas ausentes sem apresentá-las como normais', () => {
    expect(formatVitalMeasurement(null, 'bpm')).toBe('Não aferido');
    expect(formatVitalMeasurement(undefined, '°C')).toBe('Não aferido');
    expect(formatVitalMeasurement('   ', 'kg')).toBe('Não aferido');
  });

  it('preserva medidas preenchidas, inclusive zero', () => {
    expect(formatVitalMeasurement(72, 'bpm')).toBe('72 bpm');
    expect(formatVitalMeasurement(0, 'kg')).toBe('0 kg');
    expect(formatVitalMeasurement('120/80', 'mmHg')).toBe('120/80 mmHg');
    expect(formatVitalMeasurement(37.2, '°C')).toBe('37.2 °C');
  });
});
